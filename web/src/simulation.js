/** Deterministic 60 FPS game simulation. Shared by browser and authoritative Node replay. */
export const TICK_RATE = 60;
export const MAX_TICKS = 60 * TICK_RATE;
export const SIM_VERSION = '1.3.0';
// Health bar: damage scales with how hard you hit; small wall bumps cost a little; health slowly
// recovers after a calm period. Traffic and police enter from outside the camera's view.
export const MAX_HEALTH = 100;
export const REGEN_DELAY = 5;
export const REGEN_RATE = 1.5;
// Skill chain: each near miss / roadblock dodge inside COMBO_WINDOW raises the multiplier (x1..x5);
// hard drifting keeps the chain alive; any hit resets it.
export const COMBO_WINDOW = 3.5;
export const COMBO_MAX = 5;
const TAU = Math.PI * 2;
const BLOCK = 520;
const ROAD = 184;
const HALF = ROAD / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const normAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let s = hashSeed(seed) || 0x9e3779b9;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function district(i,j){return ((i+Math.floor(-j/4))%4+4)%4}
export function isRoad(x, y) {
  const dx = Math.abs(((x + BLOCK / 2) % BLOCK + BLOCK) % BLOCK - BLOCK / 2);
  const dy = Math.abs(((y + BLOCK / 2) % BLOCK + BLOCK) % BLOCK - BLOCK / 2);
  const i=Math.floor(x/BLOCK),j=Math.floor(y/BLOCK);
  const alley=district(i,j)===3 && Math.min(Math.abs(x-(i+.5)*BLOCK),Math.abs(y-(j+.5)*BLOCK))<=40;
  return dx <= HALF || dy <= HALF || alley;
}
export function buildingRectsNear(x, y, radius = 2) {
  const result = [];
  const ix = Math.round(x / BLOCK), iy = Math.round(y / BLOCK);
  for (let i = ix - radius; i <= ix + radius; i++) {
    for (let j = iy - radius; j <= iy + radius; j++) {
      const margin = 22;
      const width=BLOCK-ROAD-margin*2;
      const offsets=district(i,j)===3?[0,width/2+40]:[0];
      const size=offsets.length===1?width:width/2-40;
      for(const ox of offsets)for(const oy of offsets)result.push({x:i*BLOCK+HALF+margin+ox,y:j*BLOCK+HALF+margin+oy,w:size,h:size,i,j});
    }
  }
  return result;
}
export function circleHitsBuilding(x, y, radius = 18) {
  // Nearest block center is half-grid offset from road centerlines.
  let bx = Math.floor(x / BLOCK) * BLOCK + BLOCK / 2;
  let by = Math.floor(y / BLOCK) * BLOCK + BLOCK / 2;
  let half = (BLOCK - ROAD) / 2 - 22;
  if(district(Math.floor(x/BLOCK),Math.floor(y/BLOCK))===3){
    const offset=(half+40)/2;
    bx+=x<bx?-offset:offset;
    by+=y<by?-offset:offset;
    half-=offset;
  }
  const cx = clamp(x, bx - half, bx + half);
  const cy = clamp(y, by - half, by + half);
  return (x - cx) ** 2 + (y - cy) ** 2 < radius ** 2;
}
function newPolice(s, idx) {
  const p = s.player;
  const q = s.random();
  let x, y;
  if (idx % 2 === 0) {
    // Chasers join from behind the player, outside the forward camera view, so they never pop in.
    const radius = 420 + s.random() * 140;
    const a = p.angle + Math.PI + (s.random() - 0.5) * 1.6;
    x = p.x + Math.cos(a) * radius; y = p.y + Math.sin(a) * radius;
    if (q < 0.5) x = Math.round(x / BLOCK) * BLOCK;
    else y = Math.round(y / BLOCK) * BLOCK;
  } else {
    // Interceptors drive at you down your street from beyond the visible range: steer to dodge.
    const ahead = 980 + s.random() * 220;
    const hx = Math.cos(p.angle), hy = Math.sin(p.angle);
    x = p.x + hx * ahead; y = p.y + hy * ahead;
    if (Math.abs(hx) > Math.abs(hy)) y = Math.round(y / BLOCK) * BLOCK + (s.random() - 0.5) * 60;
    else x = Math.round(x / BLOCK) * BLOCK + (s.random() - 0.5) * 60;
  }
  return {id: idx, x, y, angle: Math.atan2(p.y-y,p.x-x), speed: 90 + s.random()*28,
    stun: 0, close: false, color: idx%2?'blue':'red'};
}
export function createGame(seed = 'daily', opts = {}) {
  const random = rng(seed);
  const s = {seed:String(seed), version:SIM_VERSION, ticks:0, random,
    state:'playing', win:false, health:MAX_HEALTH, invuln:0, points:0, closeCalls:0, calm:0, wallCd:0, scrapes:0,
    hits:0, police:[], traffic:[], marks:[], particles:[], chain:0, comboTimer:0, bestChain:0, dodges:0,
    player:{x:0,y:0,angle:-Math.PI / 2,speed:250,drift:0},
    events:[], nextPolice:0, nextTraffic:0, nextRoadblock:0};
  s.player.x=0; s.player.y=0;
  if (!opts.noPolice) { s.police.push(newPolice(s,0)); s.nextPolice=10*60; }
  // The city is already busy when the run starts: cars are spread along the streets ahead.
  if (!opts.noTraffic) for (let k = 0; k < 7; k++) spawnTraffic(s, 380 + k * 150 + s.random() * 80);
  s.nextTraffic = Math.round(1.5 * TICK_RATE);
  return s;
}
/** Closing speed between the player and another body moving at (speed, angle). */
function impact(s, speed, angle) {
  const p = s.player;
  return Math.hypot(Math.cos(p.angle) * p.speed - Math.cos(angle) * speed, Math.sin(p.angle) * p.speed - Math.sin(angle) * speed);
}
function damage(s, type, amount) {
  if (s.invuln>0 || s.state!=='playing') return;
  amount = Math.round(amount);
  s.health = Math.max(0, s.health - amount); s.hits++; s.calm = 0;
  s.points = Math.max(0, s.points - amount * 4);
  s.player.speed = amount >= 20 ? 205 : clamp(s.player.speed - amount * 2, 205, 279);
  s.invuln = 0.6; s.chain = 0; s.comboTimer = 0;
  s.events.push({type:'hit',kind:type,tick:s.ticks,dmg:amount});
  if (s.health<=0) {s.state='ended';s.events.push({type:'end',tick:s.ticks});}
}
/** Spawn a car on the street grid `ahead` units in front of the player (beyond the visible
 * range by default), either on the player's road axis or on a cross street. */
function spawnTraffic(s, ahead = 980 + s.random() * 320) {
  const p=s.player;
  const alongX = Math.abs(Math.cos(p.angle)) > Math.abs(Math.sin(p.angle));
  const tx = p.x + Math.cos(p.angle) * ahead, ty = p.y + Math.sin(p.angle) * ahead;
  const lane = s.random() < 0.5 ? -48 : 48, dir = s.random() < 0.5 ? 1 : -1;
  let x, y, angle;
  if (s.random() < 0.62) {
    // Same axis as the player: this road or a parallel one.
    const shift = s.random() < 0.7 ? 0 : (s.random() < 0.5 ? -BLOCK : BLOCK);
    if (alongX) { y = Math.round(p.y / BLOCK) * BLOCK + shift + lane; x = tx; angle = dir > 0 ? 0 : Math.PI; }
    else { x = Math.round(p.x / BLOCK) * BLOCK + shift + lane; y = ty; angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
  } else {
    // Cross street at the junction ahead, entering from either side.
    const off = (s.random() < 0.5 ? -1 : 1) * (260 + s.random() * 420);
    if (alongX) { x = Math.round(tx / BLOCK) * BLOCK + lane; y = p.y + off; angle = off > 0 ? -Math.PI / 2 : Math.PI / 2; }
    else { y = Math.round(ty / BLOCK) * BLOCK + lane; x = p.x + off; angle = off > 0 ? Math.PI : 0; }
  }
  s.traffic.push({x,y,angle,speed:45+s.random()*35,passed:false,color:Math.floor(s.random()*4)});
}
function spawnRoadblock(s) {
  const p=s.player;
  // One visible, avoidable hazard adjacent to a crossroad, with 2 free lanes.
  const ahead=860; // far enough to be seen and warned about, never right on the bumper
  const tx=p.x+Math.cos(p.angle)*ahead, ty=p.y+Math.sin(p.angle)*ahead;
  const vertical=Math.abs(Math.sin(p.angle))>Math.abs(Math.cos(p.angle));
  if(vertical) {
    const x=Math.round(tx/BLOCK)*BLOCK-43;
    s.marks.push({angle:-Math.PI/2,x,y:Math.round(ty/BLOCK)*BLOCK + (p.angle>0?-190:190),ttl:13});
  } else {
    const y=Math.round(ty/BLOCK)*BLOCK-43;
    s.marks.push({angle:0,x:Math.round(tx/BLOCK)*BLOCK +(Math.cos(p.angle)>0?-190:190),y,ttl:13});
  }
}
export function comboMult(s){return s.comboTimer>0?Math.min(COMBO_MAX,Math.max(1,s.chain)):1;}
function skill(s, base, type){
  s.chain=s.comboTimer>0?s.chain+1:1; s.comboTimer=COMBO_WINDOW; s.bestChain=Math.max(s.bestChain,s.chain);
  const mult=comboMult(s), pts=base*mult; s.points+=pts;
  s.events.push({type, tick:s.ticks, mult, pts});
}
export function stepGame(s, steer=0) {
  if(s.state!=='playing') return s;
  const dt=1/TICK_RATE; s.ticks++;
  steer=clamp(Number.isFinite(steer)?steer:0,-1,1);
  if(s.invuln>0) s.invuln=Math.max(0,s.invuln-dt);
  if(s.wallCd>0) s.wallCd=Math.max(0,s.wallCd-dt);
  s.calm+=dt;
  if(s.calm>=REGEN_DELAY && s.health<MAX_HEALTH) s.health=Math.min(MAX_HEALTH,s.health+REGEN_RATE*dt);
  if(s.comboTimer>0){ s.comboTimer=Math.max(0,s.comboTimer-dt); if(s.comboTimer===0) s.chain=0; }
  const p=s.player;
  // Readable, high-grip arcade controls. Speed continues without input.
  const intensity= Math.abs(steer);
  const area=district(Math.floor(p.x/BLOCK),Math.floor(p.y/BLOCK));
  p.speed=clamp(p.speed+(intensity>0.8?-14:8)*dt,205,area===2?279:265);
  p.angle=normAngle(p.angle+steer*(1.95 + 0.4*intensity)*dt);
  const ox=p.x,oy=p.y;
  p.x+=Math.cos(p.angle)*p.speed*dt;
  p.y+=Math.sin(p.angle)*p.speed*dt;
  p.drift=intensity>0.55?Math.min(1,p.drift+dt*3):Math.max(0,p.drift-dt*4);
  // Buildings are solid and forgive glancing contact for the invulnerability window.
  if(circleHitsBuilding(p.x,p.y,16)) {
    // Streetside walls are forgiving: they cost speed, not a life. The player
    // must be able to learn steering without losing three hearts immediately.
    p.x=ox;p.y=oy;p.angle=normAngle(p.angle+Math.PI*0.13*(steer>=0?1:-1));p.speed=205;
    // A bump costs a little health (at most every 0.6 s) but never a combo or a big penalty.
    if(s.wallCd===0 && s.state==='playing'){
      s.wallCd=0.6; s.scrapes++; s.calm=0; s.health=Math.max(0,s.health-3);
      s.events.push({type:'scrape',tick:s.ticks,dmg:3});
      if(s.health<=0){s.state='ended';s.events.push({type:'end',tick:s.ticks});}
    }
  }
  if(intensity>0.82 && s.ticks%24===0){ s.points+=8*comboMult(s); if(s.comboTimer>0) s.comboTimer=Math.max(s.comboTimer,1.2); }
  const elapsed=s.ticks/TICK_RATE;
  if(s.ticks>=s.nextPolice && s.police.length<(elapsed<10?1:elapsed<25?2:elapsed<40?3:elapsed<55?5:6)) {
    s.police.push(newPolice(s,s.police.length));s.nextPolice=s.ticks+5*TICK_RATE;
    s.events.push({type:'police',tick:s.ticks});
  }
  if(s.ticks>=s.nextTraffic) {if(s.traffic.length<14)spawnTraffic(s);s.nextTraffic=s.ticks + Math.round((2.9-s.ticks/MAX_TICKS*1.1)*(area===1?.85:1)*TICK_RATE);}
  if(elapsed>=25 && (s.ticks>=s.nextRoadblock || s.ticks===55*TICK_RATE)) {spawnRoadblock(s);s.nextRoadblock=s.ticks+Math.round(9*TICK_RATE);s.events.push({type:'roadblock',tick:s.ticks});}
  for(const car of s.police) {
    if(car.stun>0){car.stun-=dt;continue;}
    // Aim ahead of the player, but never past the halfway point (head-on interceptors would overshoot).
    const lead=Math.min((car.id%2?.85:.28)+Math.min(0.65,elapsed/100), dist(p,car)/(2*p.speed));
    const targetX=p.x+Math.cos(p.angle)*p.speed*lead;
    const targetY=p.y+Math.sin(p.angle)*p.speed*lead;
    let desired=Math.atan2(targetY-car.y,targetX-car.x);
    let delta=normAngle(desired-car.angle);
    car.angle=normAngle(car.angle+clamp(delta,-2.15*dt,2.15*dt));
    // Police out-run you on long straights late in the chase but turn worse than you: lose them in corners.
    car.speed=clamp(car.speed+70*dt,125,180+Math.min(100,elapsed*1.7));
    const px=car.x,py=car.y;
    car.x+=Math.cos(car.angle)*car.speed*dt;
    car.y+=Math.sin(car.angle)*car.speed*dt;
    if(circleHitsBuilding(car.x,car.y,16)) {car.x=px;car.y=py;car.angle=normAngle(car.angle + (car.id%2?1:-1)*0.24);car.stun=.1;}
    const d=dist(p,car);
    if(d<34){damage(s,'police',clamp(12+impact(s,car.speed,car.angle)*0.05,18,30));car.stun=0.65;car.x-=Math.cos(car.angle)*35;car.y-=Math.sin(car.angle)*35;}
    if(d<77 && d>38 && !car.close && s.invuln===0) {car.close=true;s.closeCalls++;skill(s,90,'near');}
    if(d>110) car.close=false;
    if(d>1250){Object.assign(car,newPolice(s,car.id));}
  }
  for(const car of s.traffic) {
    car.x+=Math.cos(car.angle)*car.speed*dt;
    car.y+=Math.sin(car.angle)*car.speed*dt;
    const d=dist(p,car);
    if(d<31)damage(s,'traffic',clamp(10+impact(s,car.speed,car.angle)*0.06,14,32));
    else if(d<64&&!car.passed&&s.invuln===0){car.passed=true;s.closeCalls++;skill(s,55,'near');}
  }
  // Cars leave the simulation only once they are well behind the player or far away.
  const hx=Math.cos(p.angle), hy=Math.sin(p.angle);
  s.traffic=s.traffic.filter(car=>{const rx=car.x-p.x, ry=car.y-p.y; return rx*hx+ry*hy>-650 && Math.hypot(rx,ry)<1600;});
  for(const mark of s.marks){
    mark.ttl-=dt;const d=dist(p,mark);
    if(d<38) {damage(s,'roadblock',30);mark.passed=true;}
    else if(d<72&&!mark.passed&&s.invuln===0){mark.passed=true;s.dodges++;skill(s,120,'dodge');}
  }
  s.marks=s.marks.filter(mark=>mark.ttl>0&&dist(p,mark)<1400);
  if(s.ticks>=MAX_TICKS && s.state==='playing'){s.state='ended';s.win=true;s.events.push({type:'win',tick:s.ticks});}
  return s;
}
export function gameResult(s){return {version:SIM_VERSION,seed:s.seed,timeMs:Math.min(60000,Math.round(s.ticks*1000/TICK_RATE)),points:s.points,health:Math.round(s.health),win:s.win,closeCalls:s.closeCalls,hits:s.hits,bestChain:s.bestChain,dodges:s.dodges,scrapes:s.scrapes};}
export function compareResult(a,b){return (b.timeMs-a.timeMs)||(b.points-a.points);}
export function encodeTrace(values){
  if(!values.length)return [];
  const out=[];let last=values[0],count=0;
  for(const v of values){if(v===last&&count<65535)count++;else{out.push([last,count]);last=v;count=1;}}
  out.push([last,count]);return out;
}
export function replayTrace(seed,trace){
  if(!Array.isArray(trace)||trace.length>MAX_TICKS)throw Error('Invalid trace');
  const game=createGame(seed);let total=0;
  for(const part of trace){if(!Array.isArray(part)||part.length!==2||!Number.isInteger(part[0])||Math.abs(part[0])>3||!Number.isInteger(part[1])||part[1]<1||part[1]>MAX_TICKS)throw Error('Invalid trace item');
    total+=part[1];if(total>MAX_TICKS)throw Error('Trace too long');
    for(let i=0;i<part[1];i++){if(game.state==='ended')throw Error('Input after game end');stepGame(game,part[0]/3);}
  }
  if(game.state!=='ended')throw Error('Game has not ended');
  return gameResult(game);
}
