import { ChildProcess, spawn } from "node:child_process";
import {
  DictationErrorCode,
  ValidatedDictationOptions,
  WorkerEvent,
  WorkerRequest,
} from "./localDictation";

const MAX_HOST_OUTPUT_BYTES = 1024 * 1024;
const PROCESS_EXIT_TIMEOUT_MS = 3_000;

type HostEvent =
  | { event: "ready" }
  | { event: "transcript"; phase: "partial" | "final"; text: string }
  | { event: "cancelled" }
  | { event: "error"; code: string };

function isStartRequest(value: unknown): value is Extract<WorkerRequest, { type: "start" }> {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<Extract<WorkerRequest, { type: "start" }>>;
  return request.type === "start" && Number.isInteger(request.generation) && !!request.options;
}

function isControlRequest(value: unknown, type: "stop" | "cancel", generation: number): boolean {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return request.type === type && request.generation === generation;
}

function send(event: WorkerEvent): void {
  if (process.connected) process.send?.(event);
}

export function parseHostEvent(line: string): HostEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const event = value as Record<string, unknown>;
  if (event.event === "ready" || event.event === "cancelled") return { event: event.event };
  if (
    event.event === "transcript" &&
    (event.phase === "partial" || event.phase === "final") &&
    typeof event.text === "string"
  ) {
    return { event: "transcript", phase: event.phase, text: event.text };
  }
  if (event.event === "error" && typeof event.code === "string") {
    return { event: "error", code: event.code };
  }
  return undefined;
}

class DictationWorker {
  private host?: ChildProcess;
  private output = "";
  private stopping = false;
  private finished = false;
  private ready = false;
  private stopStartedAt?: number;
  private firstTranscriptAt?: number;
  private readonly startedAt = Date.now();
  private peakRssBytes = process.memoryUsage().rss;

  constructor(
    readonly generation: number,
    private readonly options: ValidatedDictationOptions
  ) {}

  async start(): Promise<void> {
    try {
      const host = spawn(
        this.options.hostPath,
        [
          "--model", this.options.modelPath,
          "--language", this.options.whisperLanguage,
          "--capture-id", String(this.options.captureId),
          "--partial-ms", "750",
        ],
        { shell: false, stdio: ["pipe", "pipe", "ignore"], windowsHide: true }
      );
      this.host = host;
      host.stdout?.setEncoding("utf8");
      host.stdout?.on("data", (chunk: string) => this.onOutput(chunk));
      host.once("error", () => void this.fail("host-unavailable"));
      host.once("exit", (code) => this.onExit(code));
      await new Promise<void>((resolve, reject) => {
        host.once("spawn", resolve);
        host.once("error", reject);
      });
    } catch {
      await this.fail("host-unavailable");
    }
  }

  async stop(): Promise<void> {
    if (this.stopping || this.finished) return;
    this.stopping = true;
    this.stopStartedAt = Date.now();
    this.writeCommand("stop");
  }

  async cancel(): Promise<void> {
    if (this.finished) return;
    this.stopping = true;
    this.writeCommand("cancel");
    await this.terminate();
    this.finished = true;
    process.disconnect?.();
  }

  private writeCommand(command: "stop" | "cancel"): void {
    const host = this.host;
    if (!host?.stdin || host.exitCode !== null || host.signalCode !== null) return;
    host.stdin.write(`${JSON.stringify({ command })}\n`);
    if (command === "stop") host.stdin.end();
  }

  private onOutput(chunk: string): void {
    if (this.finished) return;
    this.output += chunk;
    if (Buffer.byteLength(this.output, "utf8") > MAX_HOST_OUTPUT_BYTES) {
      void this.fail("worker-failed");
      return;
    }
    let newline = this.output.indexOf("\n");
    while (newline >= 0) {
      const line = this.output.slice(0, newline).trim();
      this.output = this.output.slice(newline + 1);
      if (line) this.onHostEvent(parseHostEvent(line));
      newline = this.output.indexOf("\n");
    }
  }

  private onHostEvent(event: HostEvent | undefined): void {
    if (!event || this.finished) {
      if (!event) void this.fail("invalid-message");
      return;
    }
    this.sampleMemory();
    if (event.event === "ready") {
      if (this.ready || this.stopping) return;
      this.ready = true;
      send({ type: "ready", generation: this.generation });
      return;
    }
    if (event.event === "error") {
      const code: DictationErrorCode = event.code === "model-unavailable"
        ? "model-unavailable"
        : event.code === "microphone-unavailable"
          ? "microphone-unavailable"
          : "worker-failed";
      void this.fail(code);
      return;
    }
    if (event.event === "cancelled") return;
    if (!this.firstTranscriptAt) this.firstTranscriptAt = Date.now();
    const phase = event.phase === "final" ? "complete" : "interim";
    if (phase === "interim" && this.stopping) return;
    if (phase === "complete" && !this.stopping) {
      void this.fail("invalid-message");
      return;
    }
    send({ type: "transcript", generation: this.generation, phase, text: event.text });
    if (phase === "complete") {
      send({
        type: "metrics",
        generation: this.generation,
        firstTranscriptMs: this.firstTranscriptAt - this.startedAt,
        stopToFinalMs: this.stopStartedAt ? Date.now() - this.stopStartedAt : undefined,
        peakRssBytes: this.peakRssBytes,
      });
      this.finished = true;
    }
  }

  private onExit(code: number | null): void {
    this.host = undefined;
    if (this.finished) {
      process.disconnect?.();
      return;
    }
    void this.fail(this.ready && code !== 0 ? "worker-failed" : "host-unavailable");
  }

  private async terminate(): Promise<void> {
    const host = this.host;
    this.host = undefined;
    if (!host || host.exitCode !== null || host.signalCode !== null) return;
    host.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PROCESS_EXIT_TIMEOUT_MS);
      timer.unref?.();
      host.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async fail(errorCode: DictationErrorCode): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stopping = true;
    await this.terminate();
    send({ type: "error", generation: this.generation, errorCode });
    process.disconnect?.();
  }

  private sampleMemory(): void {
    this.peakRssBytes = Math.max(this.peakRssBytes, process.memoryUsage().rss);
  }
}

export function runWorkerProcess(): void {
  let worker: DictationWorker | undefined;
  process.on("message", (message: unknown) => {
    if (!worker) {
      if (!isStartRequest(message)) {
        send({ type: "error", generation: 1, errorCode: "invalid-message" });
        process.disconnect?.();
        return;
      }
      worker = new DictationWorker(message.generation, message.options);
      void worker.start();
      return;
    }
    if (isControlRequest(message, "stop", worker.generation)) void worker.stop();
    else if (isControlRequest(message, "cancel", worker.generation)) void worker.cancel();
  });
  process.once("disconnect", () => void worker?.cancel());
}

if (require.main === module) runWorkerProcess();
