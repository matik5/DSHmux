import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import sodium from 'libsodium-wrappers-sumo';
import type {DshServerManager} from './serverManager.js';

type Obj = Record<string, any>;
type Context = {source_id: string; viewer_public_key: Uint8Array; private_key: Uint8Array};
const b64 = (v: Uint8Array) => sodium.to_base64(v, sodium.base64_variants.URLSAFE_NO_PADDING);
const unb64 = (v: string) => sodium.from_base64(v, sodium.base64_variants.URLSAFE_NO_PADDING);
export function openCommand(command: Obj, context: Context, receiver: string): string {
  if (command.source_id !== context.source_id || command.receiver_id !== receiver ||
      command.viewer_public_key !== b64(context.viewer_public_key) ||
      command.source_public_key !== b64(sodium.crypto_scalarmult_base(context.private_key)) ||
      !/^[0-9a-f-]{36}$/.test(command.command_id) || Date.parse(command.expires_at) <= Date.now()) throw new Error('command_binding');
  const bytes = sodium.crypto_box_open_easy(unb64(command.ciphertext), unb64(command.nonce), context.viewer_public_key, context.private_key);
  try {
    const data = JSON.parse(sodium.to_string(bytes));
    const fields = ['source_id','session_id','workstream_id','run_id','attention_id','receiver_id','viewer_public_key','source_public_key','command_id','expires_at'];
    if (data.version !== 1 || data.direction !== 'viewer_command' || fields.some(k => data[k] !== command[k]) ||
        typeof data.message !== 'string' || !data.message.trim() || [...data.message].length > 4000) throw new Error('encrypted_command_binding');
    return data.message;
  } finally {sodium.memzero(bytes);}
}
function write(file: string, value: Obj, exclusive = false): void {
  if (exclusive) {fs.writeFileSync(file, JSON.stringify(value), {flag:'wx', mode:0o600}); return;}
  const temp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value), {flag:'wx', mode:0o600}); fs.renameSync(temp,file);
}
function read(file: string): Obj {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('receipt_permissions');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}

export class PanCommandReceiver {
  private nextRegistration = 0;
  private receiverId?: string;
  constructor(private manager: DshServerManager, private root: () => string, private directory: () => string,
    private context: () => Promise<Context>, private pan: (method: string, endpoint: string, body?: Obj) => Promise<Obj>,
    private safeId: (value: string) => string, private isActive: () => boolean = () => true) {}
  async tick(): Promise<void> {
    if (!this.root() || typeof this.manager.listWorkspaceSessions !== 'function') return;
    const sessions = await this.manager.listWorkspaceSessions(this.root());
    if (!sessions.items.length) return;
    const context = await this.context(), dir = this.directory();
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const identity = path.join(dir,'receiver.json');
    if (!fs.existsSync(identity)) {try {write(identity,{receiver_id:randomUUID()},true);} catch(e) {if(!fs.existsSync(identity)) throw e;}}
    const receiverId: string = this.receiverId = read(identity).receiver_id;
    const byId = new Map(sessions.items.map(s => [this.safeId(s.sessionId), s.sessionId]));
    if (Date.now() >= this.nextRegistration) {
      for (const sid of byId.keys()) {
        // Same identity used by the quiet lifecycle, no capability overwrite.
        await this.pan('POST','/api/v1/control/routes',{session_id:sid,receiver_id:receiverId,transport:'dsh'});
      }
      this.nextRegistration = Date.now() + 60000;
    }
    const response = await this.pan('GET',`/api/v1/control/commands?receiver_id=${receiverId}`);
    for (const command of response.commands ?? []) {
      const sessionId = byId.get(command.session_id);
      if (!sessionId || command.workstream_id !== command.session_id || !/^[0-9a-f-]{36}$/.test(command.command_id)) continue;
      const file = path.join(dir,command.command_id+'.json');
      let local: Obj;
      if (!fs.existsSync(file)) {
        local = {command_id:command.command_id,claim_id:randomUUID(),state:'new',owner_pid:process.pid};
        try {write(file,local,true);} catch(e) {if(fs.existsSync(file)) continue; throw e;}
      } else {
        local = read(file);
        if (local.command_id !== command.command_id) throw new Error('receipt_binding');
        if (local.owner_pid !== process.pid) {
          try {process.kill(local.owner_pid,0); continue;} catch(e) {if((e as NodeJS.ErrnoException).code !== 'ESRCH') continue;}
          // A prepared send across process death is not blindly repeated.
          if (local.state === 'prepared') local.state = 'UNKNOWN';
          local.owner_pid = process.pid; write(file,local);
        }
      }
      const endpoint = `/api/v1/control/commands/${command.command_id}`;
      const claimed = await this.pan('POST',endpoint+'/claim',{claim_id:local.claim_id,receiver_id:receiverId});
      if (['EXPIRED','ACCEPTED','FAILED'].includes(claimed.command.status)) continue;
      if (local.state === 'new') {
        let message: string;
        try {message = openCommand(command,context,receiverId);} catch {local.state = 'FAILED';write(file,local); message = '';}
        if (message && this.isActive()) {
          local.state = 'prepared'; write(file,local); // No plaintext or ciphertext journal.
          try {
            const result = await this.manager.sendSessionPrompt(sessionId,command.command_id,message);
            local.state = result.accepted === true ? 'ACCEPTED' : 'UNKNOWN';
          } catch {local.state = 'UNKNOWN';}
          write(file,local);
        }
      }
      if (['ACCEPTED','FAILED','UNKNOWN'].includes(local.state)) {
        await this.pan('POST',endpoint+'/receipt',{claim_id:local.claim_id,status:local.state});
      }
    }
  }
}
