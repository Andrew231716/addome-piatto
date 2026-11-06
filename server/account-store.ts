import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
export type Request = IncomingMessage & { body?: Record<string, unknown> };
export type Response = ServerResponse & { status: (n:number)=>Response; json:(v:unknown)=>void };
export type AccountRecord = { id: string; email: string; name: string; salt: string; password: string; recoveryHash: string; version: number; snapshot: unknown; revision: number; failedAttempts: number; blockedUntil: number; deleted?: boolean };
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
function key() { const secret=process.env.GYM_AUTH_SECRET; if(!secret||secret.length<64)throw new ApiError(503,'Accesso cloud non configurato. I dati locali restano disponibili.');return Buffer.from(secret,'hex'); }
export function digest(value:string) { return createHmac('sha256',key()).update(value).digest('hex'); }
export function accountId(email:string) { return digest(`account:${email.trim().toLowerCase()}`); }
export function passwordHash(password:string,salt:string) { return scryptSync(password,salt,64).toString('hex'); }
export function safeEqual(a:string,b:string) { const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); }
export function newSecret() { return randomBytes(24).toString('hex'); }
function encrypt(data:unknown) { const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}); }
function decrypt(raw:string):AccountRecord { const e=JSON.parse(raw);const d=createDecipheriv('aes-256-gcm',key(),Buffer.from(e.iv,'base64'));d.setAuthTag(Buffer.from(e.tag,'base64'));return JSON.parse(Buffer.concat([d.update(Buffer.from(e.data,'base64')),d.final()]).toString()); }
async function github(path:string,init?:RequestInit) {
  if(!process.env.GITHUB_TOKEN||!process.env.GITHUB_REPO)throw new ApiError(503,'Archiviazione cloud non configurata.');
  return fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}${path ? `/${path}` : ""}`,{...init,headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json',...init?.headers}});
}
const branch=()=>process.env.GYM_DATA_BRANCH||'gym-data';
let branchChecked=false;
async function ensureBranch() {
  if(branchChecked)return;
  const existing=await github(`git/ref/heads/${branch()}`);
  if(existing.ok){branchChecked=true;return;}
  const repo=await github('');if(!repo.ok)throw new ApiError(503,'Archiviazione cloud temporaneamente non disponibile.');
  const meta=await repo.json() as {default_branch:string};const ref=await github(`git/ref/heads/${meta.default_branch}`);const data=await ref.json() as {object:{sha:string}};
  const result=await github('git/refs',{method:'POST',body:JSON.stringify({ref:`refs/heads/${branch()}`,sha:data.object.sha})});
  if(!result.ok&&result.status!==422)throw new ApiError(503,'Impossibile inizializzare il salvataggio cloud.');
  branchChecked=true;
}
export async function readAccount(id:string):Promise<{record:AccountRecord|null;sha?:string}> {
  if(!/^[a-f0-9]{64}$/.test(id))throw new ApiError(401,'Sessione non valida.');
  await ensureBranch();
  const r=await github(`contents/private-accounts/${id}.enc?ref=${branch()}`);
  if(r.status===404)return {record:null};
  if(!r.ok)throw new ApiError(503,'Lettura cloud non disponibile. Riprova.');
  const file=await r.json() as {content?:string;sha:string};
  let content=file.content;
  if(!content){const blob=await github(`git/blobs/${file.sha}`);if(!blob.ok)throw new ApiError(503,'Lettura backup non disponibile.');content=(await blob.json() as {content:string}).content;}
  return {record:decrypt(Buffer.from(content,'base64').toString()),sha:file.sha};
}
export async function writeAccount(record:AccountRecord,sha?:string) {
  const result=await github(`contents/private-accounts/${record.id}.enc`,{method:'PUT',body:JSON.stringify({message:'Save encrypted account data',content:Buffer.from(encrypt(record)).toString('base64'),branch:branch(),...(sha?{sha}:{})})});
  if(result.status===409||result.status===422)throw new ApiError(409,'Dati modificati da un altro dispositivo. Scarica il cloud prima di salvare.');
  if(!result.ok)throw new ApiError(503,'Salvataggio cloud non riuscito. I dati locali sono conservati.');
}
export function setSession(res:Response,record:AccountRecord) {
  const expires=Date.now()+30*86400000;
  const payload=Buffer.from(JSON.stringify({id:record.id,version:record.version,expires})).toString('base64url');
  const token=`${payload}.${digest(`session:${payload}`)}`;
  res.setHeader('Set-Cookie',`gym_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
}
export async function requireAccount(req:Request) {
  const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('gym_session='))?.slice(12)??'';
  const [payload,signature]=cookie.split('.');
  if(!payload||!signature||!safeEqual(digest(`session:${payload}`),signature))throw new ApiError(401,'Accedi nuovamente per sincronizzare.');
  let session;try{session=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw new ApiError(401,'Sessione non valida.');}
  if(session.expires<Date.now())throw new ApiError(401,'Sessione scaduta. Accedi nuovamente.');
  const stored=await readAccount(session.id);
  if(!stored.record||stored.record.deleted||stored.record.version!==session.version)throw new ApiError(401,'Sessione scaduta. Accedi nuovamente.');
  return {record:stored.record,sha:stored.sha};
}
export async function readBody(req:Request) {
  const length=Number(req.headers['content-length']||0);if(length>3_000_000)throw new ApiError(413,'Backup troppo grande (massimo 3 MB).');
  if(req.body&&typeof req.body==='object')return req.body;
  const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>3_000_000)throw new ApiError(413,'Backup troppo grande.');chunks.push(Buffer.from(chunk));}
  try{return JSON.parse(Buffer.concat(chunks).toString()||'{}') as Record<string,unknown>;}catch{throw new ApiError(400,'Dati non validi.');}
}
export function checkRequest(req:Request,res:Response) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito.');
  const origin=req.headers.origin;
  if(origin&&new URL(origin).host!==req.headers.host)throw new ApiError(403,'Origine non consentita.');
  if(!String(req.headers['content-type']).includes('application/json'))throw new ApiError(415,'Usa application/json.');
}
export function apiFailure(res:Response,error:unknown) { res.status(error instanceof ApiError?error.status:500).json({ok:false,error:error instanceof ApiError?error.message:'Servizio temporaneamente non disponibile. I dati locali sono conservati.'}); }
export function publicSession(a:AccountRecord) { return {id:'current',accountId:a.id,email:a.email,name:a.name,syncToken:'',remote:true,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString()}; }
