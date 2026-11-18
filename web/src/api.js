/** Online leaderboard requires an explicitly configured origin and honest server validation. */
const API_BASE = (globalThis.ESCAPE60_API_BASE || '').replace(/\/$/,'');
export async function request(path,options={}){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),6500);
 try {const res=await fetch(`${API_BASE}/api/v1${path}`,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});
   const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');return data;
 }finally{clearTimeout(timeout);}
}
export const today=()=>request('/challenges/today');
export const startRun=(seed)=>request('/runs/start',{method:'POST',body:JSON.stringify({seed})});
export const finishRun=(runId,token,trace,result)=>request('/runs/finish',{method:'POST',body:JSON.stringify({runId,token,trace,result})});
export const leaderboard=(seed)=>request(`/leaderboard?seed=${encodeURIComponent(seed)}&limit=10`);
