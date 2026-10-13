const test = require('node:test');
const assert = require('node:assert/strict');
const {WebSocketServer} = require('ws');
const {snapshotExcerpt, tailExcerpt, readSessionExcerpt} = require('../out/panExcerpt.js');
const event = (type, data) => ({type:'event', event:{type, data}});
const assistant = text => event('assistant/message', {message:{role:'assistant',content:[{type:'reasoning',text:'SECRET thought'}, {type:'text',text}]}});
test('current turn visible text only, Unicode tail bounded', () => {
 assert.equal(snapshotExcerpt([assistant('old'),event('turn/start',{})]), '');
 assert.equal(snapshotExcerpt([event('turn/start',{}),assistant('actual'),event('tool/result',{content:'SECRET tool'})]), 'actual');
 assert.equal(snapshotExcerpt([assistant('first'), assistant('last')]), 'last');
 assert.equal([...tailExcerpt('😀'.repeat(800))].length,500);
 assert.equal(snapshotExcerpt(null),'');
});
test('exact-session bounded follow closes after snapshot; errors do not block', async () => {
 const server = new WebSocketServer({host:'127.0.0.1',port:0});
 await new Promise(r=>server.once('listening',r));
 let closed;
 server.on('connection',(ws,req)=>{
  assert.equal(req.headers.cookie,'private=fixture');
  closed = new Promise(r=>ws.once('close',r));
  ws.once('message',bytes=>{
   const frame=JSON.parse(bytes); assert.equal(frame.endpoint,'session/follow');
   assert.deepEqual(frame.payload.args.request,{address:{kind:'session',sessionId:'asking'},maxMessages:20});
   ws.send(JSON.stringify({type:'item',streamId:frame.streamId,value:{type:'snapshot',records:[assistant('Latest visible message')]}}));
  });
 });
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal(await readSessionExcerpt(base,'private=fixture','asking'),'Latest visible message');
 await closed;
 await new Promise(r=>server.close(r));
 assert.equal(await readSessionExcerpt(undefined,undefined,'asking'),'');
 assert.equal(await readSessionExcerpt('http://127.0.0.1:1',undefined,'asking'),'');
});
