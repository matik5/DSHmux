"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WebSocketServer } = require("ws");
const sodium = require("libsodium-wrappers-sumo");
const { PanQuestionBridge, questionPayload } = require("../out/panQuestionBridge.js");

async function until(predicate, timeout = 2500) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error("timed out");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

const encode = bytes => sodium.to_base64(bytes, sodium.base64_variants.URLSAFE_NO_PADDING);
const decode = value => sodium.from_base64(value, sodium.base64_variants.URLSAFE_NO_PADDING);
const jsonResponse = (value, status = 200) => ({ok: status < 400, status, json: async () => value});

test("one DSH question reaches PAN encrypted and phone answer resumes the same agent", async () => {
  await sodium.ready;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-pan-question-"));
  const tokenFile = path.join(tmp, "token");
  const keyFile = path.join(tmp, "mailbox.key");
  fs.writeFileSync(tokenFile, "test-token\n", {mode: 0o600});
  const viewer = sodium.crypto_box_keypair();
  const server = new WebSocketServer({host: "127.0.0.1", port: 0});
  await new Promise(resolve => server.once("listening", resolve));
  const port = server.address().port;
  const eventId = "cb57c1b1-64d3-45e9-bbf3-38c0c35353d2";
  const frame = {type: "waterfall", event: "user-questions/request", eventId,
    agentId: "agent-1", request: {questions: [{id: "pick", header: "Choice",
      question: "Which one?", options: [{label: "First"}, {label: "Second"}]}]}};
  let socket;
  let streamId;
  server.on("connection", ws => {
    socket = ws;
    ws.once("message", bytes => {
      const open = JSON.parse(bytes.toString());
      streamId = open.streamId;
      assert.equal(open.endpoint, "$events");
      ws.send(JSON.stringify({type: "item", streamId: open.streamId,
        value: {type: "ready", clientId: "client-1", host: {home: tmp}}}));
      ws.send(JSON.stringify({type: "item", streamId: open.streamId, value: frame}));
      ws.send(JSON.stringify({type: "item", streamId: open.streamId, value: frame}));
    });
  });
  let agentPublic;
  let posted;
  let answer;
  let result;
  let acked = false;
  let cancelled = false;
  let questionPosts = 0;
  const fetchImpl = async (url, options) => {
    const endpoint = new URL(String(url)).pathname;
    if (endpoint === "/api/v1/mailbox/bootstrap") return jsonResponse({ok: true,
      source_id: "source-1", viewer_public_key: encode(viewer.publicKey), agent_public_key: null});
    if (endpoint === "/api/v1/mailbox/key") {
      agentPublic = decode(JSON.parse(options.body).public_key);
      return jsonResponse({ok: true}, 201);
    }
    if (endpoint === "/api/v1/mailbox/questions" && options.method === "POST") {
      questionPosts++;
      posted = JSON.parse(options.body);
      return jsonResponse({ok: true, question_id: "question-1", status: "OPEN"}, 201);
    }
    if (endpoint === "/api/v1/mailbox/responses") return jsonResponse({ok: true, responses: answer ? [answer] : []});
    if (endpoint === "/api/$events/result") {
      result = JSON.parse(options.body).payload.args;
      socket.send(JSON.stringify({type: "item", streamId, value: {type: "cancel", eventId}}));
      return jsonResponse({result: {ok: true}});
    }
    if (endpoint.endsWith("/cancel")) { cancelled = true; return jsonResponse({ok: true}); }
    if (endpoint.endsWith("/ack")) { acked = true; return jsonResponse({ok: true}); }
    throw new Error(`unexpected ${endpoint}`);
  };
  const manager = {serverUrl: `http://127.0.0.1:${port}`, authCookie: "test=cookie",
    describeQuestionSession: async id => {
      assert.equal(id, "agent-1");
      return {title: "Database migration", cwd: "/private/projects/Billing"};
    }};
  const bridge = new PanQuestionBridge(manager, () => tokenFile, () => keyFile, fetchImpl);
  try {
    bridge.start();
    await until(() => posted);
    assert.equal(questionPosts, 1);
    assert.equal(fs.statSync(keyFile).mode & 0o077, 0);
    const plaintext = JSON.parse(sodium.to_string(sodium.crypto_box_open_easy(
      decode(posted.ciphertext), decode(posted.nonce), agentPublic, viewer.privateKey)));
    assert.equal(plaintext.prompt, "Which one?");
    assert.deepEqual(plaintext.context, {chat_name: "Database migration", project_name: "Billing"});
    assert.equal(posted.context, undefined);
    assert.doesNotMatch(JSON.stringify(posted), /Database migration|Billing|private\/projects/);
    assert.equal(plaintext.choices[1].label, "Second");
    assert.equal(plaintext.request_id, questionPayload(frame, "source-1").requestId);
    const responseId = "3427c05e-9b76-4e7e-961d-e94ac2f7b143";
    const responseBody = {...questionPayload(frame, "source-1").plaintext,
      direction: "viewer_to_agent", response_id: responseId, choice_id: "o2", message: ""};
    const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    answer = {question_id: "question-1", request_id: posted.request_id, response_id: responseId,
      source_id: "source-1", workstream_id: posted.workstream_id, run_id: posted.run_id,
      nonce: encode(nonce), ciphertext: encode(sodium.crypto_box_easy(
        sodium.from_string(JSON.stringify(responseBody)), nonce, agentPublic, viewer.privateKey))};
    await bridge.tick();
    await until(() => acked);
    assert.equal(result.eventId, eventId);
    assert.deepEqual(result.outcome, {kind: "result", value: {answers: [{id: "pick", selected: ["Second"]}]}});
    assert.equal(cancelled, false, "our own result must not cancel its PAN answer");
  } finally {
    bridge.dispose();
    socket?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});

test("desktop resolution cancels the pending PAN question", async () => {
  await sodium.ready;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-pan-cancel-"));
  const tokenFile = path.join(tmp, "token");
  const keyFile = path.join(tmp, "mailbox.key");
  fs.writeFileSync(tokenFile, "test-token\n", {mode: 0o600});
  const viewer = sodium.crypto_box_keypair();
  const server = new WebSocketServer({host: "127.0.0.1", port: 0});
  await new Promise(resolve => server.once("listening", resolve));
  const eventId = "45936f2c-3456-4d86-a101-d6f217b48ebc";
  let socket;
  let streamId;
  server.on("connection", ws => {
    socket = ws;
    ws.once("message", bytes => {
      streamId = JSON.parse(bytes.toString()).streamId;
      ws.send(JSON.stringify({type: "item", streamId, value: {type: "ready", clientId: "client-2", host: {home: tmp}}}));
      ws.send(JSON.stringify({type: "item", streamId, value: {type: "waterfall", event: "user-questions/request",
        eventId, agentId: "agent-2", request: {questions: [{id: "q", question: "Continue?"}]}}}));
    });
  });
  let posted = false;
  let cancelled = false;
  const fetchImpl = async (url, options) => {
    const endpoint = new URL(String(url)).pathname;
    if (endpoint === "/api/v1/mailbox/bootstrap") return jsonResponse({ok: true,
      source_id: "source-2", viewer_public_key: encode(viewer.publicKey), agent_public_key: null});
    if (endpoint === "/api/v1/mailbox/key") return jsonResponse({ok: true}, 201);
    if (endpoint === "/api/v1/mailbox/questions" && options.method === "POST") {
      posted = true; return jsonResponse({ok: true, question_id: "question-2"}, 201);
    }
    if (endpoint.endsWith("/cancel")) { cancelled = true; return jsonResponse({ok: true, status: "CANCELLED"}); }
    if (endpoint === "/api/v1/mailbox/responses") return jsonResponse({ok: true, responses: []});
    throw new Error(`unexpected ${endpoint}`);
  };
  const manager = {serverUrl: `http://127.0.0.1:${server.address().port}`, authCookie: undefined};
  const bridge = new PanQuestionBridge(manager, () => tokenFile, () => keyFile, fetchImpl);
  try {
    bridge.start();
    await until(() => posted);
    socket.send(JSON.stringify({type: "item", streamId, value: {type: "cancel", eventId}}));
    await until(() => cancelled);
    assert.equal(bridge.pending.size, 0);
  } finally {
    bridge.dispose();
    socket?.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});

test("multi-select question delegates to DSH desktop without posting to PAN", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-pan-fallback-"));
  const tokenFile = path.join(tmp, "token");
  fs.writeFileSync(tokenFile, "test-token\n", {mode: 0o600});
  const server = new WebSocketServer({host: "127.0.0.1", port: 0});
  await new Promise(resolve => server.once("listening", resolve));
  const eventId = "b4f37f2c-d25c-4ba9-9cb6-23be39d80409";
  server.on("connection", ws => ws.once("message", bytes => {
    const streamId = JSON.parse(bytes.toString()).streamId;
    ws.send(JSON.stringify({type: "item", streamId, value: {type: "ready", clientId: "client-3", host: {home: tmp}}}));
    ws.send(JSON.stringify({type: "item", streamId, value: {type: "waterfall", event: "user-questions/request",
      eventId, agentId: "agent-3", request: {questions: [{id: "q", question: "Many?", multiSelect: true}]}}}));
  }));
  let result;
  let panCalls = 0;
  const fetchImpl = async (url, options) => {
    if (new URL(String(url)).pathname === "/api/$events/result") {
      result = JSON.parse(options.body).payload.args;
      return jsonResponse({result: {ok: true}});
    }
    panCalls++;
    throw new Error("PAN must not be called");
  };
  const bridge = new PanQuestionBridge({serverUrl: `http://127.0.0.1:${server.address().port}`},
    () => tokenFile, () => path.join(tmp, "key"), fetchImpl);
  try {
    bridge.start();
    await until(() => result);
    assert.deepEqual(result.outcome, {kind: "next"});
    assert.equal(panCalls, 0);
  } finally {
    bridge.dispose();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(tmp, {recursive: true, force: true});
  }
});


test("display metadata changes neither routing IDs nor old spool ciphertext", async () => {
  const frame = {eventId: "45936f2c-3456-4d86-a101-d6f217b48ebc", agentId: "agent-1",
    request: {questions: [{id: "q", question: "Continue?"}]}};
  const plain = questionPayload(frame, "source");
  const named = questionPayload(frame, "source", {project_name: "Billing", chat_name: "Fix"});
  assert.equal(named.requestId, plain.requestId);
  assert.equal(named.workstreamId, plain.workstreamId);
  assert.equal(named.runId, plain.runId);
  const bridge = new PanQuestionBridge({describeQuestionSession: async () => { throw new Error("offline"); }}, () => "", () => "");
  assert.equal(await bridge.displayContext(frame), undefined);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-pan-spool-context-"));
  const spoolBridge = new PanQuestionBridge({}, () => "", () => path.join(tmp, "key"));
  try {
    const original = {ciphertext: "already-encrypted", workstream_id: plain.workstreamId};
    fs.writeFileSync(spoolBridge.spoolPath(plain.requestId), JSON.stringify(original), {mode: 0o600});
    assert.deepEqual(spoolBridge.encryptedBody(frame, {source_id: "source"}, named.plaintext.context).body, original);
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
});
