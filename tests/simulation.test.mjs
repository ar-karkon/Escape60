import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,gameResult,replayTrace,encodeTrace,MAX_TICKS,hashSeed,circleHitsBuilding,compareResult} from '../web/src/simulation.js';
test('same seed and inputs are deterministic',()=>{const a=createGame('foo'),b=createGame('foo');for(let i=0;i<800;i++){const steer=(i%45<15?-1:i%45<30?0:1);stepGame(a,steer);stepGame(b,steer);}assert.deepEqual(gameResult(a),gameResult(b));});
test('replay result matches gameplay',()=>{const s=createGame('run-1');const inputs=[];while(s.state==='playing'){const v=s.ticks%45<15?-3:s.ticks%45<30?0:3;inputs.push(v);stepGame(s,v/3);}assert.deepEqual(replayTrace('run-1',encodeTrace(inputs)),gameResult(s));});
test('rejects malicious traces',()=>{assert.throws(()=>replayTrace('a',[[4,60]]));assert.throws(()=>replayTrace('a',[[0,MAX_TICKS+1]]));assert.throws(()=>replayTrace('a',[[0,10]]));});
test('roads and buildings',()=>{assert.equal(circleHitsBuilding(0,0),false);assert.equal(circleHitsBuilding(260,260),true);});
test('score sort',()=>{assert.ok(compareResult({timeMs:60000,points:1},{timeMs:59000,points:200})<0);});

test('pursuit director opens the first and final block at their scheduled ticks',()=>{
 const game=createGame('sunset-1');
 while(game.state==='playing'){
   stepGame(game);
   for(const mark of game.marks)assert.ok(Number.isFinite(mark.angle));
 }
 assert.equal(game.win,true);
 const barriers=game.events.filter(e=>e.type==='roadblock');
 assert.equal(barriers[0].tick,25*60);
 assert.ok(barriers.some(e=>e.tick===55*60));
 assert.equal(game.events.find(e=>e.type==='police').tick,10*60);
});
test('a barrier hit slows the car and protects it from repeated damage',()=>{
 const game=createGame('training',{noPolice:true});
 game.marks.push({x:0,y:-4,ttl:2});
 stepGame(game);
 assert.equal(game.player.speed,205);
 assert.equal(game.health,2);
 stepGame(game);
 assert.equal(game.health,2);
 assert.equal(game.hits,1);
});
test('old town alleys are passable between solid storefronts',()=>{
 const districtStart=3*520;
 assert.equal(circleHitsBuilding(districtStart+260,167,16),false);
 assert.equal(circleHitsBuilding(districtStart+167,167,16),true);
});
