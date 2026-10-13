import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as https from "node:https";
import * as path from "node:path";
import { Readable } from "node:stream";

export const LOCAL_DICTATION_MODEL = {
  filename: "ggml-large-v3-turbo.bin",
  bytes: 1_624_555_275,
  sha1: "4af2b29d7ec73d781377bfd1758ca957a807e941",
  url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
} as const;

const MAX_REDIRECTS = 5;

export interface LocalDictationModelIdentity {
  filename: string;
  bytes: number;
  sha1: string;
  url: string;
}

export interface LocalDictationModelResponse {
  statusCode: number;
  location?: string;
  contentLength?: number;
  body: Readable;
}

interface ModelWriteHandle {
  write(data: Uint8Array, offset?: number, length?: number): Promise<{ bytesWritten: number }>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface LocalDictationModelRuntime {
  stat(filePath: string): Promise<{ size: number }>;
  read(filePath: string): AsyncIterable<Uint8Array>;
  mkdir(directory: string): Promise<void>;
  open(filePath: string): Promise<ModelWriteHandle>;
  unlink(filePath: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  request(url: URL, signal: AbortSignal): Promise<LocalDictationModelResponse>;
}

export interface LocalDictationModelManagerOptions {
  homePath: string;
  identity?: LocalDictationModelIdentity;
  runtime?: LocalDictationModelRuntime;
}

export class LocalDictationModelError extends Error {
  constructor(readonly cancelled: boolean, message: string) {
    super(message);
    this.name = "LocalDictationModelError";
  }
}

export function managedModelPath(
  homePath: string,
  identity: LocalDictationModelIdentity = LOCAL_DICTATION_MODEL
): string {
  return path.join(homePath, ".dshmux", "models", identity.filename);
}

function request(url: URL, signal: AbortSignal): Promise<LocalDictationModelResponse> {
  return new Promise((resolve, reject) => {
    const outgoing = https.get(url, {
      signal,
      headers: { "User-Agent": "DSHmux local dictation model installer" },
    }, (response) => {
      resolve({
        statusCode: response.statusCode ?? 0,
        location: response.headers.location,
        contentLength: response.headers["content-length"]
          ? Number(response.headers["content-length"])
          : undefined,
        body: response,
      });
    });
    outgoing.once("error", reject);
  });
}

const DEFAULT_RUNTIME: LocalDictationModelRuntime = {
  stat: (filePath) => fs.promises.stat(filePath),
  read: (filePath) => fs.createReadStream(filePath),
  mkdir: (directory) => fs.promises.mkdir(directory, { recursive: true }).then(() => undefined),
  open: (filePath) => fs.promises.open(filePath, "w"),
  unlink: (filePath) => fs.promises.unlink(filePath),
  rename: (from, to) => fs.promises.rename(from, to),
  request,
};

function failure(message: string, signal?: AbortSignal): LocalDictationModelError {
  return new LocalDictationModelError(!!signal?.aborted, signal?.aborted ? "Model download cancelled." : message);
}

async function removeIfPresent(runtime: LocalDictationModelRuntime, filePath: string): Promise<void> {
  try {
    await runtime.unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function writeAll(writer: ModelWriteHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const result = await writer.write(chunk, offset, chunk.length - offset);
    if (result.bytesWritten <= 0) throw new Error("Model download write made no progress.");
    offset += result.bytesWritten;
  }
}

async function fileMatches(
  runtime: LocalDictationModelRuntime,
  filePath: string,
  identity: LocalDictationModelIdentity,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    const stat = await runtime.stat(filePath);
    if (stat.size !== identity.bytes) return false;
    const hash = createHash("sha1");
    let bytes = 0;
    for await (const value of runtime.read(filePath)) {
      if (signal?.aborted) throw failure("Model validation cancelled.", signal);
      const chunk = Buffer.from(value);
      bytes += chunk.length;
      if (bytes > identity.bytes) return false;
      hash.update(chunk);
    }
    return bytes === identity.bytes && hash.digest("hex") === identity.sha1.toLowerCase();
  } catch (error) {
    if (error instanceof LocalDictationModelError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw failure("The managed model could not be read.", signal);
  }
}

async function openResponse(
  runtime: LocalDictationModelRuntime,
  source: URL,
  signal: AbortSignal
): Promise<LocalDictationModelResponse> {
  let url = source;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; ++redirects) {
    if (url.protocol !== "https:") throw failure("Model download requires HTTPS.", signal);
    const response = await runtime.request(url, signal);
    if (response.statusCode >= 300 && response.statusCode < 400 && response.location) {
      response.body.destroy();
      if (redirects === MAX_REDIRECTS) throw failure("Model download redirected too many times.", signal);
      url = new URL(response.location, url);
      continue;
    }
    if (response.statusCode !== 200) {
      response.body.destroy();
      throw failure(`Model download failed with HTTP ${response.statusCode}.`, signal);
    }
    return response;
  }
  throw failure("Model download redirected too many times.", signal);
}

export class LocalDictationModelManager {
  private readonly identity: LocalDictationModelIdentity;
  private readonly runtime: LocalDictationModelRuntime;
  private readonly modelPath: string;
  private inFlight?: Promise<string>;
  private controller?: AbortController;
  private verifiedPath?: string;
  private disposed = false;

  constructor(options: LocalDictationModelManagerOptions) {
    this.identity = options.identity ?? LOCAL_DICTATION_MODEL;
    this.runtime = options.runtime ?? DEFAULT_RUNTIME;
    this.modelPath = managedModelPath(options.homePath, this.identity);
  }

  ensure(onProgress?: (downloadedBytes: number, totalBytes: number) => void): Promise<string> {
    if (this.disposed) return Promise.reject(failure("Model installer is disposed."));
    if (this.verifiedPath) return Promise.resolve(this.verifiedPath);
    if (this.inFlight) return this.inFlight;
    const controller = new AbortController();
    this.controller = controller;
    const operation = this.ensureInner(controller.signal, onProgress)
      .then((modelPath) => {
        this.verifiedPath = modelPath;
        return modelPath;
      })
      .finally(() => {
        if (this.inFlight === operation) this.inFlight = undefined;
        if (this.controller === controller) this.controller = undefined;
      });
    this.inFlight = operation;
    return operation;
  }

  cancel(): void {
    this.controller?.abort();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private async ensureInner(
    signal: AbortSignal,
    onProgress?: (downloadedBytes: number, totalBytes: number) => void
  ): Promise<string> {
    if (await fileMatches(this.runtime, this.modelPath, this.identity, signal)) return this.modelPath;

    const directory = path.dirname(this.modelPath);
    const partialPath = `${this.modelPath}.part`;
    await this.runtime.mkdir(directory);
    await removeIfPresent(this.runtime, partialPath);

    let writer: ModelWriteHandle | undefined;
    try {
      const response = await openResponse(this.runtime, new URL(this.identity.url), signal);
      if (response.contentLength !== undefined && response.contentLength !== this.identity.bytes) {
        response.body.destroy();
        throw failure("Model download size is invalid.", signal);
      }
      writer = await this.runtime.open(partialPath);
      const hash = createHash("sha1");
      let downloaded = 0;
      for await (const value of response.body) {
        if (signal.aborted) throw failure("Model download cancelled.", signal);
        const chunk = Buffer.from(value);
        downloaded += chunk.length;
        if (downloaded > this.identity.bytes) throw failure("Model download exceeded the expected size.", signal);
        hash.update(chunk);
        await writeAll(writer, chunk);
        onProgress?.(downloaded, this.identity.bytes);
      }
      if (signal.aborted) throw failure("Model download cancelled.", signal);
      if (downloaded !== this.identity.bytes || hash.digest("hex") !== this.identity.sha1.toLowerCase()) {
        throw failure("Model download checksum is invalid.", signal);
      }
      await writer.sync();
      await writer.close();
      writer = undefined;

      if (await fileMatches(this.runtime, this.modelPath, this.identity, signal)) {
        await removeIfPresent(this.runtime, partialPath);
        return this.modelPath;
      }
      await removeIfPresent(this.runtime, this.modelPath);
      await this.runtime.rename(partialPath, this.modelPath);
      return this.modelPath;
    } catch (error) {
      try {
        await writer?.close();
      } catch {
        // Preserve the primary bounded failure.
      }
      try {
        await removeIfPresent(this.runtime, partialPath);
      } catch {
        // Preserve the primary bounded failure.
      }
      if (error instanceof LocalDictationModelError) throw error;
      throw failure("Model download failed.", signal);
    }
  }
}
