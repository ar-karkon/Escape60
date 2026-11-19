/** Game service client. In production the API is served by Arvan Edge on the same origin as the game. */
const API_BASE = (globalThis.ESCAPE60_API_BASE || '').replace(/\/$/,'');
export async function request(path,options={},ms=6500){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),ms);
 try {const res=await fetch(`${API_BASE}/api/v1${path}`,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});
   const data=await res.json();if(!res.ok)throw Object.assign(Error(data.error||'Request failed'),{status:res.status});return data;
 }finally{clearTimeout(timeout);}
}
// The first visitor of the day may wait for the AI model to write the special event.
export const today=()=>request('/challenges/today',{},25000);
export const startRun=(seed)=>request('/runs/start',{method:'POST',body:JSON.stringify({seed})});
/** The edge replays a run in chunks (CPU budget per request); each reply carries a signed checkpoint. */
export async function finishRun(runId,token,trace,result,onProgress=()=>{}){
 let checkpoint;
 for(let i=0;i<12;i++){
   const r=await request('/runs/finish',{method:'POST',body:JSON.stringify({runId,token,trace,result,checkpoint})},15000);
   if(!r.continue)return r;
   checkpoint=r.checkpoint;onProgress(r.progress);
 }
 throw Error('Replay did not finish');
}
export const report=(runId,token)=>request('/runs/report',{method:'POST',body:JSON.stringify({runId,token})},25000);
export const leaderboard=(seed,limit=10)=>request(`/leaderboard?seed=${encodeURIComponent(seed)}&limit=${limit}`);
