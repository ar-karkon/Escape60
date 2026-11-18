import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {handler} from '../server/server.mjs';
import {createGame,stepGame,encodeTrace,gameResult} from '../web/src/simulation.js';

test('API validates replays and persists only accepted results', async () => {
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=(url,payload)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const seed=`integration-${process.pid}`;
  try {
    const health=await (await fetch(base+'/api/v1/health')).json();
    assert.equal(health.status,'ok');
    const ticket=await (await post('/api/v1/runs/start',{seed})).json();
    assert.ok(ticket.runId && ticket.token);
    const game=createGame(seed),steps=[];
    while(game.state==='playing'){
      const steer=game.ticks%140<70?0:1;
      const digit=steer*3;
      steps.push(digit);stepGame(game,steer);
    }
    const trace=encodeTrace(steps),result=gameResult(game);
    const bad=await post('/api/v1/runs/finish',{...ticket,trace,result:{...result,points:result.points+9999}});
    assert.equal(bad.status,422);
    // Test clock only: emulate the legitimate passage of playtime without a 60s test wait.
    const now=Date.now;Date.now=()=>now()+120000;
    let accepted;
    try{accepted=await post('/api/v1/runs/finish',{runId:ticket.runId,token:ticket.token,trace,result});}finally{Date.now=now;}
    assert.equal(accepted.status,200,await accepted.text());
    const lead=await (await fetch(base+`/api/v1/leaderboard?seed=${seed}`)).json();
    assert.ok(lead.entries.length>0);
    const reuse=await post('/api/v1/runs/finish',{runId:ticket.runId,token:ticket.token,trace,result});
    assert.equal(reuse.status,401);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
