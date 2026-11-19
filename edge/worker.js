/* Arvan Edge adapter. Set ESCAPE60_EDGE_UPSTREAM and ESCAPE60_EDGE_KEY securely before deploying.
 * This file deliberately uses the Service Worker fetch-event interface; validate on Arvan first.
 * Persistent leaderboard remains at the separately deployed Node origin. */
const APP_VERSION='1.4.0';
const UPSTREAM=globalThis.ESCAPE60_EDGE_UPSTREAM||'';
const EDGE_KEY=globalThis.ESCAPE60_EDGE_KEY||'';
const rate=new Map();
function respond(body,status=200,extra={}){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json;charset=UTF-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
async function route(req){
 const url=new URL(req.url),path=url.pathname;
 if(path==='/api/v1/health')return respond({status:'ok',edge:true,version:APP_VERSION,originConfigured:!!UPSTREAM});
 if(path==='/api/v1/challenges/today'){
  const today=`daily-${new Date().toISOString().slice(0,10)}`;
  return respond({seed:today,challengeId:today,version:APP_VERSION,edge:true});
 }
 if(!['/api/v1/runs/start','/api/v1/runs/finish','/api/v1/leaderboard'].includes(path))return respond({error:'Not found'},404);
 if(!UPSTREAM)return respond({error:'Leaderboard service not configured'},503);
 if(req.method!=='GET'&&req.method!=='POST')return respond({error:'Method not allowed'},405);
 const len=Number(req.headers.get('content-length')||0);if(len>90000)return respond({error:'Request too large'},413);
 const key=req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||'unknown';
 // Per-isolate throttling is supplementary, not a global abuse-control guarantee.
 const mark=`${key}:${path}`;const t=Date.now();const hits=(rate.get(mark)||[]).filter(x=>t-x<60000);
 if(hits.length>=45)return respond({error:'Rate limit'},429);hits.push(t);rate.set(mark,hits);
 if(rate.size>2000)rate.clear();
 const dest=new URL(path+url.search,UPSTREAM);
 const headers=new Headers({'Content-Type':'application/json'});
 if(EDGE_KEY)headers.set('x-escape-edge-key',EDGE_KEY);
 const upstream=await fetch(dest.toString(),{method:req.method,headers,body:req.method==='POST'?await req.text():undefined});
 const output=new Headers(upstream.headers);output.set('X-Escape60-Edge','1');output.set('Cache-Control','no-store');
 return new Response(upstream.body,{status:upstream.status,headers:output});
}
addEventListener('fetch',event=>event.respondWith(route(event.request).catch(()=>respond({error:'Edge unavailable'},503))));
