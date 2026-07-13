
let ctx=null,master=null,musicTimer=null,musicStep=0,musicOn=false;
function ensure(){
  if(ctx)return;
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  master=ctx.createGain();master.gain.value=.24;master.connect(ctx.destination);
}
function tone(freq=220,dur=.08,type="square",gain=.08,when=0){
  ensure();const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+when;
  o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(gain,t);
  g.gain.exponentialRampToValueAtTime(.001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur);
}
function noise(dur=.08,gain=.08){
  ensure();const len=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
  for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=buf;g.gain.value=gain;s.connect(g);g.connect(master);s.start();
}
export function sfx(name){
  try{
    if(name==="click"){tone(180,.045,"square",.035);tone(260,.035,"square",.025,.03)}
    else if(name==="spin"){tone(220,.05,"triangle",.04);tone(280,.05,"triangle",.035,.05)}
    else if(name==="lock"){tone(180,.09,"sawtooth",.06);tone(360,.12,"square",.045,.08)}
    else if(name==="hit"){noise(.07,.12);tone(92,.1,"sawtooth",.06)}
    else if(name==="glance"){noise(.04,.05);tone(260,.07,"triangle",.035)}
    else if(name==="miss"){tone(520,.08,"sine",.035);tone(390,.1,"sine",.025,.05)}
    else if(name==="crit"){noise(.1,.15);tone(120,.12,"sawtooth",.09);tone(480,.15,"square",.05)}
    else if(name==="ko"){tone(150,.22,"sawtooth",.08);tone(75,.35,"square",.08,.08)}
    else if(name==="win"){[261,329,392,523].forEach((f,i)=>tone(f,.22,"triangle",.06,i*.09))}
    else if(name==="lose"){[220,185,147,110].forEach((f,i)=>tone(f,.25,"sawtooth",.045,i*.11))}
    else if(name==="status"){tone(310,.12,"sine",.035);tone(270,.15,"sine",.03,.06)}
  }catch{}
}
export function startFightMusic(enabled=true){
  if(!enabled||musicOn)return;ensure();musicOn=true;musicStep=0;
  const bass=[55,55,65.4,55,73.4,65.4,55,49];
  musicTimer=setInterval(()=>{
    if(!musicOn)return;
    const f=bass[musicStep%bass.length];tone(f,.22,"sawtooth",.028);tone(f*2,.07,"square",.015,.11);
    if(musicStep%2===0)noise(.025,.018);
    musicStep++;
  },280);
}
export function stopFightMusic(){musicOn=false;if(musicTimer){clearInterval(musicTimer);musicTimer=null}}
export function setVolume(v){ensure();master.gain.value=v}
