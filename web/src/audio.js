export class SoundEngine {
  constructor(){this.enabled=false;this.ctx=null;}
  toggle(){this.enabled=!this.enabled;if(this.enabled&&typeof AudioContext!=='undefined')this.ctx??=new AudioContext();return this.enabled;}
  beep(freq=400,length=.09,type='triangle',gain=.055){
    if(!this.enabled||!this.ctx)return;
    try{if(this.ctx.state==='suspended')this.ctx.resume();const osc=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;
      osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(Math.max(70,freq*.7),t+length);
      g.gain.setValueAtTime(gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+length);
      osc.connect(g);g.connect(this.ctx.destination);osc.start(t);osc.stop(t+length);
    }catch{}
  }
}
