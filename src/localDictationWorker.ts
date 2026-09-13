import { ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DictationErrorCode,
  ffmpegCaptureArgs,
  ValidatedDictationOptions,
  WorkerEvent,
  WorkerRequest,
} from "./localDictation";

const MAX_TRANSCRIPT_BYTES = 1024 * 1024;
const PROCESS_EXIT_TIMEOUT_MS = 3_000;

function isStartRequest(value: unknown): value is Extract<WorkerRequest, { type: "start" }> {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<Extract<WorkerRequest, { type: "start" }>>;
  return request.type === "start" && Number.isInteger(request.generation) && !!request.options;
}

function isControlRequest(
  value: unknown,
  type: "stop" | "cancel",
  generation: number
): boolean {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return request.type === type && request.generation === generation;
}

function send(event: WorkerEvent): void {
  if (process.connected) process.send?.(event);
}

/** Normalize only CLI framing; do not perform language or LLM cleanup. */
export function normalizeWhisperOutput(value: string): string {
  return value
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

class DictationWorker {
  private tempDirectory?: string;
  private recordingPath?: string;
  private capture?: ChildProcess;
  private inference?: ChildProcess;
  private stopping = false;
  private finished = false;
  private stopStartedAt?: number;
  private peakRssBytes = process.memoryUsage().rss;

  constructor(
    readonly generation: number,
    private readonly options: ValidatedDictationOptions
  ) {}

  async start(): Promise<void> {
    try {
      this.tempDirectory = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "dshmux-dictation-")
      );
      this.recordingPath = path.join(this.tempDirectory, "recording.wav");
      const platform = this.options.platformKey === "win32-x64" ? "win32" : "darwin";
      const capture = spawn(
        this.options.ffmpegPath,
        ffmpegCaptureArgs(platform, this.options.audioDevice, this.recordingPath),
        {
          shell: false,
          stdio: ["pipe", "ignore", "ignore"],
          windowsHide: true,
        }
      );
      this.capture = capture;
      capture.once("exit", () => {
        if (!this.stopping && !this.finished) void this.fail("ffmpeg-unavailable");
      });
      await new Promise<void>((resolve, reject) => {
        capture.once("spawn", resolve);
        capture.once("error", reject);
      });
      send({ type: "ready", generation: this.generation });
    } catch {
      await this.fail("ffmpeg-unavailable");
    }
  }

  async stop(): Promise<void> {
    if (this.stopping || this.finished) return;
    this.stopping = true;
    this.stopStartedAt = Date.now();
    try {
      await this.finishCapture();
      const text = await this.transcribe();
      const metrics: WorkerEvent = {
        type: "metrics",
        generation: this.generation,
        stopToFinalMs: Date.now() - this.stopStartedAt,
        peakRssBytes: this.peakRssBytes,
      };
      await this.cleanup();
      if (this.finished) return;
      this.finished = true;
      send(metrics);
      send({ type: "transcript", generation: this.generation, phase: "complete", text });
      process.disconnect?.();
    } catch {
      await this.fail("worker-failed");
    }
  }

  async cancel(): Promise<void> {
    if (this.finished) return;
    this.stopping = true;
    await this.cleanup();
    this.finished = true;
    process.disconnect?.();
  }

  private async finishCapture(): Promise<void> {
    const capture = this.capture;
    if (!capture) throw new Error("capture unavailable");
    if (capture.exitCode !== null || capture.signalCode !== null) {
      this.capture = undefined;
      if (capture.exitCode !== 0) throw new Error("capture failed");
      return;
    }
    const exited = this.waitForExit(capture, false);
    capture.stdin?.end("q\n");
    const code = await exited;
    this.capture = undefined;
    if (code !== 0) throw new Error("capture failed");
  }

  private async transcribe(): Promise<string> {
    if (!this.recordingPath) throw new Error("recording unavailable");
    const inference = spawn(
      this.options.whisperPath,
      [
        "--model",
        this.options.modelPath,
        "--file",
        this.recordingPath,
        "--language",
        this.options.whisperLanguage,
        "--no-timestamps",
        "--no-prints",
      ],
      {
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }
    );
    this.inference = inference;
    const chunks: Buffer[] = [];
    let bytes = 0;
    let overflow = false;
    inference.stdout?.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_TRANSCRIPT_BYTES) {
        overflow = true;
        inference.kill();
        return;
      }
      chunks.push(Buffer.from(chunk));
      this.sampleMemory();
    });
    const spawned = new Promise<void>((resolve, reject) => {
      inference.once("spawn", resolve);
      inference.once("error", reject);
    });
    const exited = this.waitForExit(inference, true);
    const [, code] = await Promise.all([spawned, exited]);
    this.inference = undefined;
    if (overflow || code !== 0) throw new Error("inference failed");
    const text = normalizeWhisperOutput(Buffer.concat(chunks).toString("utf8"));
    if (!text) throw new Error("empty transcript");
    return text;
  }

  private waitForExit(child: ChildProcess, killOnTimeout: boolean): Promise<number | null> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (value: number | null, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        if (killOnTimeout) child.kill();
        finish(null, new Error("process exit timeout"));
      }, PROCESS_EXIT_TIMEOUT_MS);
      timer.unref?.();
      child.once("error", (error) => finish(null, error));
      child.once("exit", (code) => finish(code));
    });
  }

  private async terminate(child: ChildProcess | undefined): Promise<void> {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    child.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, PROCESS_EXIT_TIMEOUT_MS);
      timer.unref?.();
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async cleanup(): Promise<void> {
    const capture = this.capture;
    const inference = this.inference;
    this.capture = undefined;
    this.inference = undefined;
    await Promise.all([
      this.terminate(capture).catch(() => undefined),
      this.terminate(inference).catch(() => undefined),
    ]);
    if (this.tempDirectory) {
      const tempDirectory = this.tempDirectory;
      this.tempDirectory = undefined;
      this.recordingPath = undefined;
      await fs.promises.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async fail(errorCode: DictationErrorCode): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    this.stopping = true;
    await this.cleanup();
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
    if (isControlRequest(message, "stop", worker.generation)) {
      void worker.stop();
    } else if (isControlRequest(message, "cancel", worker.generation)) {
      void worker.cancel();
    }
  });
  process.once("disconnect", () => void worker?.cancel());
}

if (require.main === module) runWorkerProcess();
