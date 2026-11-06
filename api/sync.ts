import legacySync from '../server/legacy-sync.js';
import { apiFailure, ApiError, checkRequest, readBody, requireAccount, writeAccount, type Request, type Response } from '../server/account-store.js';
export default async function handler(req:Request,res:Response) {
  try {
    checkRequest(req,res);const b=await readBody(req);req.body=b;
    if(!req.headers.cookie?.includes('gym_session=')){
      await legacySync(req as never,res as never);return;
    }
    const {record,sha}=await requireAccount(req);
    if(b.action==='pull'){res.status(200).json({ok:true,rows:record.snapshot,revision:record.revision});return;}
    if(b.action!=='push')throw new ApiError(400,'Azione non valida.');
    if(Number(b.revision)!==record.revision)throw new ApiError(409,'Il cloud contiene modifiche da un altro dispositivo. Scarica il cloud per continuare.');
    if(!Array.isArray(b.rows)||b.rows.length>200)throw new ApiError(400,'Backup non valido.');
    for(const row of b.rows){if(!row||typeof row.key!=='string'||!row.key.startsWith(record.id+':'))throw new ApiError(400,'Dati account non validi.');}
    record.snapshot=b.rows;record.revision++;
    await writeAccount(record,sha);res.status(200).json({ok:true,revision:record.revision});
  }catch(error){apiFailure(res,error);}
}
