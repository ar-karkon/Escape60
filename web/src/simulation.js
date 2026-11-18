/** Deterministic 60 FPS game simulation. Shared by browser and authoritative Node replay. */
export const TICK_RATE = 60;
export const MAX_TICKS = 60 * TICK_RATE;
export const SIM_VERSION = '1.0.0';
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
export function isRoad(x, y) {
  const dx = Math.abs(((x + BLOCK / 2) % BLOCK + BLOCK) % BLOCK - BLOCK / 2);
  const dy = Math.abs(((y + BLOCK / 2) % BLOCK + BLOCK) % BLOCK - BLOCK / 2);
  return dx <= HALF || dy <= HALF;
}
export function buildingRectsNear(x, y, radius = 2) {
  const result = [];
  const ix = Math.round(x / BLOCK), iy = Math.round(y / BLOCK);
  for (let i = ix - radius; i <= ix + radius; i++) {
    for (let j = iy - radius; j <= iy + radius; j++) {
      const margin = 22;
      result.push({x: i * BLOCK + HALF + margin, y: j * BLOCK + HALF + margin,
        w: BLOCK - ROAD - margin * 2, h: BLOCK - ROAD - margin * 2, i, j});
    }
  }
  return result;
}
export function circleHitsBuilding(x, y, radius = 18) {
  // Nearest block center is half-grid offset from road centerlines.
  const bx = Math.floor(x / BLOCK) * BLOCK + BLOCK / 2;
  const by = Math.floor(y / BLOCK) * BLOCK + BLOCK / 2;
  const half = (BLOCK - ROAD) / 2 - 22;
  const cx = clamp(x, bx - half, bx + half);
  const cy = clamp(y, by - half, by + half);
  return (x - cx) ** 2 + (y - cy) ** 2 < radius ** 2;
}
function newPolice(s, idx) {
  const p = s.player;
  const q = s.random();
  const radius = 365 + s.random() * 110;
  const a = s.random() * TAU;
  let x = p.x + Math.cos(a) * radius, y = p.y + Math.sin(a) * radius;
  // Spawn on a clear road: snap along the nearest road centerline.
  if (q < 0.5) x = Math.round(x / BLOCK) * BLOCK;
  else y = Math.round(y / BLOCK) * BLOCK;
  return {id: idx, x, y, angle: Math.atan2(p.y-y,p.x-x), speed: 90 + s.random()*28,
    stun: 0, close: false, color: idx%2?'blue':'red'};
}
export function createGame(seed = 'daily', opts = {}) {
  const random = rng(seed);
  const s = {seed:String(seed), version:SIM_VERSION, ticks:0, random,
    state:'playing', win:false, health:3, invuln:0, points:0, closeCalls:0,
    hits:0, police:[], traffic:[], marks:[], particles:[],
    player:{x:0,y:0,angle:-Math.PI / 2,speed:250,drift:0},
    events:[], nextPolice:0, nextTraffic:0, nextRoadblock:0};
  s.player.x=0; s.player.y=0;
  if (!opts.noPolice) { s.police.push(newPolice(s,0)); s.nextPolice=8*60; }
  return s;
}
function damage(s, type) {
  if (s.invuln>0 || s.state!=='playing') return;
  s.health--; s.hits++; s.points=Math.max(0,s.points-150); s.invuln=0.95;
  s.events.push({type:'hit',kind:type,tick:s.ticks});
  if (s.health<=0) {s.state='ended';s.events.push({type:'end',tick:s.ticks});}
}
function spawnTraffic(s) {
  const p=s.player;
  let x,y,angle;
  if(s.random()<0.5) {
    y=Math.round(p.y/BLOCK)*BLOCK + (s.random()<0.5?-48:48);
    x=p.x+(s.random()<0.5?-1:1)*(370+s.random()*260);
    angle=x>p.x?Math.PI:0;
  } else {
    x=Math.round(p.x/BLOCK)*BLOCK + (s.random()<0.5?-48:48);
    y=p.y+(s.random()<0.5?-1:1)*(370+s.random()*260);
    angle=y>p.y?-Math.PI/2:Math.PI/2;
  }
  s.traffic.push({x,y,angle,speed:45+s.random()*35,passed:false,color:Math.floor(s.random()*4)});
}
function spawnRoadblock(s) {
  const p=s.player;
  // One visible, avoidable hazard adjacent to a crossroad, with 2 free lanes.
  const ahead=480;
  const tx=p.x+Math.cos(p.angle)*ahead, ty=p.y+Math.sin(p.angle)*ahead;
  const vertical=Math.abs(Math.sin(p.angle))>Math.abs(Math.cos(p.angle));
  if(vertical) {
    const x=Math.round(tx/BLOCK)*BLOCK-43;
    s.marks.push({x,y:Math.round(ty/BLOCK)*BLOCK + (p.angle>0?-190:190),ttl:13});
  } else {
    const y=Math.round(ty/BLOCK)*BLOCK-43;
    s.marks.push({x:Math.round(tx/BLOCK)*BLOCK +(Math.cos(p.angle)>0?-190:190),y,ttl:13});
  }
}
export function stepGame(s, steer=0) {
  if(s.state!=='playing') return s;
  const dt=1/TICK_RATE; s.ticks++;
  steer=clamp(Number.isFinite(steer)?steer:0,-1,1);
  if(s.invuln>0) s.invuln=Math.max(0,s.invuln-dt);
  const p=s.player;
  // Readable, high-grip arcade controls. Speed continues without input.
  const intensity= Math.abs(steer);
  p.speed=clamp(p.speed+(intensity>0.8?-14:8)*dt,205,265);
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
    if(s.ticks%55===0){s.events.push({type:'scrape',tick:s.ticks});}
  }
  if(intensity>0.82 && s.ticks%24===0) s.points+=8;
  const elapsed=s.ticks/TICK_RATE;
  if(s.ticks>=s.nextPolice && s.police.length<Math.min(6,1+Math.floor(elapsed/9))) {
    s.police.push(newPolice(s,s.police.length));s.nextPolice=s.ticks+9*TICK_RATE;
    s.events.push({type:'police',tick:s.ticks});
  }
  if(s.ticks>=s.nextTraffic) {spawnTraffic(s);s.nextTraffic=s.ticks + Math.round((4.4-s.ticks/MAX_TICKS*2)*TICK_RATE);}
  if(elapsed>24 && s.ticks>=s.nextRoadblock) {spawnRoadblock(s);s.nextRoadblock=s.ticks+Math.round(9*TICK_RATE);s.events.push({type:'roadblock',tick:s.ticks});}
  for(const car of s.police) {
    if(car.stun>0){car.stun-=dt;continue;}
    const lead=0.4+Math.min(0.65,elapsed/100);
    const targetX=p.x+Math.cos(p.angle)*p.speed*lead;
    const targetY=p.y+Math.sin(p.angle)*p.speed*lead;
    let desired=Math.atan2(targetY-car.y,targetX-car.x);
    let delta=normAngle(desired-car.angle);
    car.angle=normAngle(car.angle+clamp(delta,-2.15*dt,2.15*dt));
    car.speed=clamp(car.speed+70*dt,125,175+Math.min(45,elapsed*.7));
    const px=car.x,py=car.y;
    car.x+=Math.cos(car.angle)*car.speed*dt;
    car.y+=Math.sin(car.angle)*car.speed*dt;
    if(circleHitsBuilding(car.x,car.y,16)) {car.x=px;car.y=py;car.angle=normAngle(car.angle + (car.id%2?1:-1)*0.24);car.stun=.1;}
    const d=dist(p,car);
    if(d<34){damage(s,'police');car.stun=0.65;car.x-=Math.cos(car.angle)*35;car.y-=Math.sin(car.angle)*35;}
    if(d<77 && d>38 && !car.close && s.invuln===0) {car.close=true;s.points+=90;s.closeCalls++;s.events.push({type:'near',tick:s.ticks});}
    if(d>110) car.close=false;
    if(d>1250){Object.assign(car,newPolice(s,car.id));}
  }
  for(const car of s.traffic) {
    car.x+=Math.cos(car.angle)*car.speed*dt;
    car.y+=Math.sin(car.angle)*car.speed*dt;
    const d=dist(p,car);
    if(d<31)damage(s,'traffic');
    else if(d<64&&!car.passed&&s.invuln===0){car.passed=true;s.points+=55;s.closeCalls++;s.events.push({type:'near',tick:s.ticks});}
  }
  s.traffic=s.traffic.filter(car=>dist(p,car)<1050);
  for(const mark of s.marks){mark.ttl-=dt;if(dist(p,mark)<38) damage(s,'roadblock');}
  s.marks=s.marks.filter(mark=>mark.ttl>0&&dist(p,mark)<1100);
  if(s.ticks>=MAX_TICKS && s.state==='playing'){s.state='ended';s.win=true;s.events.push({type:'win',tick:s.ticks});}
  return s;
}
export function gameResult(s){return {version:SIM_VERSION,seed:s.seed,timeMs:Math.min(60000,Math.round(s.ticks*1000/TICK_RATE)),points:s.points,health:s.health,win:s.win,closeCalls:s.closeCalls,hits:s.hits};}
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
