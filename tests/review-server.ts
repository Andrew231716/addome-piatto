/** Local QA only. Uses synthetic fixtures and an in-memory backend; never user data. */
import { createServer } from 'node:http';
import { createServer as createVite } from 'vite';
import account from '../api/account';
import sync from '../api/sync';
import { mockGitHub } from './mock-github';
mockGitHub();
const fixture = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthenticatedApp} from '../app/page';
import '../app/globals.css';
import {idbPut} from '../lib/idb';
import {buildPlan,DEFAULT_SETUP} from '../lib/plan';
import {localDate,shiftDate} from '../lib/dates';
const session={id:'current',accountId:'qa-fixture',name:'Anteprima',email:'test@example.invalid',syncToken:'test-only',createdAt:new Date().toISOString(),expiresAt:'2099-01-01'};
const setup={...DEFAULT_SETUP,name:'Anteprima',trainingDays:[0,2,4],sessionMinutes:20};
const plan=buildPlan(setup);
if(!localStorage.getItem('qa-seeded')){
 const values={'gf2-setup':setup,'gf2-onboarded':true,'gf2-profile':plan.profile,'gf2-meals':plan.meals,'gf2-shopping':plan.shopping,'gf2-workout-meta':{title:plan.workoutTitle,summary:plan.workoutSummary,focus:plan.focus,weekLabel:plan.weekLabel,goalLabel:plan.goalLabel,dietLabel:plan.dietLabel},'gf2-day-key':localDate(),'gf2-weight':[{date:shiftDate(localDate(),-8),value:70.5},{date:localDate(),value:70}],'gf3-history':[{date:shiftDate(localDate(),-1),meals:plan.meals.map(m=>({...m,checked:true})),water:5,steps:6000,workoutDone:true,activity:'Full body A',target:plan.calorieTarget,weight:70.5}]};
 for(const [key,value] of Object.entries(values))await idbPut('userData',{key:'qa-fixture:'+key,value});
 localStorage.setItem('qa-seeded','true');
}
await idbPut('userData',{key:'qa-fixture:gf2-workout-meta',value:{title:plan.workoutTitle,summary:plan.workoutSummary,focus:plan.focus,weekLabel:plan.weekLabel,goalLabel:plan.goalLabel,dietLabel:plan.dietLabel}});
createRoot(document.getElementById('root')).render(<AuthenticatedApp session={session} onSessionChange={()=>{}}/>);
`;
const vite=await createVite({configFile:'vite.vercel.config.ts',server:{middlewareMode:true},plugins:[{name:'isolated-qa-fixture',enforce:'pre',transform(code,id){if(id.endsWith('/app/page.tsx'))return code.replace('function AuthenticatedApp(', 'export function AuthenticatedApp(');if(id.endsWith('/src/main.tsx'))return fixture;}}]});
createServer(async(req,res)=>{
 if(req.url==='/api/account'||req.url==='/api/sync'){
  const response=res as any;response.status=(n:number)=>{res.statusCode=n;return response;};response.json=(data:unknown)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  await (req.url==='/api/account'?account:sync)(req as never,response);return;
 }
 vite.middlewares(req,res,()=>{res.statusCode=404;res.end();});
}).listen(4173,'0.0.0.0',()=>console.log('Review server: http://localhost:4173 (synthetic fixtures only)'));
