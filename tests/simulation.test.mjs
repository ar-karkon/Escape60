import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,stepGame,gameResult,replayTrace,encodeTrace,MAX_TICKS,hashSeed,circleHitsBuilding,compareResult} from '../web/src/simulation.js';
test('same seed and inputs are deterministic',()=>{const a=createGame('foo'),b=createGame('foo');for(let i=0;i<800;i++){const steer=(i%45<15?-1:i%45<30?0:1);stepGame(a,steer);stepGame(b,steer);}assert.deepEqual(gameResult(a),gameResult(b));});
test('replay result matches gameplay',()=>{const s=createGame('run-1');const inputs=[];while(s.state==='playing'){const v=s.ticks%45<15?-3:s.ticks%45<30?0:3;inputs.push(v);stepGame(s,v/3);}assert.deepEqual(replayTrace('run-1',encodeTrace(inputs)),gameResult(s));});
test('rejects malicious traces',()=>{assert.throws(()=>replayTrace('a',[[4,60]]));assert.throws(()=>replayTrace('a',[[0,MAX_TICKS+1]]));assert.throws(()=>replayTrace('a',[[0,10]]));});
test('roads and buildings',()=>{assert.equal(circleHitsBuilding(0,0),false);assert.equal(circleHitsBuilding(260,260),true);});
test('score sort',()=>{assert.ok(compareResult({timeMs:60000,points:1},{timeMs:59000,points:200})<0);});
