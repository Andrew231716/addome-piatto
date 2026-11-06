import { idbDelete, idbGetAll, idbPut } from './idb';
import type { Session } from './auth';
type Row = { key: string; value: unknown };
const revisionKey=(id:string)=>`gym-cloud-revision:${id}`;
export function setCloudRevision(id:string,revision:number) { localStorage.setItem(revisionKey(id),String(revision)); }
export async function applyCloudRows(id:string,rows:unknown) {
  if(!Array.isArray(rows))return;
  if(rows.some(r=>!r||typeof r.key!=='string'||!r.key.startsWith(id+':')))throw new Error('Backup cloud non valido.');
  // Keep a device recovery copy before a cloud restore; it is excluded from cloud uploads.
  const current=(await idbGetAll<Row>('userData')).filter(r=>r.key.startsWith(id+':'));
  if(current.length)await idbPut('userData',{key:`recovery:${id}`,value:current});
  for(const row of rows)await idbPut('userData',row);
}
export async function copyLocalData(from:string,to:string) {
  const rows=(await idbGetAll<Row>('userData')).filter(r=>r.key.startsWith(from+':'));
  for(const row of rows)await idbPut('userData',{...row,key:to+row.key.slice(from.length)});
}
let queue: Promise<void> = Promise.resolve();
export function pushCloud(session:Session) {
  const task=queue.catch(()=>{}).then(async()=>{
    const rows=(await idbGetAll<Row>('userData')).filter(r=>r.key.startsWith(session.accountId+':'));
    const revision=Number(localStorage.getItem(revisionKey(session.accountId))??0);
    const r=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'push',rows,revision})});
    const data=await r.json() as {ok?:boolean;error?:string;revision:number};
    if(!r.ok||!data.ok)throw new Error(data.error||'Salvataggio cloud non riuscito');
    setCloudRevision(session.accountId,data.revision);
  });
  queue=task;
  return task;
}
export async function pullCloud(session:Session) {
  const r=await fetch('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'pull'})});
  const data=await r.json() as {ok?:boolean;error?:string;revision:number;rows?:unknown};if(!r.ok||!data.ok)throw new Error(data.error||'Lettura cloud non riuscita');
  await applyCloudRows(session.accountId,data.rows);setCloudRevision(session.accountId,data.revision);
  return Array.isArray(data.rows)&&data.rows.length>0;
}
export async function clearLocalRows(id:string) {
  for(const row of (await idbGetAll<Row>('userData')).filter(r=>r.key.startsWith(id+':')))await idbDelete('userData',row.key);
}
