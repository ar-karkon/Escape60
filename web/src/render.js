import {buildingRectsNear, hashSeed, MAX_TICKS, TICK_RATE} from './simulation.js';
const BLOCK=520,ROAD=184,TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const noise=(x,y)=>{let a=hashSeed(`${x},${y}`);return ((a ^ (a>>>11))*0.0000000002328306)%1;};
const n=(x,y)=>Math.abs(noise(x,y));
function rect(ctx,x,y,w,h,color,r=0){ctx.fillStyle=color;if(r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}else ctx.fillRect(x,y,w,h);}
function circle(ctx,x,y,r,color){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fillStyle=color;ctx.fill();}
function glow(ctx,x,y,r,color,alpha=1){ctx.save();ctx.globalAlpha=alpha;const grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,color);grad.addColorStop(1,'transparent');circle(ctx,x,y,r,grad);ctx.restore();}
function city(ctx,camera,w,h){
  const radius=Math.hypot(w,h)/2+600;
  const ix=Math.floor((camera.x-radius)/BLOCK)-1,ax=Math.floor((camera.x+radius)/BLOCK)+1;
  const iy=Math.floor((camera.y-radius)/BLOCK)-1,ay=Math.floor((camera.y+radius)/BLOCK)+1;
  rect(ctx,camera.x-radius,camera.y-radius,radius*2,radius*2,'#151a2d');
  for(let i=ix;i<=ax;i++)for(let j=iy;j<=ay;j++){
    const x=i*BLOCK,y=j*BLOCK;
    rect(ctx,x-ROAD/2,y-ROAD/2,BLOCK+ROAD,ROAD,'#272d3a');
    rect(ctx,x-ROAD/2,y-ROAD/2,ROAD,BLOCK+ROAD,'#272d3a');
    // Lane center dashes with slight luminous edges.
    for(let k=0;k<7;k++){
      rect(ctx,x + 115 + k*57,y-2,27,4,'#667078');
      rect(ctx,x-2,y+115+k*57,4,27,'#667078');
    }
    rect(ctx,x+ROAD/2+7,y+ROAD/2+7,BLOCK-ROAD-14,BLOCK-ROAD-14,'#0f1825');
  }
  for(const b of buildingRectsNear(camera.x,camera.y,Math.ceil(radius/BLOCK)+1)){
    const palette=['#1b2337','#20283d','#192339','#232b40'];const f=n(b.i,b.j);
    const col=palette[Math.floor(f*palette.length)%palette.length];
    rect(ctx,b.x+15,b.y+19,b.w,b.h,'#080b17',10);
    rect(ctx,b.x,b.y,b.w,b.h,'#33405a',9);
    rect(ctx,b.x+5,b.y+5,b.w-10,b.h-10,col,5);
    rect(ctx,b.x+8,b.y+8,b.w-16,8,f>.55?'#273e57':'#2c3149');
    // Rooftop light wells and windows.
    for(let k=0;k<5;k++)for(let l=0;l<4;l++) {
      if(n(b.i*19+k,b.j*11+l)>.53){
        const color=n(k+b.i,l+b.j)>.58?'#0c6f82':'#5b536a';
        rect(ctx,b.x+25+k*(b.w-45)/5,b.y+25+l*(b.h-45)/4,13,5,color,1);
      }
    }
  }
}
function car(ctx,x,y,angle,theme='player',boost=0){
  ctx.save();ctx.translate(x,y);ctx.rotate(angle+Math.PI/2);
  const body=theme==='player'?'#f4b44e':theme==='red'?'#eb6267':theme==='blue'?'#5b9bf4':['#7c9eaa','#b6c5db','#a389a7','#80af99'][theme%4];
  glow(ctx,0,13,60,theme==='player'?'rgba(255,141,40,.24)':theme==='red'?'rgba(255,54,74,.23)':'rgba(28,124,255,.2)',.8);
  rect(ctx,-17,-27,36,62,'#080e18',9);
  rect(ctx,-16,-30,32,58,body,7);
  rect(ctx,-12,-23,24,14,'#132e43',3);
  rect(ctx,-12,6,24,11,'#26364d',3);
  rect(ctx,-14,23,10,5,'#f4515c',1);rect(ctx,4,23,10,5,'#f4515c',1);
  rect(ctx,-14,-29,9,4,'#feefaf',2);rect(ctx,5,-29,9,4,'#feefaf',2);
  if(theme==='red'||theme==='blue'){rect(ctx,-13,-2,26,5,'#e6eef5',2);rect(ctx,-10,-3,10,7,'#e84b5b');rect(ctx,1,-3,10,7,'#348df2');}
  if(theme==='player'){rect(ctx,-6,-12,12,19,'#d28c37',2);if(boost>0.45){glow(ctx,0,36,31,'#f9ac3e',.4);}}
  ctx.restore();
}
function roadway(ctx,s){
  for(const mark of s.marks){glow(ctx,mark.x,mark.y,75,'#ed414a',.4);ctx.save();ctx.translate(mark.x,mark.y);rect(ctx,-37,-17,74,34,'#e3b64d',5);for(let j=-25;j<30;j+=20){rect(ctx,j,-17,10,34,'#23242b');}ctx.restore();}
  for(const c of s.traffic)car(ctx,c.x,c.y,c.angle,c.color);
  for(const c of s.police)car(ctx,c.x,c.y,c.angle,c.color);
}
function markers(ctx,s,w,h){
 const player=s.player;
 for(const c of s.police){const dx=c.x-player.x,dy=c.y-player.y;const d=Math.hypot(dx,dy);if(d<470)continue;
   // offscreen danger arrows near camera center, rotating with camera orientation
   const a=Math.atan2(dy,dx)-player.angle-Math.PI/2;
   const x=Math.cos(a)*Math.min(w,h)*.35,y=Math.sin(a)*Math.min(w,h)*.35;
   ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);ctx.beginPath();ctx.moveTo(0,-11);ctx.lineTo(-8,9);ctx.lineTo(8,9);ctx.closePath();ctx.fillStyle='rgba(255,99,110,.9)';ctx.fill();ctx.restore();
 }
}
export function renderGame(canvas,ctx,s,now,settings={}){
  const width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height)return;
  const pixelRatio=canvas.width/width;
  ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  ctx.clearRect(0,0,width,height);
  const p=s?s.player:{x:0,y:0,angle:-Math.PI/2};
  const camRotation=-p.angle-Math.PI/2;
  const zoom=clamp(Math.min(width/540,height/690),.58,1.08);
  const renderSize={x:p.x,y:p.y};
  // Landscape has wider area, portrait preserves a useful view ahead.
  ctx.save();ctx.translate(width/2,height*.53);ctx.scale(zoom,zoom);ctx.rotate(camRotation);
  ctx.translate(-p.x,-p.y);
  city(ctx,renderSize,width/zoom,height/zoom);
  if(s){
    roadway(ctx,s);
    if(s.invuln<=0||Math.floor(now/110)%2===0)car(ctx,p.x,p.y,p.angle,'player',p.drift);
    if(p.drift>.45&&!settings.reducedMotion){
      for(let k=0;k<3;k++)glow(ctx,p.x+Math.cos(p.angle+Math.PI/2)*((k-1)*18),p.y+Math.sin(p.angle+Math.PI/2)*((k-1)*18),18,'rgba(250,169,62,.15)');
    }
    markers(ctx,s,width/zoom,height/zoom);
  }else car(ctx,0,0,-Math.PI/2,'player');
  ctx.restore();
  // Atmospheric gradient to integrate HUD with the city.
  const v=ctx.createLinearGradient(0,0,0,height);
  v.addColorStop(0,'rgba(8,11,26,.55)');v.addColorStop(.25,'rgba(8,11,26,0)');v.addColorStop(.73,'rgba(8,11,26,0)');v.addColorStop(1,'rgba(8,11,26,.56)');
  rect(ctx,0,0,width,height,v);
}
