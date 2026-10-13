const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const sodium=require('libsodium-wrappers-sumo');
const {PanCommandReceiver,openCommand}=require('../out/panCommands.js');
const b64=v=>sodium.to_base64(v,sodium.base64_variants.URLSAFE_NO_PADDING);
test('encrypted follow-up reaches exact workspace session once and retries receipt without sending again',async()=>{
 await sodium.ready;
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsh-command-')),receiver=crypto.randomUUID(),viewer=sodium.crypto_box_keypair(),agent=sodium.crypto_box_keypair();
 fs.writeFileSync(path.join(dir,'receiver.json'),JSON.stringify({receiver_id:receiver}),{mode:0o600});
 const context={source_id:crypto.randomUUID(),viewer_public_key:viewer.publicKey,private_key:agent.privateKey};
 const command={version:1,command_id:crypto.randomUUID(),attention_id:crypto.randomUUID(),source_id:context.source_id,session_id:'session-A',workstream_id:'session-A',run_id:'run',receiver_id:receiver,expires_at:new Date(Date.now()+60000).toISOString(),viewer_public_key:b64(viewer.publicKey),source_public_key:b64(agent.publicKey),status:'QUEUED'};
 const nonce=sodium.randombytes_buf(24);command.nonce=b64(nonce);command.ciphertext=b64(sodium.crypto_box_easy(sodium.from_string(JSON.stringify({...command,direction:'viewer_command',message:'Continue exact task'})),nonce,agent.publicKey,viewer.privateKey));
 let sends=[],acks=0;
 const manager={listWorkspaceSessions:async()=>({items:[{sessionId:'session-A'}]}),sendSessionPrompt:async(...args)=>{sends.push(args);return {accepted:true};}};
 const pan=async(method,url,body)=>{
  if(url.endsWith('/routes'))return {ok:true};
  if(url.includes('/commands?'))return {commands:[command,{...command,session_id:'other-session'}]};
  if(url.endsWith('/claim'))return {command:{...command,status:'CLAIMED'}};
  if(url.endsWith('/receipt')){acks++;if(acks===1)throw new Error('lost ACK');assert.equal(body.status,'ACCEPTED');return {ok:true};}
  throw new Error(url);
 };
 const receiverClient=new PanCommandReceiver(manager,()=>'/workspace',()=>dir,async()=>context,pan,x=>x);
 try{
  await assert.rejects(receiverClient.tick(),/lost ACK/);await receiverClient.tick();
  assert.equal(sends.length,1);assert.deepEqual(sends[0],['session-A',command.command_id,'Continue exact task']);assert.equal(acks,2);
  const disk=fs.readFileSync(path.join(dir,command.command_id+'.json'),'utf8');assert(!disk.includes('Continue exact task'));assert(!disk.includes(command.ciphertext));
  const journal=JSON.parse(disk);journal.owner_pid=2147483647;journal.state='prepared';fs.writeFileSync(path.join(dir,command.command_id+'.json'),JSON.stringify(journal),{mode:0o600});
  const restartPan=async(method,url,body)=>url.endsWith('/receipt')?(assert.equal(body.status,'UNKNOWN'),{ok:true}):pan(method,url,body);
  await new PanCommandReceiver(manager,()=>'/workspace',()=>dir,async()=>context,restartPan,x=>x).tick();assert.equal(sends.length,1);
  for(const field of ['session_id','run_id','command_id','receiver_id'])assert.throws(()=>openCommand({...command,[field]:'wrong'},context,receiver));
  assert.throws(()=>openCommand({...command,expires_at:'2000-01-01T00:00:00Z'},context,receiver));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
