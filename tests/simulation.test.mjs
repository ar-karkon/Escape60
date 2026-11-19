import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,gameResult,replayTrace,encodeTrace,MAX_TICKS,hashSeed,circleHitsBuilding,compareResult} from '../web/src/simulation.js';
test('same seed and inputs are deterministic',()=>{const a=createGame('foo'),b=createGame('foo');for(let i=0;i<800;i++){const steer=(i%45<15?-1:i%45<30?0:1);stepGame(a,steer);stepGame(b,steer);}assert.deepEqual(gameResult(a),gameResult(b));});
test('replay result matches gameplay',()=>{const s=createGame('run-1');const inputs=[];while(s.state==='playing'){const v=s.ticks%45<15?-3:s.ticks%45<30?0:3;inputs.push(v);stepGame(s,v/3);}assert.deepEqual(replayTrace('run-1',encodeTrace(inputs)),gameResult(s));});
test('rejects malicious traces',()=>{assert.throws(()=>replayTrace('a',[[4,60]]));assert.throws(()=>replayTrace('a',[[0,MAX_TICKS+1]]));assert.throws(()=>replayTrace('a',[[0,10]]));});
test('roads and buildings',()=>{assert.equal(circleHitsBuilding(0,0),false);assert.equal(circleHitsBuilding(260,260),true);});
test('score sort',()=>{assert.ok(compareResult({timeMs:60000,points:1},{timeMs:59000,points:200})<0);});

test('pursuit director follows its schedule and only places barriers on open streets',async()=>{
 const { DIRECTOR } = await import('../web/src/simulation.js');
 const game=createGame('sunset-1');
 while(game.state==='playing'&&game.ticks<DIRECTOR.finalRoadblock*60+1){
   stepGame(game);
   for(const mark of game.marks){assert.ok(Number.isFinite(mark.angle));assert.ok(game.map.onStreet(mark.x,mark.y));}
 }
 const barriers=game.events.filter(e=>e.type==='roadblock');
 assert.ok(barriers.length>=1);
 assert.ok(barriers[0].tick>=DIRECTOR.roadblockFrom*60);
 assert.equal(game.events.find(e=>e.type==='police').tick,DIRECTOR.policeAt[1]*60);
});
test('the street network has avenues, dead ends and closed segments, deterministically per seed',async()=>{
 const { cityMap } = await import('../web/src/map.js');
 const a=cityMap('net-a'), b=cityMap('net-a'), c=cityMap('net-b');
 const counts=[0,0,0,0]; let differs=0;
 for(let i=-12;i<12;i++)for(let j=-12;j<12;j++)for(const ax of [0,1]){counts[a.seg(ax,i,j)]++; if(a.seg(ax,i,j)!==b.seg(ax,i,j))throw Error('not deterministic'); if(a.seg(ax,i,j)!==c.seg(ax,i,j))differs++;}
 assert.ok(counts[0]>20&&counts[2]>20&&counts[3]>20&&counts[1]>500, JSON.stringify(counts));
 assert.ok(differs>50);
 for(let j=-10;j<10;j++){assert.equal(a.seg(0,0,j),1);assert.equal(a.seg(1,j,0),1);} // avenues stay open
 let deadEnds=0; for(let i=-12;i<12;i++)for(let j=-12;j<12;j++)if(a.degree(i,j)===1)deadEnds++;
 assert.ok(deadEnds>5,'dead ends '+deadEnds);
});
test('traffic follows streets and never drives into buildings',()=>{
 for(const seed of ['street-a','street-b']){
   const game=createGame(seed);
   for(let i=0;i<40*60&&game.state==='playing';i++){
     stepGame(game,0);
     for(const c of game.traffic) assert.equal(game.map.circleHits(c.x,c.y,10),false);
   }
 }
});
test('a barrier hit costs a fixed slice of the health bar and protects from repeat damage',()=>{
 const game=createGame('training',{noPolice:true,noTraffic:true});
 game.marks.push({x:0,y:-4,ttl:2});
 stepGame(game);
 assert.equal(game.player.speed,205);
 assert.equal(game.health,70);
 stepGame(game);
 assert.equal(game.health,70);
 assert.equal(game.hits,1);
});
test('damage scales with closing speed: head-on hurts more than a rear-end tap',()=>{
 const headOn=createGame('dmg-a',{noPolice:true,noTraffic:true}); headOn.nextTraffic=1e9;
 headOn.traffic.push({x:0,y:-10,angle:Math.PI/2,speed:80,passed:false,color:0,lane:1,nx:0,ny:0,plan:null});
 stepGame(headOn);
 const rear=createGame('dmg-b',{noPolice:true,noTraffic:true}); rear.nextTraffic=1e9;
 rear.traffic.push({x:0,y:-10,angle:-Math.PI/2,speed:80,passed:false,color:0,lane:1,nx:0,ny:-1,plan:null});
 stepGame(rear);
 const a=100-headOn.health, b=100-rear.health;
 assert.ok(a>b && b>=16 && a<=34, `head-on ${a} vs rear ${b}`);
});
test('health recovers slowly after a calm period, never above the maximum',async()=>{
 const { MAX_HEALTH, REGEN_DELAY } = await import('../web/src/simulation.js');
 const game=createGame('regen',{noPolice:true,noTraffic:true}); game.nextTraffic=1e9; game.nextPolice=1e9;
 game.marks.push({x:0,y:-4,ttl:2}); stepGame(game);
 const after=game.health;
 for(let i=0;i<Math.round(REGEN_DELAY*60)-5;i++)stepGame(game);
 assert.equal(game.health,after);
 for(let i=0;i<180;i++)stepGame(game);
 assert.ok(game.health>after && game.health<=MAX_HEALTH);
 for(let i=0;i<60*40;i++){ if(game.state!=='playing')break; stepGame(game); }
 assert.ok(game.health<=MAX_HEALTH);
});
test('wall bumps cost a little health with a cooldown and never a combo',()=>{
 const game=createGame('wall',{noPolice:true,noTraffic:true}); game.nextTraffic=1e9;
 game.player.x=100; game.player.y=-260; game.player.angle=0; // drive into the block face
 game.chain=2; game.comboTimer=2;
 for(let i=0;i<30;i++)stepGame(game);
 assert.ok(game.scrapes>=1 && game.scrapes<=2, 'scrapes '+game.scrapes);
 assert.equal(game.health,100-3*game.scrapes);
 assert.equal(game.hits,0);
});
test('traffic and police enter outside the forward view',()=>{
 for(const seed of ['view-a','view-b','view-c']){
   const game=createGame(seed);
   for(const c of game.traffic) assert.ok(Math.hypot(c.x,c.y)>=370, 'initial car too close');
   const before=new Set(game.traffic);
   for(let i=0;i<20*60&&game.state==='playing';i++){
     stepGame(game);
     const p=game.player;
     for(const c of game.traffic) if(!before.has(c)){ before.add(c); assert.ok(Math.hypot(c.x-p.x,c.y-p.y)>=900, 'traffic spawned in view'); }
   }
 }
});
test('old town alleys are passable between solid storefronts',()=>{
 const districtStart=3*520;
 assert.equal(circleHitsBuilding(districtStart+260,167,16),false);
 assert.equal(circleHitsBuilding(districtStart+167,167,16),true);
});

test('near-miss chain multiplies skill points and a hit resets it', async () => {
  const { comboMult, COMBO_WINDOW } = await import('../web/src/simulation.js');
  const game = createGame('combo', { noPolice: true, noTraffic: true });
  game.nextTraffic = 1e9;
  game.traffic.push({ x: 45, y: -10, angle: 0, speed: 0, passed: false, color: 0 });
  stepGame(game);
  assert.equal(game.points, 55);
  assert.equal(comboMult(game), 1);
  game.traffic.push({ x: -45, y: -20, angle: 0, speed: 0, passed: false, color: 1 });
  stepGame(game);
  assert.equal(game.points, 55 + 110);
  assert.equal(comboMult(game), 2);
  assert.equal(game.events.filter((e) => e.type === 'near').at(-1).mult, 2);
  game.traffic.push({ x: 0, y: game.player.y - 5, angle: 0, speed: 0, passed: false, color: 2 });
  stepGame(game);
  assert.equal(game.hits, 1);
  assert.equal(comboMult(game), 1);
  assert.equal(game.bestChain, 2);
  // the chain also expires on its own
  const g2 = createGame('combo-expire', { noPolice: true, noTraffic: true });
  g2.nextTraffic = 1e9;
  g2.traffic.push({ x: 45, y: -10, angle: 0, speed: 0, passed: false, color: 0 });
  stepGame(g2);
  for (let i = 0; i < Math.ceil(COMBO_WINDOW * 60) + 2; i++) stepGame(g2);
  assert.equal(g2.chain, 0);
});
test('a close roadblock dodge scores and counts once', () => {
  const game = createGame('dodge', { noPolice: true, noTraffic: true });
  game.nextTraffic = 1e9;
  game.marks.push({ x: 55, y: -20, ttl: 5, angle: 0 });
  stepGame(game); stepGame(game);
  assert.equal(game.dodges, 1);
  assert.equal(game.points, 120);
  assert.equal(game.health, 100);
});
