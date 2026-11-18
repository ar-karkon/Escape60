import {createGame,stepGame,gameResult,encodeTrace,TICK_RATE,MAX_TICKS,SIM_VERSION,hashSeed} from './simulation.js';
import {createRenderer} from './render.js';
import {SoundEngine} from './audio.js';
import * as api from './api.js';
const $=(id)=>document.getElementById(id);
const canvas=$('game'),render=createRenderer(canvas);
const els={overlay:$('overlay'),home:$('home'),results:$('results'),hud:$('hud'),controls:$('controls'),pause:$('pause'),status:$('status'),time:$('time'),score:$('score'),health:$('health'),power:$('power'),count:$('count'),resultTime:$('result-time'),resultScore:$('result-score'),resultTitle:$('result-title'),resultDetail:$('result-detail'),daily:$('daily-label'),online:$('online-state'),rank:$('rank')};
let game=null,paused=false,gameMode='daily',seed='',runTicket=null,trace=[],last=0,acc=0,steer=0,pressedLeft=false,pressedRight=false,dragging=false,dragX=0,joystickX=0,finishQueued=false,lastEvent=-1,online=false;
const sound=new SoundEngine();
let reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const daySeed=()=>`daily-${new Date().toISOString().slice(0,10)}`;
const qs=new URLSearchParams(location.search);
const externalSeed=qs.get('seed');
const sanitizedSeed=typeof externalSeed==='string'&&/^[a-zA-Z0-9_-]{2,64}$/.test(externalSeed)?externalSeed:null;
const initialSeed=sanitizedSeed || daySeed();
const persisted={};try{Object.assign(persisted,JSON.parse(localStorage.getItem('escape60-bests-'+SIM_VERSION)||'{}'));}catch{}
const formatTime=(ms)=>(ms/1000).toFixed(2).padStart(5,'0');
function setView(name){els.overlay.classList.toggle('hidden',name==='game');els.home.classList.toggle('hidden',name!=='home');els.results.classList.toggle('hidden',name!=='results');els.hud.classList.toggle('hidden',name!=='game');els.controls.classList.toggle('hidden',name!=='game');els.pause.classList.add('hidden');document.body.dataset.view=name;}
async function checkOnline(){try{const res=await api.today();online=!!res.seed;els.online.textContent='رقابت آنلاین فعال';els.online.className='online';}catch{online=false;els.online.textContent='حالت آفلاین · رکورد روی دستگاه';els.online.className='offline';}}
checkOnline();
function updateMode(){seed=initialSeed;gameMode=sanitizedSeed?'challenge':'daily';els.daily.textContent=gameMode==='challenge'?'چالش دوستانه · یک مسیر مشترک':'چالش امروز · مسیر مشترک';}
updateMode();
async function begin(){
  game=createGame(seed);trace=[];steer=0;pressedLeft=false;pressedRight=false;paused=false;finishQueued=false;lastEvent=-1;runTicket=null;
  setView('game');updateHud();
  // Play must remain responsive even when network is down.
  if(online){const started=game;api.startRun(seed).then(r=>{if(game===started&&!finishQueued)runTicket=r;}).catch(()=>{});}
  sound.beep(680,.12);last=performance.now();acc=0;
}
function quantizeSteer(){const v=pressedLeft?-1:pressedRight?1:steer;return Math.max(-3,Math.min(3,Math.round(v*3)));}
function updateHud(){if(!game)return;$('pressure').textContent='فشار تعقیب '+game.police.length.toLocaleString('fa-IR');els.time.textContent=formatTime(Math.min(60000,game.ticks*1000/TICK_RATE));els.score.textContent=game.points.toLocaleString('fa-IR');els.health.textContent='♥'.repeat(game.health)+'♡'.repeat(3-game.health);els.count.textContent=`${Math.max(0,60-Math.floor(game.ticks/TICK_RATE))}`;els.power.style.width=`${100*game.ticks/MAX_TICKS}%`;}
function finish(){
 if(finishQueued)return;finishQueued=true;const result=gameResult(game);
 const prev=persisted[seed];if(!prev||result.timeMs>prev.timeMs||(result.timeMs===prev.timeMs&&result.points>prev.points)){
   persisted[seed]=result;try{localStorage.setItem('escape60-bests-'+SIM_VERSION,JSON.stringify(persisted));}catch{}
 }
 els.resultTime.textContent=formatTime(result.timeMs);els.resultScore.textContent=result.points.toLocaleString('fa-IR');
 els.results.classList.toggle('won',result.win);els.resultTitle.textContent=result.win?'فرار کردی!':'گیر افتادی!';
 els.resultDetail.textContent=`${result.closeCalls} جاخالی نزدیک · ${result.hits} برخورد · بهترین زمان: ${formatTime(persisted[seed].timeMs)}`;
 els.rank.textContent=runTicket?'در انتظار تأیید سرور':'رکورد فقط روی این دستگاه ذخیره شد';
 if(result.win){sound.beep(790,.35);}else sound.beep(175,.27,'sawtooth',.03);
 setView('results');
 if(runTicket){const finished=game;api.finishRun(runTicket.runId,runTicket.token,encodeTrace(trace),result).then(r=>{
  if(game!==finished)return;els.rank.textContent=r.rank?`رتبه تأییدشده: ${r.rank.toLocaleString('fa-IR')}`:'نتیجه ثبت شد';
  return api.leaderboard(seed);
 }).then(r=>{if(game===finished&&r&&r.entries?.length)els.rank.textContent+=` · ${r.entries.length} رکورد برتر`}).catch(()=>{if(game===finished)els.rank.textContent='رکورد فقط روی این دستگاه ذخیره شد';});}
}
function tick(){if(!game||paused||game.state!=='playing')return;const v=quantizeSteer();trace.push(v);stepGame(game,v/3);const e=game.events;
 for(let i=lastEvent+1;i<e.length;i++){
  const event=e[i];if(event.type==='near')sound.beep(840,.07);if(event.type==='hit')sound.beep(125,.18,'square',.027);
  if(event.type==='roadblock')sound.beep(220,.13,'square',.019);if(event.type==='scrape')sound.beep(150,.04,'triangle',.018);
 }
 lastEvent=e.length-1;
 if(game.ticks%18===0)sound.beep([110,130.81,164.81,146.83,110,196,164.81,130.81][Math.floor(game.ticks/18)%8],.17,'triangle',.026);if(game.ticks%3===0)updateHud();if(game.state==='ended')finish();
}
function frame(t){if(!last)last=t;let dt=Math.min((t-last)/1000,.25);last=t;if(!paused&&game?.state==='playing'){
  acc=Math.min(acc+dt,.25);let steps=0;while(acc>=1/TICK_RATE&&steps<15){tick();acc-=1/TICK_RATE;steps++;}
 }
 render(game,t,{reducedMotion,low:$('quality').checked,seed});requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
function togglePause(){if(!game||game.state!=='playing')return;paused=!paused;els.pause.classList.toggle('hidden',!paused);els.hud.classList.toggle('hidden',paused);els.controls.classList.toggle('hidden',paused);last=performance.now();acc=0;}
window.addEventListener('visibilitychange',()=>{if(document.hidden&&game?.state==='playing'&&!paused)togglePause()});
function button(id,fn){$(id).addEventListener('click',fn);}
$('motion').checked=reducedMotion;
$('motion').onchange=()=>{reducedMotion=$('motion').checked};
button('settings',()=>$('config').showModal());
button('close-config',()=>$('config').close());
button('daily-play',()=>{seed=daySeed();begin()});
button('board',async()=>{const list=$('entries');list.textContent='در حال دریافت…';$('records').showModal();try{const {entries}=await api.leaderboard(seed);list.textContent=entries.map((r,i)=>(i+1)+' · '+formatTime(r.timeMs)+' ثانیه · '+r.points+' امتیاز').join('\n')||'هنوز رکوردی ثبت نشده است.'}catch{list.textContent='جدول آنلاین در دسترس نیست.'}});
button('close-board',()=>$('records').close());
button('home-button',()=>{game=null;updateMode();setView('home')});
button('play',begin);button('replay',begin);button('resume',togglePause);button('pause-button',togglePause);
button('quit',()=>{paused=false;game=null;setView('home');});
button('sound',()=>{const enabled=sound.toggle();$('sound').textContent=enabled?'♪ صدا روشن':'♪ صدا خاموش';});
button('share',async()=>{
 const url=new URL(location.href);url.searchParams.set('seed',seed);const best=gameResult(game);
 const text=`من ${formatTime(best.timeMs)} ثانیه در فرار ۶۰ دوام آوردم! می‌تونی رکوردم رو بزنی؟`;
 try {if(navigator.share)await navigator.share({title:'فرار ۶۰',text,url:String(url)});else{await navigator.clipboard.writeText(`${text}\n${url}`);$('share').textContent='لینک کپی شد ✓';setTimeout(()=>$('share').textContent='اشتراک رکورد',2000);}}catch{}
});
button('random',()=>{seed=`challenge-${Math.random().toString(36).slice(2,10)}`;gameMode='challenge';els.daily.textContent='چالش تازه · مسیر مشترک';begin();});
const left=$('left'),right=$('right');
function bindHold(el,side){el.addEventListener('pointerdown',e=>{e.preventDefault();el.setPointerCapture(e.pointerId);if(side==='left')pressedLeft=true;else pressedRight=true;});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(type,()=>{if(side==='left')pressedLeft=false;else pressedRight=false;});}
bindHold(left,'left');bindHold(right,'right');
canvas.addEventListener('pointerdown',e=>{if(!game||game.state!=='playing')return;dragging=true;dragX=e.clientX;joystickX=0;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!dragging)return;joystickX=e.clientX-dragX;steer=Math.max(-1,Math.min(1,joystickX/90));});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{dragging=false;steer=0;});
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='ArrowLeft'||e.code==='KeyA')pressedLeft=true;if(e.code==='ArrowRight'||e.code==='KeyD')pressedRight=true;if(e.code==='KeyP'||e.code==='Escape'){if(!e.repeat)togglePause();}if(e.code==='Space'&&game?.state==='ended')begin();});
window.addEventListener('keyup',e=>{if(e.code==='ArrowLeft'||e.code==='KeyA')pressedLeft=false;if(e.code==='ArrowRight'||e.code==='KeyD')pressedRight=false;});
// Avoid claiming an authoritative rank when the API is offline.
setView('home');
