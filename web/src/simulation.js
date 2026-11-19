/** Deterministic 60 FPS game simulation. Shared by browser and authoritative Node replay. */
import { cityMap, district as mapDistrict, BLOCK as MAP_BLOCK } from './map.js';
import { dsin, dcos, datan2, dhypot } from './dmath.js';
export const TICK_RATE = 60;
export const MAX_TICKS = 60 * TICK_RATE;
export const SIM_VERSION = '1.5.0';
// 1.5.0: engine-independent trig (dmath.js) so the Arvan Edge replay, Chrome, Safari and Firefox
// agree bit-for-bit; gameplay rules are unchanged.
// 1.4.0: real street network (avenues, T-junctions, dead ends, plazas) from map.js; traffic follows
// streets and turns at junctions; police steer around blocks; a harsher pursuit director.
export const DIRECTOR = { policeAt: [0, 8, 18, 30, 42, 52], policeEvery: 4, roadblockFrom: 20, roadblockEvery: 7, finalRoadblock: 55 };
// Health bar: damage scales with how hard you hit; small wall bumps cost a little; health slowly
// recovers after a calm period. Traffic and police enter from outside the camera's view.
export const MAX_HEALTH = 100;
export const REGEN_DELAY = 6;
export const REGEN_RATE = 1;
// Skill chain: each near miss / roadblock dodge inside COMBO_WINDOW raises the multiplier (x1..x5);
// hard drifting keeps the chain alive; any hit resets it.
export const COMBO_WINDOW = 3.5;
export const COMBO_MAX = 5;
const TAU = Math.PI * 2;
const BLOCK = MAP_BLOCK;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => dhypot(a.x - b.x, a.y - b.y);
const normAngle = a => datan2(dsin(a), dcos(a));
export function hashSeed(value) {
  let h = 2166136261 >>> 0;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rng(seed) {
  let s = hashSeed(seed) || 0x9e3779b9;
  return () => { s += 0x6d2b79f5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const district = mapDistrict;
export { cityMap };
const DEFAULT_MAP = cityMap('default');
/** Solid city geometry for a circle; `map` defaults to a neutral layout used by unit tests. */
export function circleHitsBuilding(x, y, radius = 18, map = DEFAULT_MAP) { return map.circleHits(x, y, radius); }
export function isRoad(x, y, map = DEFAULT_MAP) { return map.onStreet(x, y); }
const LANE = 48;
const right = (a) => [-dsin(a), dcos(a)];
const snapAngle = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
function newPolice(s, idx) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const c = policeSpot(s, idx, attempt);
    if (!s.map.circleHits(c.x, c.y, 20) || attempt === 5) return c;
  }
}
function policeSpot(s, idx, attempt) {
  const p = s.player;
  const q = s.random();
  let x, y;
  if (idx % 2 === 0 || attempt >= 3) {
    // Chasers join from behind the player, outside the forward camera view, so they never pop in.
    const radius = 420 + s.random() * 140;
    const a = p.angle + Math.PI + (s.random() - 0.5) * 1.6;
    x = p.x + dcos(a) * radius; y = p.y + dsin(a) * radius;
    if (q < 0.5) x = Math.round(x / BLOCK) * BLOCK;
    else y = Math.round(y / BLOCK) * BLOCK;
  } else {
    // Interceptors drive at you down your street from beyond the visible range: steer to dodge.
    const ahead = 980 + s.random() * 220;
    const hx = dcos(p.angle), hy = dsin(p.angle);
    x = p.x + hx * ahead; y = p.y + hy * ahead;
    if (Math.abs(hx) > Math.abs(hy)) y = Math.round(y / BLOCK) * BLOCK + (s.random() - 0.5) * 60;
    else x = Math.round(x / BLOCK) * BLOCK + (s.random() - 0.5) * 60;
  }
  return {id: idx, x, y, angle: datan2(p.y-y,p.x-x), speed: 90 + s.random()*28,
    stun: 0, close: false, color: idx%2?'blue':'red'};
}
/** Same generator as rng(), but its state lives on the game (`rs`) so a run can be checkpointed. */
function attachRandom(s) {
  s.random = () => { s.rs += 0x6d2b79f5; let t = s.rs; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  return s;
}
export function createGame(seed = 'daily', opts = {}) {
  const s = {seed:String(seed), version:SIM_VERSION, ticks:0, rs: hashSeed(seed) || 0x9e3779b9,
    state:'playing', win:false, health:MAX_HEALTH, invuln:0, points:0, closeCalls:0, calm:0, wallCd:0, scrapes:0,
    hits:0, police:[], traffic:[], marks:[], particles:[], chain:0, comboTimer:0, bestChain:0, dodges:0,
    player:{x:0,y:0,angle:-Math.PI / 2,speed:250,drift:0},
    events:[], nextPolice:0, nextTraffic:0, nextRoadblock:0};
  s.player.x=0; s.player.y=0;
  attachRandom(s);
  s.map = cityMap(String(seed));
  if (!opts.noPolice) { s.police.push(newPolice(s,0)); s.nextPolice=DIRECTOR.policeAt[1]*TICK_RATE; }
  // The city is already busy when the run starts: cars are spread along the streets ahead.
  if (!opts.noTraffic) for (let k = 0; k < 7; k++) spawnTraffic(s, 380 + k * 150 + s.random() * 80);
  s.nextTraffic = Math.round(1.5 * TICK_RATE);
  return s;
}
/** Closing speed between the player and another body moving at (speed, angle). */
function impact(s, speed, angle) {
  const p = s.player;
  return dhypot(dcos(p.angle) * p.speed - dcos(angle) * speed, dsin(p.angle) * p.speed - dsin(angle) * speed);
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
/** Spawn a car on an open street `ahead` units in front of the player (beyond the visible range by
 * default), on the player's axis, a parallel street or a cross street. Cars keep to the right lane. */
function spawnTraffic(s, ahead = 980 + s.random() * 320) {
  const p=s.player;
  const alongX = Math.abs(dcos(p.angle)) > Math.abs(dsin(p.angle));
  for (let attempt = 0; attempt < 6; attempt++) {
    const tx = p.x + dcos(p.angle) * ahead, ty = p.y + dsin(p.angle) * ahead;
    const lane = s.random() < 0.5 ? -1 : 1, dir = s.random() < 0.5 ? 1 : -1;
    let lx, ly, angle, axisX;
    if (s.random() < 0.62) {
      const shift = s.random() < 0.7 ? 0 : (s.random() < 0.5 ? -BLOCK : BLOCK);
      if (alongX) { ly = Math.round(p.y / BLOCK) * BLOCK + shift; lx = tx; angle = dir > 0 ? 0 : Math.PI; axisX = true; }
      else { lx = Math.round(p.x / BLOCK) * BLOCK + shift; ly = ty; angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2; axisX = false; }
    } else {
      const off = (s.random() < 0.5 ? -1 : 1) * (260 + s.random() * 420);
      // the first cross street at or beyond `ahead` (never snapped closer to the player)
      const fwd = (v, sign) => (sign > 0 ? Math.ceil(v / BLOCK) : Math.floor(v / BLOCK)) * BLOCK;
      if (alongX) { lx = fwd(tx, dcos(p.angle)); ly = p.y + off; angle = off > 0 ? -Math.PI / 2 : Math.PI / 2; axisX = false; }
      else { ly = fwd(ty, dsin(p.angle)); lx = p.x + off; angle = off > 0 ? Math.PI : 0; axisX = true; }
    }
    // the segment under the car must be a through street
    const ok = axisX ? s.map.seg(1, Math.floor(lx / BLOCK), Math.round(ly / BLOCK)) === 1 : s.map.seg(0, Math.round(lx / BLOCK), Math.floor(ly / BLOCK)) === 1;
    if (!ok) { ahead += 120; continue; }
    const [rx, ry] = right(angle);
    const x = lx + rx * LANE * lane, y = ly + ry * LANE * lane;
    const dx = Math.round(dcos(angle)), dy = Math.round(dsin(angle));
    const nx = axisX ? (dx > 0 ? Math.floor(x / BLOCK) + 1 : Math.ceil(x / BLOCK) - 1) : Math.round(lx / BLOCK);
    const ny = axisX ? Math.round(ly / BLOCK) : (dy > 0 ? Math.floor(y / BLOCK) + 1 : Math.ceil(y / BLOCK) - 1);
    s.traffic.push({x,y,angle,speed:45+s.random()*35,passed:false,color:Math.floor(s.random()*4),lane,nx,ny,plan:null});
    return;
  }
}
/** Traffic follows the streets: at each junction it goes straight or turns onto an open street,
 * and U-turns at dead ends. Turns happen where the two right-hand lanes cross. */
function driveTraffic(s, car, dt) {
  const B = BLOCK, a = car.angle, dx = Math.round(dcos(a)), dy = Math.round(dsin(a));
  const nodeX = car.nx * B, nodeY = car.ny * B;
  const along = (nodeX - car.x) * dx + (nodeY - car.y) * dy;
  if (!car.plan && along < 230) {
    const opts = [];
    if (s.map.open(car.nx, car.ny, dx, dy)) opts.push(0, 0, 0);
    if (s.map.open(car.nx, car.ny, -dy, dx)) opts.push(1);
    if (s.map.open(car.nx, car.ny, dy, -dx)) opts.push(-1);
    const turn = opts.length ? opts[Math.floor(s.random() * opts.length)] : 2;
    car.plan = { turn };
    if (turn === 1 || turn === -1) {
      const b = snapAngle(a + turn * Math.PI / 2), [ra0, ra1] = right(a), [rb0, rb1] = right(b);
      car.plan.b = b; car.plan.px = nodeX + LANE * car.lane * (ra0 + rb0); car.plan.py = nodeY + LANE * car.lane * (ra1 + rb1);
    }
  }
  if (car.plan) {
    const pl = car.plan;
    if (pl.turn === 0 && along <= 0) { car.nx += dx; car.ny += dy; car.plan = null; }
    else if (pl.turn === 2 && along <= 0) {
      const b = snapAngle(a + Math.PI), [rb0, rb1] = right(b);
      car.angle = normAngle(b); car.x = nodeX + rb0 * LANE * car.lane; car.y = nodeY + rb1 * LANE * car.lane;
      car.nx -= dx; car.ny -= dy; car.plan = null;
    } else if ((pl.turn === 1 || pl.turn === -1) && (pl.px - car.x) * dx + (pl.py - car.y) * dy <= 0) {
      car.x = pl.px; car.y = pl.py; car.angle = normAngle(pl.b);
      car.nx += Math.round(dcos(pl.b)); car.ny += Math.round(dsin(pl.b)); car.plan = null;
    }
  }
  car.x += dcos(car.angle) * car.speed * dt;
  car.y += dsin(car.angle) * car.speed * dt;
}
function spawnRoadblock(s) {
  const p=s.player;
  // One visible, avoidable hazard before a junction ahead, leaving the other half of the road open.
  const vertical=Math.abs(dsin(p.angle))>Math.abs(dcos(p.angle));
  for (const ahead of [860, 860 + BLOCK, 860 - BLOCK / 2]) {
    const tx=p.x+dcos(p.angle)*ahead, ty=p.y+dsin(p.angle)*ahead;
    let mark;
    if(vertical) mark={angle:-Math.PI/2,x:Math.round(tx/BLOCK)*BLOCK-43,y:Math.round(ty/BLOCK)*BLOCK + (p.angle>0?-190:190),ttl:13};
    else mark={angle:0,x:Math.round(tx/BLOCK)*BLOCK +(dcos(p.angle)>0?-190:190),y:Math.round(ty/BLOCK)*BLOCK-43,ttl:13};
    if (s.map.onStreet(mark.x, mark.y) && s.map.onStreet(mark.x + (vertical ? 86 : 0), mark.y + (vertical ? 0 : 86))) { s.marks.push(mark); return true; }
  }
  return false;
}
export function comboMult(s){return s.comboTimer>0?Math.min(COMBO_MAX,Math.max(1,s.chain)):1;}
function skill(s, base, type){
  s.chain=s.comboTimer>0?s.chain+1:1; s.comboTimer=COMBO_WINDOW; s.bestChain=Math.max(s.bestChain,s.chain);
  const mult=comboMult(s), pts=base*mult; s.points+=pts;
  s.events.push({type, tick:s.ticks, mult, pts});
}
const DETOURS = [0, Math.PI/2, -Math.PI/2, Math.PI];
/** In-place Array.filter (keeps order) — avoids per-tick garbage during edge replays. */
function keep(list, fn){let n=0;for(let i=0;i<list.length;i++){const v=list[i];if(fn(v))list[n++]=v;}list.length=n;return list;}
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
  p.x+=dcos(p.angle)*p.speed*dt;
  p.y+=dsin(p.angle)*p.speed*dt;
  p.drift=intensity>0.55?Math.min(1,p.drift+dt*3):Math.max(0,p.drift-dt*4);
  // Buildings are solid and forgive glancing contact for the invulnerability window.
  if(s.map.circleHits(p.x,p.y,16)) {
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
  let cap=0; for(const t of DIRECTOR.policeAt) if(elapsed>=t) cap++;
  if(s.ticks>=s.nextPolice && s.police.length<cap) {
    s.police.push(newPolice(s,s.police.length));s.nextPolice=s.ticks+DIRECTOR.policeEvery*TICK_RATE;
    s.events.push({type:'police',tick:s.ticks});
  }
  if(s.ticks>=s.nextTraffic) {if(s.traffic.length<14)spawnTraffic(s);s.nextTraffic=s.ticks + Math.round((2.9-s.ticks/MAX_TICKS*1.1)*(area===1?.85:1)*TICK_RATE);}
  if(elapsed>=DIRECTOR.roadblockFrom && (s.ticks>=s.nextRoadblock || s.ticks===DIRECTOR.finalRoadblock*TICK_RATE)) {
    if(spawnRoadblock(s)) s.events.push({type:'roadblock',tick:s.ticks});
    s.nextRoadblock=s.ticks+Math.round(DIRECTOR.roadblockEvery*TICK_RATE);
  }
  for(const car of s.police) {
    if(car.stun>0){car.stun-=dt;continue;}
    // Aim ahead of the player, but never past the halfway point (head-on interceptors would overshoot).
    const lead=Math.min((car.id%2?.85:.28)+Math.min(0.65,elapsed/100), dist(p,car)/(2*p.speed));
    const targetX=p.x+dcos(p.angle)*p.speed*lead;
    const targetY=p.y+dsin(p.angle)*p.speed*lead;
    let desired=datan2(targetY-car.y,targetX-car.x);
    // Steer around blocks: if the direct line is walled off, follow the nearest open street axis.
    if(s.map.circleHits(car.x+dcos(desired)*70,car.y+dsin(desired)*70,18)){
      const base=snapAngle(desired);
      for(const off of DETOURS){
        const c=base+off;
        if(!s.map.circleHits(car.x+dcos(c)*70,car.y+dsin(c)*70,18)){desired=c;break;}
      }
    }
    let delta=normAngle(desired-car.angle);
    car.angle=normAngle(car.angle+clamp(delta,-2.15*dt,2.15*dt));
    // Police out-run you on long straights late in the chase but turn worse than you: lose them in corners.
    car.speed=clamp(car.speed+75*dt,125,185+Math.min(105,elapsed*1.9));
    const px=car.x,py=car.y;
    car.x+=dcos(car.angle)*car.speed*dt;
    car.y+=dsin(car.angle)*car.speed*dt;
    if(s.map.circleHits(car.x,car.y,16)) {car.x=px;car.y=py;car.angle=normAngle(car.angle + (car.id%2?1:-1)*0.24);car.stun=.1;}
    const d=dist(p,car);
    if(d<34){damage(s,'police',clamp(14+impact(s,car.speed,car.angle)*0.055,20,32));car.stun=0.6;car.x-=dcos(car.angle)*35;car.y-=dsin(car.angle)*35;}
    if(d<77 && d>38 && !car.close && s.invuln===0) {car.close=true;s.closeCalls++;skill(s,90,'near');}
    if(d>110) car.close=false;
    if(d>1250){Object.assign(car,newPolice(s,car.id));}
  }
  for(const car of s.traffic) {
    driveTraffic(s, car, dt);
    const d=dist(p,car);
    if(d<31)damage(s,'traffic',clamp(12+impact(s,car.speed,car.angle)*0.065,16,34));
    else if(d<64&&!car.passed&&s.invuln===0){car.passed=true;s.closeCalls++;skill(s,55,'near');}
  }
  // Cars leave the simulation only once they are well behind the player or far away.
  const hx=dcos(p.angle), hy=dsin(p.angle);
  keep(s.traffic,car=>{const rx=car.x-p.x, ry=car.y-p.y; return rx*hx+ry*hy>-650 && dhypot(rx,ry)<1600;});
  for(const mark of s.marks){
    mark.ttl-=dt;const d=dist(p,mark);
    if(d<38) {damage(s,'roadblock',30);mark.passed=true;}
    else if(d<72&&!mark.passed&&s.invuln===0){mark.passed=true;s.dodges++;skill(s,120,'dodge');}
  }
  keep(s.marks,mark=>mark.ttl>0&&dist(p,mark)<1400);
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
/** Validate an RLE trace; returns its length in ticks. */
export function traceTicks(trace){
  if(!Array.isArray(trace)||trace.length>MAX_TICKS)throw Error('Invalid trace');
  let total=0;
  for(const part of trace){if(!Array.isArray(part)||part.length!==2||!Number.isInteger(part[0])||Math.abs(part[0])>3||!Number.isInteger(part[1])||part[1]<1||part[1]>MAX_TICKS)throw Error('Invalid trace item');
    total+=part[1];if(total>MAX_TICKS)throw Error('Trace too long');}
  return total;
}
/** Exact, JSON-safe copy of the simulation state (events are not needed to continue a replay). */
export function snapshotGame(s){
  const {map,random,events,...rest}=s;
  return JSON.stringify(rest);
}
export function restoreGame(json){
  const s=JSON.parse(json);
  if(!s||s.version!==SIM_VERSION||typeof s.seed!=='string')throw Error('Invalid checkpoint');
  s.events=[]; s.map=cityMap(s.seed); return attachRandom(s);
}
/** Advance `game` along `trace` from tick `game.ticks` for at most `budget` ticks.
    Returns true once the whole trace has been applied (and the game must then have ended). */
export function replayChunk(game,trace,budget=MAX_TICKS){
  let start=game.ticks,pos=0,done=0;
  for(const [v,n] of trace){
    if(pos+n<=start){pos+=n;continue;}
    for(let i=Math.max(0,start-pos);i<n;i++){
      if(done>=budget)return false;
      if(game.state==='ended')throw Error('Input after game end');
      stepGame(game,v/3);done++;
    }
    pos+=n;
  }
  if(game.state!=='ended')throw Error('Game has not ended');
  return true;
}
export function replayTrace(seed,trace){
  traceTicks(trace);
  const game=createGame(seed);
  replayChunk(game,trace);
  return gameResult(game);
}
