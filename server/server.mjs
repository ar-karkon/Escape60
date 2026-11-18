/** Minimal durable Node API for development and a deployable origin behind Arvan Edge. */
import http from 'node:http';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gameResult,replayTrace,compareResult,SIM_VERSION,MAX_TICKS} from '../web/src/simulation.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const PORT=Number(process.env.PORT||4173);
const SECRET=process.env.ESCAPE60_SECRET||randomUUID();
const EDGE_KEY=process.env.ESCAPE60_EDGE_KEY||'';
const REQUIRE_EDGE=process.env.REQUIRE_EDGE_AUTH==='1';
const DATA_FILE=path.join(ROOT,'server/data/leaderboard.json');
const seedValid=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{2,64}$/.test(s);
const sessions=new Map();const rates=new Map();
let board={};let writeChain=Promise.resolve();
try{board=JSON.parse(await readFile(DATA_FILE,'utf8'));}catch{}
function sign(value){return createHmac('sha256',SECRET).update(value).digest('hex');}
function safeMatch(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;return timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function json(res,status,value,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra});res.end(JSON.stringify(value));}
function error(res,status,msg){json(res,status,{error:msg});}
function getIp(req){return req.socket.remoteAddress||'unknown';}
function limited(ip,category,limit,windowMs){const key=`${ip}:${category}`,now=Date.now();const hits=(rates.get(key)||[]).filter(t=>now-t<windowMs);if(hits.length>=limit)return true;hits.push(now);rates.set(key,hits);return false;}
async function readBody(req){let body='';for await(const chunk of req){body+=chunk.toString();if(body.length>90000)throw Error('Payload too large');}try{return JSON.parse(body||'{}');}catch{throw Error('Invalid JSON');}}
async function saveBoard(){await mkdir(path.dirname(DATA_FILE),{recursive:true});const tmp=DATA_FILE+'.tmp';await writeFile(tmp,JSON.stringify(board));await rename(tmp,DATA_FILE);}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
async function staticFile(url,res){const p=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);const file=path.resolve(ROOT,'web','.'+p);if(!file.startsWith(path.resolve(ROOT,'web')+path.sep)){error(res,403,'Forbidden');return;}
 try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'public,max-age=60','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);}catch{error(res,404,'Not found');}}
export function handler(req,res){route(req,res).catch(err=>{console.error('request failure',err.message);if(!res.headersSent)error(res,500,'Server error');else res.end();});}
async function route(req,res){
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith('/api/'))return staticFile(url,res);
 if(REQUIRE_EDGE&&(!EDGE_KEY||!safeMatch(req.headers['x-escape-edge-key'],EDGE_KEY)))return error(res,401,'Edge authentication required');
 const ip=getIp(req),today=`daily-${new Date().toISOString().slice(0,10)}`;
 if(url.pathname==='/api/v1/health'&&req.method==='GET')return json(res,200,{status:'ok',version:SIM_VERSION,storage:'disk'});
 if(url.pathname==='/api/v1/challenges/today'&&req.method==='GET')return json(res,200,{seed:today,challengeId:today,version:SIM_VERSION});
 if(url.pathname==='/api/v1/leaderboard'&&req.method==='GET'){
   const seed=url.searchParams.get('seed')||today;
   if(!seedValid(seed))return error(res,400,'Invalid seed');
   const entries=(board[SIM_VERSION+'/'+seed]||[]).slice(0,Math.min(20,Math.max(1,Number(url.searchParams.get('limit'))||10)));
   return json(res,200,{seed,entries:entries.map((entry,i)=>({rank:i+1,timeMs:entry.timeMs,points:entry.points,label:entry.label})),verified:true});
 }
 if(url.pathname==='/api/v1/runs/start'&&req.method==='POST'){
   if(limited(ip,'start',45,60000))return error(res,429,'Please slow down');
   const body=await readBody(req);const seed=body.seed||today;
   if(!seedValid(seed))return error(res,400,'Invalid seed');
   const runId=randomUUID(),issuedAt=Date.now();const token=sign(`${runId}|${seed}|${issuedAt}|${SIM_VERSION}`);
   sessions.set(runId,{seed,issuedAt,token,ip});return json(res,200,{runId,seed,issuedAt,token,version:SIM_VERSION});
 }
 if(url.pathname==='/api/v1/runs/finish'&&req.method==='POST'){
   if(limited(ip,'finish',12,60000))return error(res,429,'Please slow down');
   const b=await readBody(req);
   if(typeof b.runId!=='string'||typeof b.token!=='string')return error(res,400,'Missing run token');
   const session=sessions.get(b.runId);
   if(!session||!safeMatch(session.token,b.token)||session.ip!==ip)return error(res,401,'Invalid or used run');
   const age=Date.now()-session.issuedAt;
   if(age>600000)return error(res,410,'Run expired');
   if(!Array.isArray(b.trace)||!b.result)return error(res,400,'Missing trace or result');
   let result;
   try{result=replayTrace(session.seed,b.trace);}catch(e){return error(res,422,`Invalid replay: ${e.message}`);}
   if(b.result.version!==SIM_VERSION||b.result.seed!==session.seed||b.result.timeMs!==result.timeMs||b.result.points!==result.points||b.result.health!==result.health||b.result.win!==result.win)return error(res,422,'Result does not match authoritative replay');
   if(age<result.timeMs*.78)return error(res,422,'Run finished too quickly');
   sessions.delete(b.runId);
   const entry={timeMs:result.timeMs,points:result.points,label:`راننده ${b.runId.slice(0,4)}`,at:Date.now()};
   const rows=board[SIM_VERSION+'/'+session.seed]||[];rows.push(entry);rows.sort((a,b)=>compareResult(a,b)||(a.at-b.at));board[SIM_VERSION+'/'+session.seed]=rows.slice(0,200);
   writeChain=writeChain.then(saveBoard);await writeChain;
   const rank=board[SIM_VERSION+'/'+session.seed].findIndex(e=>e===entry)+1;
   return json(res,200,{accepted:true,rank:rank||null,result,verification:'deterministic-replay-v1'});
 }
 error(res,404,'Unknown API route');
}
// Garbage collect in-memory tickets and rate windows periodically.
setInterval(()=>{const now=Date.now();for(const [key,val] of sessions)if(now-val.issuedAt>600000)sessions.delete(key);for(const [key,val] of rates)if(val.every(t=>now-t>3600000))rates.delete(key);},60000).unref();
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 http.createServer(handler).listen(PORT,'0.0.0.0',()=>console.log(`ESCAPE60 http://localhost:${PORT}`));
}
