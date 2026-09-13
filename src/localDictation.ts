import { ChildProcess, ForkOptions, fork as nodeFork } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { managedModelPath } from "./localDictationModel.js";

export const LOCAL_DICTATION_DSH_VERSION = "0.1.5-rc.2";

export type LocalDictationLanguage = "en-US" | "et-EE";
export type LocalDictationState =
  | "idle"
  | "preparing"
  | "listening"
  | "stopping"
  | "error";

export type DictationErrorCode =
  | "disabled"
  | "remote-host"
  | "unsupported-platform"
  | "host-unavailable"
  | "model-unavailable"
  | "microphone-unavailable"
  | "busy"
  | "timeout"
  | "worker-failed"
  | "invalid-message";

export class LocalDictationError extends Error {
  constructor(
    readonly code: DictationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "LocalDictationError";
  }
}

export interface LocalDictationSettings {
  enabled: boolean;
  language: LocalDictationLanguage;
  hostPath: string;
  audioDevice: string;
}

export interface LocalDictationEnvironment {
  platform: NodeJS.Platform;
  arch: string;
  remoteName?: string;
  extensionPath: string;
  homePath: string;
}

export interface ValidatedDictationOptions {
  platformKey: "darwin-arm64" | "win32-x64";
  whisperLanguage: "en" | "et";
  hostPath: string;
  modelPath: string;
  captureId: number;
}

export interface PreflightIo {
  access(filePath: string, mode?: number): Promise<void>;
}

const DEFAULT_IO: PreflightIo = {
  access: (filePath, mode) => fs.promises.access(filePath, mode),
};

function platformKey(
  environment: LocalDictationEnvironment
): "darwin-arm64" | "win32-x64" {
  if (environment.remoteName) {
    throw new LocalDictationError(
      "remote-host",
      "Local dictation is available only in a local VS Code window."
    );
  }
  if (environment.platform === "darwin" && environment.arch === "arm64") {
    return "darwin-arm64";
  }
  if (environment.platform === "win32" && environment.arch === "x64") {
    return "win32-x64";
  }
  throw new LocalDictationError(
    "unsupported-platform",
    "This prototype supports only macOS Arm64 and Windows x64."
  );
}

export function supportsLocalDictationTarget(
  platform: NodeJS.Platform,
  arch: string
): boolean {
  return (
    (platform === "darwin" && arch === "arm64") ||
    (platform === "win32" && arch === "x64")
  );
}

async function requireFile(
  io: PreflightIo,
  code: DictationErrorCode,
  message: string,
  filePath: string,
  mode: number
): Promise<string> {
  if (!path.isAbsolute(filePath)) throw new LocalDictationError(code, message);
  try {
    await io.access(filePath, mode);
    return filePath;
  } catch {
    throw new LocalDictationError(code, message);
  }
}

async function resolveHost(
  environment: LocalDictationEnvironment,
  configuredPath: string,
  io: PreflightIo
): Promise<string> {
  if (configuredPath) {
    if (!path.isAbsolute(configuredPath)) {
      throw new LocalDictationError(
        "host-unavailable",
        "The configured dictation host path must be absolute."
      );
    }
    return requireFile(io, "host-unavailable", "The dictation host is unavailable.", configuredPath, fs.constants.X_OK);
  }
  const target = platformKey(environment);
  const executable = target === "win32-x64" ? "dsh-dictation-host.exe" : "dsh-dictation-host";
  return requireFile(
    io,
    "host-unavailable",
    `The bundled dictation host for ${target} is unavailable.`,
    path.join(environment.extensionPath, "runtime", target, executable),
    fs.constants.X_OK
  );
}

/** Resolve bundled and managed local dependencies without modifying them. */
export async function preflightLocalDictation(
  environment: LocalDictationEnvironment,
  settings: LocalDictationSettings,
  io: PreflightIo = DEFAULT_IO
): Promise<ValidatedDictationOptions> {
  if (!settings.enabled) {
    throw new LocalDictationError("disabled", "Experimental local dictation is disabled.");
  }
  const target = platformKey(environment);
  const canonicalModelPath = managedModelPath(environment.homePath);
  const modelPath = await requireFile(
    io,
    "model-unavailable",
    "The managed Whisper large-v3-turbo model is unavailable.",
    canonicalModelPath,
    fs.constants.R_OK
  );
  const hostPath = await resolveHost(environment, settings.hostPath, io);
  const captureId = settings.audioDevice ? Number.parseInt(settings.audioDevice, 10) : -1;
  if (!Number.isInteger(captureId) || captureId < -1) {
    throw new LocalDictationError(
      "microphone-unavailable",
      "The microphone device must be an SDL capture-device number or empty for the default."
    );
  }
  return {
    platformKey: target,
    whisperLanguage: settings.language === "et-EE" ? "et" : "en",
    hostPath,
    modelPath,
    captureId,
  };
}

export type LocalDictationEvent =
  | {
      type: "state";
      generation: number | null;
      state: LocalDictationState;
      errorCode?: DictationErrorCode;
    }
  | {
      type: "transcript";
      generation: number;
      phase: "interim" | "complete";
      text: string;
    }
  | {
      type: "metrics";
      generation: number;
      firstTranscriptMs?: number;
      stopToFinalMs?: number;
      peakRssBytes?: number;
    };

export type WorkerRequest =
  | { type: "start"; generation: number; options: ValidatedDictationOptions }
  | { type: "stop"; generation: number }
  | { type: "cancel"; generation: number };

export type WorkerEvent =
  | { type: "ready"; generation: number }
  | { type: "transcript"; generation: number; phase: "interim" | "complete"; text: string }
  | {
      type: "metrics";
      generation: number;
      firstTranscriptMs?: number;
      stopToFinalMs?: number;
      peakRssBytes?: number;
    }
  | { type: "error"; generation: number; errorCode: DictationErrorCode };

function isFiniteOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value));
}

export function isWorkerEvent(value: unknown): value is WorkerEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (!Number.isInteger(event.generation) || (event.generation as number) < 1) return false;
  if (event.type === "ready") return true;
  if (event.type === "transcript") {
    return (
      (event.phase === "interim" || event.phase === "complete") &&
      typeof event.text === "string"
    );
  }
  if (event.type === "metrics") {
    return (
      isFiniteOptionalNumber(event.firstTranscriptMs) &&
      isFiniteOptionalNumber(event.stopToFinalMs) &&
      isFiniteOptionalNumber(event.peakRssBytes)
    );
  }
  if (event.type === "error") {
    return typeof event.errorCode === "string";
  }
  return false;
}

export interface LocalDictationControllerOptions {
  workerPath: string;
  execPath?: string;
  env?: NodeJS.ProcessEnv;
  fork?: typeof nodeFork;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  onEvent(event: LocalDictationEvent): void;
}

/** Own exactly one speech worker and fence every event by generation. */
export class LocalDictationController {
  private readonly forkProcess: typeof nodeFork;
  private readonly startupTimeoutMs: number;
  private readonly stopTimeoutMs: number;
  private child?: ChildProcess;
  private timer?: NodeJS.Timeout;
  private generation = 0;
  private state: LocalDictationState = "idle";
  private expectedExit = false;
  private completed = false;
  private cancelled = false;
  private disposed = false;

  constructor(private readonly options: LocalDictationControllerOptions) {
    this.forkProcess = options.fork ?? nodeFork;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 30_000;
    this.stopTimeoutMs = options.stopTimeoutMs ?? 120_000;
  }

  get currentState(): LocalDictationState {
    return this.state;
  }

  async start(options: ValidatedDictationOptions): Promise<void> {
    if (this.disposed || this.child || this.state !== "idle") {
      throw new LocalDictationError("busy", "A local dictation session is already active.");
    }
    const generation = ++this.generation;
    this.expectedExit = false;
    this.completed = false;
    this.cancelled = false;
    this.emitState("preparing", generation);
    const forkOptions: ForkOptions = {
      execPath: this.options.execPath ?? process.execPath,
      env: {
        ...(this.options.env ?? process.env),
        ELECTRON_RUN_AS_NODE: "1",
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      serialization: "advanced",
    };
    let child: ChildProcess;
    try {
      child = this.forkProcess(this.options.workerPath, [], forkOptions);
    } catch {
      this.fail("worker-failed", generation);
      return;
    }
    this.child = child;
    child.on("message", (message) => this.onMessage(child, message));
    child.once("error", () => this.onUnexpectedExit(child));
    child.once("exit", () => this.onExit(child));
    child.once("disconnect", () => {
      if (this.child === child && !this.expectedExit) this.onUnexpectedExit(child);
    });
    this.armTimeout(this.startupTimeoutMs, generation);
    this.send(child, { type: "start", generation, options });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child || (this.state !== "preparing" && this.state !== "listening")) return;
    const generation = this.generation;
    this.emitState("stopping", generation);
    this.armTimeout(this.stopTimeoutMs, generation);
    this.send(child, { type: "stop", generation });
  }

  async cancel(): Promise<void> {
    const child = this.child;
    if (!child) {
      if (!this.disposed) this.emitState("idle", null);
      return;
    }
    const generation = this.generation;
    this.expectedExit = true;
    this.cancelled = true;
    this.emitState("stopping", generation);
    this.clearTimer();
    this.send(child, { type: "cancel", generation });
    this.timer = setTimeout(() => {
      if (this.child === child) child.kill();
    }, 2_000);
    this.timer.unref?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.cancel();
  }

  private send(child: ChildProcess, request: WorkerRequest): void {
    try {
      if (child.connected) child.send(request);
      else this.onUnexpectedExit(child);
    } catch {
      this.onUnexpectedExit(child);
    }
  }

  private onMessage(child: ChildProcess, value: unknown): void {
    if (this.child !== child || !isWorkerEvent(value) || value.generation !== this.generation) {
      return;
    }
    if (value.type === "ready") {
      if (this.state !== "preparing") return;
      this.clearTimer();
      this.emitState("listening", value.generation);
      return;
    }
    if (value.type === "transcript") {
      if (value.phase === "complete") {
        if (this.cancelled || this.completed || this.state !== "stopping") return;
        this.completed = true;
        this.expectedExit = true;
      } else if (this.state !== "listening") {
        return;
      }
      this.options.onEvent(value);
      return;
    }
    if (value.type === "metrics") {
      this.options.onEvent(value);
      return;
    }
    this.fail(value.errorCode, value.generation);
  }

  private onUnexpectedExit(child: ChildProcess): void {
    if (this.child !== child || this.expectedExit) return;
    this.fail("worker-failed", this.generation);
  }

  private onExit(child: ChildProcess): void {
    if (this.child !== child) return;
    const shouldIdle = this.expectedExit && !this.disposed;
    const wasExpected = this.expectedExit;
    this.clearChild(child);
    if (shouldIdle) this.emitState("idle", null);
    else if (!wasExpected && !this.disposed) this.fail("worker-failed", this.generation);
  }

  private fail(code: DictationErrorCode, generation: number): void {
    const child = this.child;
    this.clearTimer();
    this.state = "error";
    this.options.onEvent({ type: "state", generation, state: "error", errorCode: code });
    if (child) {
      this.expectedExit = true;
      child.kill();
      this.clearChild(child);
    }
    this.state = "idle";
  }

  private clearChild(child: ChildProcess): void {
    if (this.child !== child) return;
    this.clearTimer();
    this.child = undefined;
    this.expectedExit = false;
    this.completed = false;
    this.cancelled = false;
    this.state = "idle";
  }

  private armTimeout(delay: number, generation: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (this.generation === generation) this.fail("timeout", generation);
    }, delay);
    this.timer.unref?.();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private emitState(state: LocalDictationState, generation: number | null): void {
    this.state = state;
    this.options.onEvent({ type: "state", generation, state });
  }
}
