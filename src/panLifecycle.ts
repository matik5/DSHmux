import { createHash } from "node:crypto";
import * as fs from "node:fs";
import type * as vscode from "vscode";
import WebSocket from "ws";
import type { DshServerManager } from "./serverManager.js";

const POLL_MS = 5000;
const CURSOR_PREFIX = "pan.lifecycle.cursor.";
const PAN_URL = "https://pan.helios-web.xyz/api/v1/events";

type WireEvent = { type: string; seq: number; time: number; data?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function wireEvent(value: unknown): WireEvent | undefined {
  if (!isRecord(value) || value.type !== "turn/end" || !Number.isSafeInteger(value.seq) ||
      !Number.isFinite(value.time)) return undefined;
  return value as WireEvent;
}

function eventId(sessionId: string, seq: number): string {
  const bytes = createHash("sha256").update(`dsh-turn-end-v1|${sessionId}|${seq}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function quietTurnEvent(sessionId: string, event: WireEvent): Record<string, unknown> {
  if (!sessionId || sessionId.length > 120 || event.type !== "turn/end" ||
      !Number.isSafeInteger(event.seq) || !Number.isFinite(event.time)) throw new Error("Invalid DSH turn event");
  return {
    event_id: eventId(sessionId, event.seq),
    run_id: `dsh:${sessionId}`,
    event_type: "turn_end",
    occurred_at: new Date(event.time).toISOString(),
    title: "DSHmux",
  };
}

function readToken(file: string): string {
  const stat = fs.statSync(file);
  if ((stat.mode & 0o077) !== 0) throw new Error("PAN token file must be mode 0600");
  const token = fs.readFileSync(file, "utf8").trim();
  if (!token || token.length > 200) throw new Error("PAN token file is invalid");
  return token;
}

interface FollowState {
  socket: WebSocket;
  streamId: string;
  pending: Promise<void>;
  cursor: number | undefined;
  failed: boolean;
}

/** Runs in the extension host, independently of all DSHmux webviews. */
export class PanLifecycleObserver implements vscode.Disposable {
  private follows = new Map<string, FollowState>();
  private timer?: NodeJS.Timeout;
  private polling = false;
  private active = false;
  private root = "";

  constructor(private readonly manager: DshServerManager,
              private readonly state: vscode.Memento,
              private readonly tokenFile: () => string,
              private readonly fetchImpl: typeof fetch = fetch) {}

  start(root: string): void {
    const tokenFile = this.tokenFile().trim();
    if (!tokenFile || !this.manager.serverUrl) return;
    this.stop();
    this.active = true;
    this.root = root;
    void this.poll();
    this.timer = setInterval(() => { void this.poll(); }, POLL_MS);
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const state of this.follows.values()) {
      state.socket.removeAllListeners();
      state.socket.close();
    }
    this.follows.clear();
  }

  dispose(): void { this.stop(); }

  private async poll(): Promise<void> {
    if (!this.active || this.polling || !this.manager.serverUrl) return;
    this.polling = true;
    try {
      const sessions = await this.manager.listWorkspaceSessions(this.root);
      if (!this.active) return;
      const ids = new Set(sessions.items.map(item => item.sessionId));
      for (const [id, state] of this.follows) {
        if (ids.has(id)) continue;
        state.socket.removeAllListeners();
        state.socket.close();
        this.follows.delete(id);
      }
      for (const id of ids) if (!this.follows.has(id)) this.follow(id);
    } catch (error) {
      console.warn("[dsh] PAN lifecycle session poll failed:", error instanceof Error ? error.message : String(error));
    } finally {
      this.polling = false;
    }
  }

  private follow(sessionId: string): void {
    const base = this.manager.serverUrl;
    if (!base || !this.active) return;
    const url = new URL("/api/remote.mux", base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const streamId = `pan-${sessionId}-${Date.now()}`;
    const cookie = this.manager.authCookie;
    const socket = new WebSocket(url, { headers: cookie ? { cookie } : undefined });
    const previous = this.state.get<number>(CURSOR_PREFIX + sessionId);
    const follow: FollowState = { socket, streamId, cursor: previous, pending: Promise.resolve(), failed: false };
    this.follows.set(sessionId, follow);
    socket.on("open", () => {
      socket.send(JSON.stringify({type: "open", streamId, endpoint: "session/follow",
        payload: {args: {request: {address: {kind: "session", sessionId}, maxMessages: 10000}}}}));
    });
    socket.on("message", data => {
      let frame: unknown;
      try { frame = JSON.parse(data.toString()); } catch { return; }
      if (!isRecord(frame) || frame.streamId !== streamId) return;
      if (frame.type === "error" || frame.type === "end") { socket.close(); return; }
      if (frame.type !== "item" || !isRecord(frame.value)) return;
      const value = frame.value;
      if (value.type === "snapshot" && Number.isSafeInteger(value.cursor)) {
        if (follow.cursor === undefined) {
          follow.cursor = value.cursor as number;
          const baseline = follow.cursor;
          follow.pending = follow.pending.then(() => this.state.update(CURSOR_PREFIX + sessionId, baseline));
        } else if (Array.isArray(value.records)) {
          for (const record of value.records) {
            if (!isRecord(record) || record.type !== "event" || !isRecord(record.event)) continue;
            this.queue(sessionId, follow, record.event);
          }
        }
      } else if (value.type === "event" && isRecord(value.event)) {
        this.queue(sessionId, follow, value.event);
      }
    });
    socket.on("error", () => socket.close());
    socket.on("close", () => {
      if (this.follows.get(sessionId) === follow) this.follows.delete(sessionId);
    });
  }

  private queue(sessionId: string, follow: FollowState, raw: Record<string, unknown>): void {
    if (follow.failed || !Number.isSafeInteger(raw.seq) || (raw.seq as number) <= (follow.cursor ?? -1)) return;
    follow.pending = follow.pending.then(async () => {
      const seq = raw.seq as number;
      if (!this.active || follow.failed) return;
      if (seq <= (follow.cursor ?? -1)) return;
      const event = wireEvent(raw);
      if (event) await this.deliver(sessionId, event);
      follow.cursor = seq;
      await this.state.update(CURSOR_PREFIX + sessionId, seq);
    }).catch(error => {
      follow.failed = true;
      console.warn("[dsh] PAN lifecycle delivery failed:", error instanceof Error ? error.message : String(error));
      follow.socket.close();
    });
  }

  private async deliver(sessionId: string, event: WireEvent): Promise<void> {
    if (!this.active) return;
    const tokenFile = this.tokenFile().trim();
    const token = readToken(tokenFile);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await this.fetchImpl(PAN_URL, {method: "POST", signal: controller.signal,
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: JSON.stringify(quietTurnEvent(sessionId, event))});
      if (!response.ok) throw new Error(`PAN HTTP ${response.status}`);
      const result: unknown = await response.json();
      if (!isRecord(result) || result.ok !== true || result.silent !== true) throw new Error("PAN rejected quiet turn event");
    } finally {
      clearTimeout(timer);
    }
  }
}
