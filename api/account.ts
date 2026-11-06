import { ApiError, accountId, apiFailure, checkRequest, digest, newSecret, passwordHash, publicSession, readAccount, readBody, requireAccount, safeEqual, setSession, writeAccount, type AccountRecord, type Request, type Response } from '../server/account-store.js';
export default async function handler(req:Request,res:Response) {
  try {
    checkRequest(req,res);const b=await readBody(req);const action=String(b.action||'');
    if(action==='logout'){res.setHeader('Set-Cookie','gym_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');res.status(200).json({ok:true});return;}
    if(['change-password','recovery-code','rename','delete'].includes(action)){
      const {record,sha}=await requireAccount(req);
      if(action==='rename'){record.name=String(b.name||'').trim().slice(0,80)||record.name;}
      if(action==='recovery-code'||action==='change-password'||action==='delete'){
        if(!safeEqual(passwordHash(String(b.currentPassword||''),record.salt),record.password))throw new ApiError(401,'Password attuale non corretta.');
      }
      let recoveryCode:string|undefined;
      if(action==='recovery-code'){recoveryCode=newSecret();record.recoveryHash=digest(`recovery:${recoveryCode}`);}
      if(action==='change-password'){
        const password=String(b.password||'');if(password.length<10||password.length>256)throw new ApiError(400,'Usa una password da 10 a 256 caratteri.');
        record.salt=newSecret();record.password=passwordHash(password,record.salt);record.version++;
      }
      if(action==='delete'){record.deleted=true;record.snapshot=null;record.email='';record.name='';record.password='';record.recoveryHash='';record.version++;}
      await writeAccount(record,sha);
      if(!record.deleted)setSession(res,record);
      res.status(200).json({ok:true,session:record.deleted?null:publicSession(record),recoveryCode});return;
    }
    const email=String(b.email||'').trim().toLowerCase();const password=String(b.password||'');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length>256)throw new ApiError(400,'Controlla email e password.');
    const id=accountId(email);const stored=await readAccount(id);let record=stored.record;
    if(record&&record.blockedUntil>Date.now())throw new ApiError(429,'Troppi tentativi. Attendi 15 minuti e riprova.');
    let recoveryCode:string|undefined;
    if(action==='register'){
      if(record&&!record.deleted)throw new ApiError(409,'Esiste già un account cloud con questa email: usa Accedi.');
      if(password.length<10)throw new ApiError(400,'Usa una password di almeno 10 caratteri.');
      const salt=newSecret();recoveryCode=newSecret();
      record={id,email,name:String(b.name||'Atleta').trim().slice(0,80),salt,password:passwordHash(password,salt),recoveryHash:digest(`recovery:${recoveryCode}`),version:(record?.version??0)+1,snapshot:null,revision:0,failedAttempts:0,blockedUntil:0};
      await writeAccount(record,stored.sha);
    }else if(action==='login'||action==='recover'){
      const matches=record&&!record.deleted&&(action==='recover'?safeEqual(digest(`recovery:${String(b.recoveryCode||'')}`),record.recoveryHash):safeEqual(passwordHash(password,record.salt),record.password));
      if(!matches){
        if(record&&!record.deleted){record.failedAttempts++;if(record.failedAttempts>=5){record.blockedUntil=Date.now()+15*60000;record.failedAttempts=0;}await writeAccount(record,stored.sha);}
        throw new ApiError(401,'Email, password o codice di recupero non corretti.');
      }
      record=record!;
      if(action==='recover'){
        if(password.length<10)throw new ApiError(400,'La nuova password deve avere almeno 10 caratteri.');
        record.salt=newSecret();record.password=passwordHash(password,record.salt);record.version++;
        recoveryCode=newSecret();record.recoveryHash=digest(`recovery:${recoveryCode}`);
      }
      if(record.failedAttempts||record.blockedUntil||action==='recover'){record.failedAttempts=0;record.blockedUntil=0;await writeAccount(record,stored.sha);}
    }else throw new ApiError(400,'Azione non valida.');
    setSession(res,record);res.status(200).json({ok:true,session:publicSession(record),snapshot:record.snapshot,revision:record.revision,recoveryCode});
  }catch(error){apiFailure(res,error);}
}
