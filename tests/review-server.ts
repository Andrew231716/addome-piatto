import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';
import account from '../api/account';
import sync from '../api/sync';
import { mockGitHub } from './mock-github';
mockGitHub();
const vite=await createVite({configFile:'vite.vercel.config.ts',server:{middlewareMode:true}});
createServer(async(req,res)=>{
 if(req.url==='/api/account'||req.url==='/api/sync'){
  const response=res as any;response.status=(n:number)=>{res.statusCode=n;return response;};response.json=(data:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  await (req.url==='/api/account'?account:sync)(req as never,response);return;
 }
 vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
}).listen(4173,'0.0.0.0',()=>console.log('Review server: http://localhost:4173 (isolated test data only)'));
