import WebSocket from "ws";

const record = (x: unknown): x is Record<string, any> => !!x && typeof x === "object" && !Array.isArray(x);
export function tailExcerpt(value: string): string {
  const chars = [...value.replace(/\s+/g, " ").trim()];
  return chars.length <= 500 ? chars.join("") : "…" + chars.slice(-499).join("").trimStart();
}

/** Published visible text only, from the current turn of the requested session. */
export function snapshotExcerpt(records: unknown): string {
  if (!Array.isArray(records)) return "";
  for (const item of [...records].reverse()) {
    if (!record(item) || item.type !== "event" || !record(item.event)) continue;
    const event = item.event;
    if (event.type === "turn/start") return "";
    if (event.type !== "assistant/message" || !record(event.data?.message)) continue;
    const content = event.data.message.content;
    const text = typeof content === "string" ? content : Array.isArray(content)
      ? content.filter(block => record(block) && block.type === "text" && typeof block.text === "string").map(block => block.text).join(" ") : "";
    const excerpt = tailExcerpt(text);
    if (excerpt) return excerpt;
  }
  return "";
}

/** Bounded one-shot read; no subscriptions, generation or attention events. */
export function readSessionExcerpt(base: string | undefined, cookie: string | undefined, sessionId: string): Promise<string> {
  if (!base || !sessionId) return Promise.resolve("");
  return new Promise(resolve => {
    const url = new URL("/api/remote.mux", base);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const streamId = `pan-excerpt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const socket = new WebSocket(url, {headers: cookie ? {cookie} : undefined, maxPayload: 1024 * 1024});
    let settled = false;
    const finish = (text = "") => {
      if (settled) return;
      settled = true; clearTimeout(timer); resolve(text);
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate(); else socket.close();
    };
    const timer = setTimeout(() => finish(), 1200);
    socket.once("open", () => socket.send(JSON.stringify({type: "open", streamId, endpoint: "session/follow",
      payload: {args: {request: {address: {kind: "session", sessionId}, maxMessages: 20}}}})));
    socket.on("message", bytes => {
      try {
        const frame = JSON.parse(bytes.toString());
        if (!record(frame) || frame.streamId !== streamId) return;
        if (frame.type === "error" || frame.type === "end") { finish(); return; }
        if (frame.type === "item" && frame.value?.type === "snapshot") finish(snapshotExcerpt(frame.value.records));
      } catch { finish(); }
    });
    socket.on("error", () => finish());
    socket.on("close", () => finish());
  });
}
