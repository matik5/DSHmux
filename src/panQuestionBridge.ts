import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type * as vscode from "vscode";
import sodium from "libsodium-wrappers-sumo";
import WebSocket from "ws";
import type { DshServerManager } from "./serverManager.js";

const PAN_ORIGIN = "https://pan.helios-web.xyz";
const POLL_MS = 3000;
const ID = /^[A-Za-z0-9_.:-]{1,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecordValue = Record<string, unknown>;
type Question = { id: string; question: string; header?: string; detail?: string;
  options?: { label: string; description?: string }[]; multiSelect?: boolean };
type Invocation = { type: "waterfall"; event: "user-questions/request"; eventId: string;
  agentId: string; request: { questions: Question[] } };
type Context = { source_id: string; viewer_public_key: Uint8Array; private_key: Uint8Array };
type DisplayContext = { project_name?: string; chat_name?: string };
type Pending = { frame: Invocation; requestId: string; body?: RecordValue; questionId?: string;
  cancelled: boolean; processing: boolean; delivering: boolean; settling: boolean; resultAccepted: boolean };

function record(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function b64(bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
}

function unb64(value: string): Uint8Array {
  return sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
}

function privateFile(file: string): string {
  const stat = fs.statSync(file);
  if ((stat.mode & 0o077) !== 0 || !stat.isFile()) throw new Error("PAN secret file must be private (0600)");
  return fs.readFileSync(file, "utf8").trim();
}

function stableId(value: string): string {
  const bytes = createHash("sha256").update(`dsh-question-v1|${value}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function wireQuestion(value: unknown): Invocation | undefined {
  if (!record(value) || value.type !== "waterfall" || value.event !== "user-questions/request" ||
      typeof value.eventId !== "string" || !UUID.test(value.eventId) ||
      typeof value.agentId !== "string" || !value.agentId || !record(value.request) ||
      !Array.isArray(value.request.questions) || value.request.questions.length !== 1) return undefined;
  const q = value.request.questions[0];
  if (!record(q) || typeof q.id !== "string" || !q.id || typeof q.question !== "string" ||
      !q.question.trim() || (q.header !== undefined && typeof q.header !== "string") ||
      (q.detail !== undefined && typeof q.detail !== "string") ||
      (q.multiSelect !== undefined && typeof q.multiSelect !== "boolean") || q.multiSelect === true ||
      (q.options !== undefined && !Array.isArray(q.options)) ||
      (q.options as unknown[] | undefined)?.length! > 8) return undefined;
  const options = q.options as unknown[] | undefined;
  if (options?.some(option => !record(option) || typeof option.label !== "string" || !option.label.trim() || option.label.length > 200)) return undefined;
  return value as Invocation;
}

export function questionPayload(frame: Invocation, sourceId: string, display?: DisplayContext): { requestId: string; plaintext: RecordValue;
  workstreamId: string; runId: string } {
  const q = frame.request.questions[0]!;
  const workstreamId = ID.test(frame.agentId) ? frame.agentId : `agent.${stableId(frame.agentId)}`;
  const runId = `dsh.${stableId(frame.eventId)}`;
  const options = q.options ?? [];
  const choices = options.map((option, index) => ({id: `o${index + 1}`, label: option.label}));
  const detail = typeof q.detail === "string" && q.detail.trim() ? `\n\n${q.detail}` : "";
  const prompt = `${q.question}${detail}`;
  const title = (q.header?.trim() || "DSHmuxi küsimus").slice(0, 300);
  if (prompt.length > 4000) throw new Error("DSH question is too long for PAN mailbox");
  const requestId = stableId(frame.eventId);
  return {requestId, workstreamId, runId, plaintext: {
    version: 1, direction: "agent_to_viewer", source_id: sourceId, request_id: requestId,
    workstream_id: workstreamId, run_id: runId, title, prompt, choices, allow_message: true,
    ...(display && Object.keys(display).length ? {context: display} : {}),
  }};
}

/** Extension-host bridge for one supported DSH question at a time per invocation. */
export class PanQuestionBridge implements vscode.Disposable {
  private socket?: WebSocket;
  private streamId = "";
  private clientId?: string;
  private timer?: NodeJS.Timeout;
  private active = false;
  private busy = false;
  private reconcileAfter = 0;
  private pending = new Map<string, Pending>();
  private context?: Context;

  constructor(private readonly manager: DshServerManager,
              private readonly tokenFile: () => string,
              private readonly keyFile: () => string,
              private readonly fetchImpl: typeof fetch = fetch) {}

  start(): void {
    if (!this.manager.serverUrl || !this.tokenFile().trim() || !this.keyFile().trim()) return;
    this.stop();
    this.active = true;
    void this.tick();
    this.timer = setInterval(() => { void this.tick(); }, POLL_MS);
  }

  stop(): void {
    this.active = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = undefined;
    this.clientId = undefined;
    this.reconcileAfter = 0;
    this.context = undefined;
    this.pending.clear();
  }

  dispose(): void { this.stop(); }

  private async pan(method: string, endpoint: string, body?: RecordValue): Promise<RecordValue> {
    if (!this.active) throw new Error("PAN question bridge is stopped");
    const token = privateFile(this.tokenFile().trim());
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.fetchImpl(PAN_ORIGIN + endpoint, {
        method, signal: controller.signal,
        headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result: unknown = await response.json();
      if (!response.ok || !record(result) || result.ok !== true) throw new Error(`PAN ${endpoint} HTTP ${response.status}`);
      return result;
    } finally { clearTimeout(timer); }
  }

  private async cryptoContext(): Promise<Context> {
    if (this.context) return this.context;
    await sodium.ready;
    const info = await this.pan("GET", "/api/v1/mailbox/bootstrap");
    if (typeof info.source_id !== "string" || typeof info.viewer_public_key !== "string") throw new Error("PAN bootstrap invalid");
    if (!this.active) throw new Error("PAN question bridge is stopped");
    const keyPath = this.keyFile().trim();
    let privateKey: Uint8Array;
    if (fs.existsSync(keyPath)) {
      privateKey = unb64(privateFile(keyPath));
    } else {
      if (info.agent_public_key !== null) throw new Error("PAN agent key exists but local private key is missing; no automatic rotation");
      fs.mkdirSync(path.dirname(keyPath), {recursive: true, mode: 0o700});
      const pair = sodium.crypto_box_keypair();
      try { fs.writeFileSync(keyPath, b64(pair.privateKey) + "\n", {flag: "wx", mode: 0o600}); }
      catch (error) { if (!fs.existsSync(keyPath)) throw error; }
      privateKey = unb64(privateFile(keyPath));
    }
    if (privateKey.length !== 32) throw new Error("PAN private key has invalid length");
    const publicKey = b64(sodium.crypto_scalarmult_base(privateKey));
    if (info.agent_public_key && info.agent_public_key !== publicKey) throw new Error("PAN agent key differs; no automatic rotation");
    if (!info.agent_public_key) await this.pan("POST", "/api/v1/mailbox/key", {public_key: publicKey});
    this.context = {source_id: info.source_id, viewer_public_key: unb64(info.viewer_public_key), private_key: privateKey};
    return this.context;
  }

  private async tick(): Promise<void> {
    if (!this.active || this.busy) return;
    this.busy = true;
    try {
      if (!this.socket) this.connect();
      if (this.clientId && this.reconcileAfter && Date.now() >= this.reconcileAfter) {
        this.reconcileAfter = 0;
        await this.reconcileSpool();
      }
      for (const pending of this.pending.values()) {
        if (pending.body && !pending.questionId && !pending.processing) await this.postQuestion(pending);
        if (pending.cancelled && !pending.resultAccepted && !pending.processing && pending.questionId) {
          await this.cancel(pending.frame.eventId);
        }
      }
      if (this.clientId && this.pending.size) await this.pollAnswers();
    } catch (error) {
      console.warn("[dsh] PAN question bridge:", error instanceof Error ? error.message : String(error));
    } finally { this.busy = false; }
  }

  private connect(): void {
    const base = this.manager.serverUrl;
    if (!base) return;
    const url = new URL("/api/remote.mux", base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const streamId = `pan-questions-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cookie = this.manager.authCookie;
    const socket = new WebSocket(url, {headers: cookie ? {cookie} : undefined});
    this.socket = socket;
    this.streamId = streamId;
    socket.on("open", () => socket.send(JSON.stringify({type: "open", streamId, endpoint: "$events", payload: {args: {}}})));
    socket.on("message", data => {
      let frame: unknown;
      try { frame = JSON.parse(data.toString()); } catch { return; }
      if (!record(frame) || frame.streamId !== streamId || frame.type !== "item" || !record(frame.value)) return;
      const value = frame.value;
      if (value.type === "ready" && typeof value.clientId === "string") {
        this.clientId = value.clientId;
        this.reconcileAfter = Date.now() + 10_000;
        return;
      }
      if (value.type === "cancel" && typeof value.eventId === "string") {
        void this.cancel(value.eventId);
      } else if (value.type === "waterfall" && value.event === "user-questions/request") {
        const question = wireQuestion(value);
        if (question) void this.handle(question);
        else if (typeof value.eventId === "string") void this.result(value.eventId, {kind: "next"});
      }
    });
    socket.on("error", () => socket.close());
    socket.on("close", () => {
      if (this.socket === socket) {
        this.socket = undefined;
        this.clientId = undefined;
        this.pending.clear();
      }
    });
  }

  private spoolPath(requestId: string): string {
    const dir = path.join(path.dirname(this.keyFile().trim()), "dshmux-questions");
    fs.mkdirSync(dir, {recursive: true, mode: 0o700});
    return path.join(dir, `${requestId}.json`);
  }

  private async reconcileSpool(): Promise<void> {
    const dir = path.dirname(this.spoolPath(stableId("directory")));
    const active = new Set([...this.pending.values()].map(item => item.requestId));
    for (const name of fs.readdirSync(dir).filter(item => UUID.test(item.replace(/\.json$/, "")) && item.endsWith(".json"))) {
      const requestId = name.slice(0, -5);
      if (active.has(requestId)) continue;
      try {
        const status = await this.pan("GET", `/api/v1/mailbox/questions/${requestId}`);
        if (status.status === "OPEN" || status.status === "ANSWERED") {
          await this.pan("POST", `/api/v1/mailbox/questions/${requestId}/cancel`, {});
        }
        fs.rmSync(path.join(dir, name), {force: true});
      } catch (error) {
        console.warn("[dsh] PAN stale question cleanup:", error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async displayContext(frame: Invocation): Promise<DisplayContext | undefined> {
    try {
      const session = await this.manager.describeQuestionSession(frame.agentId);
      if (!session) return undefined;
      const chat = session.title?.trim().slice(0, 200);
      const project = session.cwd?.replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop()?.trim().slice(0, 200);
      return {...(chat ? {chat_name: chat} : {}), ...(project ? {project_name: project} : {})};
    } catch {
      // Metadata availability must never prevent a question or guess another chat.
      return undefined;
    }
  }

  private encryptedBody(frame: Invocation, context: Context, display?: DisplayContext): {body: RecordValue; requestId: string} {
    const {requestId, plaintext, workstreamId, runId} = questionPayload(frame, context.source_id, display);
    const file = this.spoolPath(requestId);
    if (fs.existsSync(file)) return {body: JSON.parse(privateFile(file)) as RecordValue, requestId};
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    const bytes = sodium.from_string(JSON.stringify(plaintext));
    try {
      const encrypted = sodium.crypto_box_easy(bytes, nonce, context.viewer_public_key, context.private_key);
      const body = {request_id: requestId, workstream_id: workstreamId, run_id: runId,
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), nonce: b64(nonce), ciphertext: b64(encrypted)};
      try { fs.writeFileSync(file, JSON.stringify(body), {flag: "wx", mode: 0o600}); }
      catch (error) { if (!fs.existsSync(file)) throw error; return {body: JSON.parse(privateFile(file)) as RecordValue, requestId}; }
      return {body, requestId};
    } finally { bytes.fill(0); }
  }

  private async handle(frame: Invocation): Promise<void> {
    const existing = this.pending.get(frame.eventId);
    if (existing) { existing.frame = frame; return; }
    const pending: Pending = {frame, requestId: stableId(frame.eventId), cancelled: false,
      processing: true, delivering: false, settling: false, resultAccepted: false};
    this.pending.set(frame.eventId, pending);
    try {
      const context = await this.cryptoContext();
      if (!this.active) return;
      const display = fs.existsSync(this.spoolPath(pending.requestId)) ? undefined : await this.displayContext(frame);
      if (!this.active) return;
      const {body} = this.encryptedBody(frame, context, display);
      pending.body = body;
      await this.postQuestion(pending);
      if (!pending.cancelled) await this.pollAnswers();
    } catch (error) {
      console.warn("[dsh] PAN question delivery:", error instanceof Error ? error.message : String(error));
      if (!pending.body) {
        this.pending.delete(frame.eventId);
        await this.result(frame.eventId, {kind: "next"}).catch(() => undefined);
      }
    } finally {
      pending.processing = false;
      if (pending.cancelled) void this.cancel(frame.eventId);
    }
  }

  private async postQuestion(pending: Pending): Promise<void> {
    if (!pending.body || pending.questionId) return;
    const result = await this.pan("POST", "/api/v1/mailbox/questions", pending.body);
    if (typeof result.question_id !== "string") throw new Error("PAN question response missing id");
    pending.questionId = result.question_id;
    if (pending.cancelled && !pending.processing) await this.cancel(pending.frame.eventId);
  }

  private async cancel(eventId: string): Promise<void> {
    const pending = this.pending.get(eventId);
    if (!pending) return;
    pending.cancelled = true;
    if (pending.settling || pending.resultAccepted) return;
    if (pending.processing || !pending.questionId) return;
    try { await this.pan("POST", `/api/v1/mailbox/questions/${pending.requestId}/cancel`, {}); }
    catch (error) { console.warn("[dsh] PAN question cancellation:", error instanceof Error ? error.message : String(error)); return; }
    this.pending.delete(eventId);
    fs.rmSync(this.spoolPath(pending.requestId), {force: true});
  }

  private async pollAnswers(): Promise<void> {
    if (!this.clientId || !this.pending.size) return;
    const response = await this.pan("GET", "/api/v1/mailbox/responses");
    if (!Array.isArray(response.responses)) return;
    for (const pending of this.pending.values()) {
      if ((pending.cancelled && !pending.resultAccepted) || pending.delivering || !pending.questionId) continue;
      const answer = response.responses.find(value => record(value) && value.request_id === pending.requestId);
      if (!record(answer)) continue;
      pending.delivering = true;
      try { await this.deliverAnswer(pending, answer); }
      catch (error) { console.warn("[dsh] PAN answer delivery:", error instanceof Error ? error.message : String(error)); }
      finally { pending.delivering = false; }
    }
  }

  private async deliverAnswer(pending: Pending, answer: RecordValue): Promise<void> {
    const context = await this.cryptoContext();
    const values = questionPayload(pending.frame, context.source_id);
    if (answer.source_id !== context.source_id || answer.question_id !== pending.questionId ||
        answer.request_id !== pending.requestId ||
        answer.workstream_id !== values.workstreamId || answer.run_id !== values.runId ||
        typeof answer.ciphertext !== "string" || typeof answer.nonce !== "string" ||
        typeof answer.response_id !== "string" || typeof answer.question_id !== "string") throw new Error("PAN answer route mismatch");
    const bytes = sodium.crypto_box_open_easy(unb64(answer.ciphertext), unb64(answer.nonce),
      context.viewer_public_key, context.private_key);
    let opened: RecordValue;
    try { opened = JSON.parse(sodium.to_string(bytes)) as RecordValue; }
    finally { bytes.fill(0); }
    if (opened.version !== 1 || opened.direction !== "viewer_to_agent" ||
        opened.source_id !== context.source_id || opened.request_id !== pending.requestId ||
        opened.workstream_id !== values.workstreamId || opened.run_id !== values.runId ||
        opened.response_id !== answer.response_id) throw new Error("PAN answer encrypted metadata mismatch");
    const q = pending.frame.request.questions[0]!;
    const choiceId = opened.choice_id;
    const index = typeof choiceId === "string" && /^o[1-8]$/.test(choiceId) ? Number(choiceId.slice(1)) - 1 : -1;
    if (choiceId !== null && choiceId !== undefined && (index < 0 || !q.options?.[index])) throw new Error("PAN choice is not in DSH question");
    const message = typeof opened.message === "string" ? opened.message.trim() : "";
    if (message.length > 4000 || (index < 0 && !message)) throw new Error("PAN answer is empty or too long");
    const selected = index >= 0 ? [q.options![index]!.label] : [];
    const value = {answers: [{id: q.id, selected, ...(message ? {custom: message} : {})}]};
    if (!pending.resultAccepted) {
      pending.settling = true;
      try {
        await this.result(pending.frame.eventId, {kind: "result", value});
        pending.resultAccepted = true;
      } finally { pending.settling = false; }
    }
    await this.pan("POST", `/api/v1/mailbox/responses/${answer.question_id}/ack`, {response_id: answer.response_id});
    this.pending.delete(pending.frame.eventId);
    fs.rmSync(this.spoolPath(pending.requestId), {force: true});
  }

  private async result(eventId: string, outcome: RecordValue): Promise<void> {
    const base = this.manager.serverUrl;
    if (!this.active || !base || !this.clientId) throw new Error("DSH event stream is not ready");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.fetchImpl(new URL("/api/$events/result", base), {
        method: "POST", signal: controller.signal,
        headers: {"Content-Type": "application/json", ...(this.manager.authCookie ? {cookie: this.manager.authCookie} : {})},
        body: JSON.stringify({type: "client-request", rpcId: `pan-answer-${eventId}`,
          method: "$events/result", payload: {args: {clientId: this.clientId, eventId, outcome}}}),
      });
      const result: unknown = await response.json();
      if (!response.ok || !record(result) || !record(result.result) || result.result.ok !== true) throw new Error("DSH rejected PAN answer");
    } finally { clearTimeout(timer); }
  }
}
