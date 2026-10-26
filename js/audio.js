// 刃线 Edgeline 音频：Web Audio 实时合成 BGM 和音效。
// audio/manifest.json 里登记过的文件（audio/bgm.mp3、audio/sfx/<名字>.mp3）会替换掉对应的合成音。
// 没有 AudioContext 的环境（Node 测试）里整个模块是空操作。
(function(){
'use strict';
const AC=window.AudioContext||window.webkitAudioContext;
const PREF='edgeline-audio';
const state={music:true,sfx:true,muted:false};
try{Object.assign(state,JSON.parse(localStorage.getItem(PREF)||'{}'));}catch(e){}
const save=()=>{try{localStorage.setItem(PREF,JSON.stringify(state));}catch(e){}};
const api={state,ctx:null,out:null,loaded:[],unlock(){},event(){},update(){},
  set(k,v){state[k]=!!v;save();},
  toggleMute(){state.muted=!state.muted;save();return state.muted;}};
window.EdgelineAudio=api;
if(!AC)return;

const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const mtof=m=>440*Math.pow(2,(m-69)/12);
let ctx=null,master,musicBus,musicLP,sfxBus,noise,delay,started=false;
const files={};               // 名字 → AudioBuffer（从 audio/ 加载的替换文件）
const LOOPS=['wind','carve','skid','powder','butter'];
const loops={};               // 持续音：每路一个 gain
let charge=null,bgmFile=null;

function init(){
  ctx=new AC();api.ctx=ctx;
  master=ctx.createGain();master.connect(ctx.destination);api.out=master;
  const comp=ctx.createDynamicsCompressor();comp.threshold.value=-14;comp.ratio.value=3;comp.connect(master);
  musicBus=ctx.createGain();musicLP=ctx.createBiquadFilter();musicLP.type='lowpass';musicLP.frequency.value=16000;musicLP.Q.value=.6;
  musicBus.connect(musicLP);musicLP.connect(comp);
  sfxBus=ctx.createGain();sfxBus.connect(comp);
  // 琶音的 3/16 拍延迟回声
  delay=ctx.createDelay(1);delay.delayTime.value=60/104*.75;const fb=ctx.createGain();fb.gain.value=.32;const dl=ctx.createBiquadFilter();dl.type='lowpass';dl.frequency.value=2400;
  delay.connect(dl);dl.connect(fb);fb.connect(delay);dl.connect(musicBus);
  // 2 秒白噪声，所有噪声类声音共用
  const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;noise=b;
  buildLoops();applyGains(true);
  loadFiles();
}
function noiseSrc(){const s=ctx.createBufferSource();s.buffer=noise;s.loop=true;s.loopStart=Math.random();return s;}
function filt(type,f,q){const n=ctx.createBiquadFilter();n.type=type;n.frequency.value=f;n.Q.value=q||.7;return n;}
function applyGains(now){
  const t=ctx.currentTime,k=now?.001:.08;
  master.gain.setTargetAtTime(state.muted?0:1,t,k);
  musicBus.gain.setTargetAtTime(state.music?.5:0,t,k);
  sfxBus.gain.setTargetAtTime(state.sfx?.9:0,t,k);
}

/* ---------- 持续音：风声 + 雪板摩擦，按速度和滑行状态调音量 ---------- */
function buildLoops(){
  const src=noiseSrc();
  const mk=(name,chain)=>{const g=ctx.createGain();g.gain.value=0;let node=src;const fs=[];for(const f of chain){node.connect(f);node=f;fs.push(f);}node.connect(g);g.connect(sfxBus);loops[name]={g,fs,head:fs[0]};};
  mk('wind',[filt('bandpass',400,.5)]);
  mk('carve',[filt('highpass',1800,.7),filt('bandpass',3200,2.2)]);
  mk('skid',[filt('bandpass',900,.6),filt('lowpass',3800,.5)]);
  mk('powder',[filt('lowpass',520,.6)]);
  mk('butter',[filt('bandpass',1500,1.4)]);
  src.start();
  // 蓄力时的上升音
  const o=ctx.createOscillator();o.type='triangle';o.frequency.value=180;const lp=filt('lowpass',1400,.7),g=ctx.createGain();g.gain.value=0;o.connect(lp);lp.connect(g);g.connect(sfxBus);o.start();charge={o,g};
}
function useLoopFile(name){ // 用文件替换某一路持续音：断开噪声链，接上循环播放的 buffer
  const L=loops[name];if(!L||!files[name])return;
  L.fs[L.fs.length-1].disconnect();const s=ctx.createBufferSource();s.buffer=files[name];s.loop=true;s.connect(L.g);s.start();
}

/* ---------- 一次性音效 ---------- */
function env(g,t,a,peak,dec){g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(peak,t+a);g.gain.exponentialRampToValueAtTime(.0001,t+a+dec);}
function thump(t,f0,f1,dur,vol){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);env(g,t,.004,vol,dur);o.connect(g);g.connect(sfxBus);o.start(t);o.stop(t+dur+.05);}
function hiss(t,type,f,q,dur,vol,f2,bus){const s=noiseSrc(),n=filt(type,f,q),g=ctx.createGain();if(f2)n.frequency.exponentialRampToValueAtTime(f2,t+dur);env(g,t,.006,vol,dur);s.connect(n);n.connect(g);g.connect(bus||sfxBus);s.start(t);s.stop(t+dur+.05);}
function tone(t,m,dur,vol,type,bus){const o=ctx.createOscillator(),g=ctx.createGain();o.type=type||'triangle';o.frequency.value=mtof(m);env(g,t,.008,vol,dur);o.connect(g);g.connect(bus||sfxBus);o.start(t);o.stop(t+dur+.05);return o;}
function playFile(name,vol,rate){const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=files[name];s.playbackRate.value=rate||1;g.gain.value=vol;s.connect(g);g.connect(sfxBus);s.start();}
function duck(amount,hold){const t=ctx.currentTime;musicBus.gain.cancelScheduledValues(t);musicBus.gain.setTargetAtTime(state.music?.5*amount:0,t,.03);musicBus.gain.setTargetAtTime(state.music?.5:0,t+hold,.6);}
const SFX={
  pop(e){const t=ctx.currentTime;thump(t,170,70,.16,.55);hiss(t,'lowpass',1600,.7,.14,.35);},
  land(e){const t=ctx.currentTime,k=clamp((e.impact||4)/12,.15,1);thump(t,110,38,.22+.15*k,.4+.5*k);hiss(t,'lowpass',2200,.6,.18+.25*k,.25+.4*k,500);
    if(e.sketchy){tone(t+.05,50,.25,.12,'sawtooth');tone(t+.18,46,.3,.12,'sawtooth');}},
  crash(e){const t=ctx.currentTime;thump(t,90,30,.4,.9);hiss(t,'lowpass',2600,.5,.9,.55,300);hiss(t+.18,'bandpass',700,1,.5,.3,250);duck(.25,1.6);},
  tree(e){const t=ctx.currentTime;thump(t,240,120,.12,.6);tone(t,55,.18,.25,'square');},
  award(e){const t=ctx.currentTime,base=69+Math.min(10,2*(e.combo-1)),notes=e.bad?[0,-5]:[0,4,7,12];
    notes.forEach((n,i)=>{tone(t+i*.07,base+n,.5,.16,'triangle');tone(t+i*.07,base+n+12,.25,.05,'sine');});},
  zone(e){const t=ctx.currentTime;hiss(t,'bandpass',380,1.6,.9,.28,2600);tone(t+.25,81,.6,.05,'sine');tone(t+.33,88,.6,.04,'sine');},
  finish(e){const t=ctx.currentTime;[60,64,67,72].forEach((m,i)=>{tone(t+i*.13,m,.9,.16,'sawtooth');tone(t+i*.13,m+12,.6,.07,'triangle');});[60,64,67,72].forEach(m=>tone(t+.6,m,1.6,.08,'sawtooth'));duck(.2,2.4);}
};

/* ---------- BGM：104 BPM，Am–F–C–G / Am–F–C–Em，16 分音符步进，lookahead 调度 ---------- */
const BPM=104,STEP16=60/BPM/4;
const PROG=[[57,60,64],[53,57,60],[48,52,55],[55,59,62],[57,60,64],[53,57,60],[48,52,55],[52,55,59]];
const mix={intensity:.3,target:.3,park:0,powder:0,steep:0,air:0};
let nextT=0,step16=0,timer=null;
function schedule(){
  if(bgmFile)return;
  if(nextT<ctx.currentTime-.05)nextT=ctx.currentTime+.05; // 标签页切到后台时定时器被节流，回来后跳过落下的拍子，不要一次补放
  while(nextT<ctx.currentTime+.12){
    playStep(nextT,step16);nextT+=STEP16;step16=(step16+1)%(16*PROG.length);
  }
}
function playStep(t,i){
  const bar=Math.floor(i/16),s=i%16,ch=PROG[bar],I=mix.intensity,drums=1-.6*mix.powder;
  if(s===0){ // pad：每小节一个和弦，失谐锯齿波 + 低通
    const lp=filt('lowpass',600+1600*I+900*mix.steep,.8),g=ctx.createGain(),dur=STEP16*16;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.07,t+.5);g.gain.setValueAtTime(.07,t+dur-.4);g.gain.linearRampToValueAtTime(0,t+dur+.3);
    lp.connect(g);g.connect(musicBus);
    for(const m of ch)for(const dt of[-7,7]){const o=ctx.createOscillator();o.type='sawtooth';o.frequency.value=mtof(m);o.detune.value=dt;o.connect(lp);o.start(t);o.stop(t+dur+.4);}
    if(mix.steep>.3){const o=ctx.createOscillator(),g2=ctx.createGain();o.type='sawtooth';o.frequency.value=mtof(ch[0]+13);g2.gain.setValueAtTime(0,t);g2.gain.linearRampToValueAtTime(.02*mix.steep,t+1);g2.gain.linearRampToValueAtTime(0,t+dur);o.connect(lp);o.start(t);o.stop(t+dur+.1);}
  }
  // bass：切分节奏
  if(s===0||s===6||s===8||s===14){const m=ch[0]-12,o=ctx.createOscillator(),g=ctx.createGain(),lp=filt('lowpass',500+400*I,.9);o.type='triangle';o.frequency.value=mtof(m);
    env(g,t,.01,.22,STEP16*(s===0||s===8?3.5:1.6));o.connect(lp);lp.connect(g);g.connect(musicBus);o.start(t);o.stop(t+STEP16*4);}
  // 琶音：8 分音符，上行
  if(s%2===0&&I>.18){const n=(s/2)%4,m=ch[n%3]+12+(n===3?12:0);
    tone(t,m,STEP16*1.8,.055+.03*I+.04*mix.powder,'triangle',musicBus);
    tone(t,m+12,STEP16*1.5,.02,'triangle',delay);} // 高八度送进延迟做回声
  // 鼓：强度越高越满；公园里四拍底鼓；粉雪里鼓组收小
  const four=mix.park>.5||I>.72;
  if((s===0||s===8||(four&&(s===4||s===12)))&&I>.25){const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(140,t);o.frequency.exponentialRampToValueAtTime(42,t+.25);env(g,t,.003,.42*drums,.3);o.connect(g);g.connect(musicBus);o.start(t);o.stop(t+.35);}
  if((s===4||s===12)&&I>.5)hiss(t,'bandpass',1900,.9,.14,.12*drums,null,musicBus);
  if(I>.35&&(s%4===2||(I>.75&&s%2===1)))hiss(t,'highpass',7500,.7,.035,(s%4===2?.07:.035)*drums,null,musicBus);
}

/* ---------- 文件替换 ---------- */
function loadFiles(){
  fetch('audio/manifest.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(man=>{
    if(!man||!Array.isArray(man.files))return;
    man.files.forEach(f=>{
      const name=String(f).replace(/^.*\//,'').replace(/\.[a-z0-9]+$/i,'');
      fetch('audio/'+f).then(r=>r.ok?r.arrayBuffer():Promise.reject()).then(b=>ctx.decodeAudioData(b)).then(buf=>{
        files[name]=buf;api.loaded.push(name);
        if(name==='bgm'){bgmFile=ctx.createBufferSource();bgmFile.buffer=buf;bgmFile.loop=true;bgmFile.connect(musicBus);bgmFile.start();}
        else if(LOOPS.includes(name))useLoopFile(name);
      }).catch(()=>{});
    });
  }).catch(()=>{});
}

/* ---------- 对外接口 ---------- */
api.unlock=function(){
  if(!ctx){try{init();}catch(e){return;}}
  if(ctx.state!=='running')ctx.resume();
  if(!started){started=true;nextT=ctx.currentTime+.08;timer=setInterval(schedule,25);}
};
api.set=function(k,v){state[k]=!!v;save();if(ctx)applyGains();};
api.toggleMute=function(){state.muted=!state.muted;save();if(ctx)applyGains();return state.muted;};
api.event=function(e){
  if(!ctx||ctx.state!=='running')return;
  if(e.type==='zone'){mix.park=e.zone==='park'?1:0;mix.powder=e.zone==='powder'?1:0;mix.steep=e.zone==='steep'||e.zone==='moguls'?1:0;}
  if(!state.sfx||state.muted)return;
  if(e.type==='land'&&!e.real&&(e.impact||0)<3)return; // 蘑菇上的小颠簸不出落地声
  if(files[e.type]){playFile(e.type,e.type==='land'?clamp((e.impact||4)/12,.3,1):1);if(e.type==='crash')duck(.25,1.6);return;}
  const f=SFX[e.type];if(f)f(e);
};
let airT=0;
api.update=function(v){
  if(!ctx||ctx.state!=='running')return;
  const t=ctx.currentTime,on=v.running&&!v.done,sp=on?v.speed:0,k=.06;
  // 音乐强度：速度越快越满；空中整体低通一下
  mix.target=on?clamp(.3+sp/26*.6,.3,1):.22;mix.intensity+=(mix.target-mix.intensity)*.02;
  airT=v.air?airT+1/60:0;
  musicLP.frequency.setTargetAtTime(v.air&&airT>.25?900:v.crashed?1400:16000,t,v.air?.15:.4);
  const set=(n,g,f)=>{const L=loops[n];L.g.gain.setTargetAtTime(g,t,k);if(f&&!files[n])L.head.frequency.setTargetAtTime(f,t,k);};
  const ground=on&&!v.air&&!v.crashed,p=v.powder||0,s01=clamp(sp/22,0,1);
  set('wind',on?.04+.38*s01*s01:0,300+sp*45);
  set('carve',ground&&v.mode==='carve'&&p<.5?clamp(sp/16,0,1)*(.12+.3*v.edge):0,2400+sp*60);
  set('skid',ground&&(v.mode==='skid'||v.vl>1.2)&&p<.5?clamp(v.vl/6,.1,1)*.5:0);
  set('butter',ground&&v.mode==='butter'?.18*clamp(sp/6,.2,1):0);
  set('powder',ground&&p>.3?p*clamp(sp/10,.15,1)*.6:0,380+sp*25);
  charge.g.gain.setTargetAtTime(v.charging?.04+.05*v.charge:0,t,.03);charge.o.frequency.setTargetAtTime(180+520*(v.charge||0),t,.05);
};
})();
