(function(){
'use strict';
const T3=THREE, V3=T3.Vector3;
const DEG=Math.PI/180, G=9.81, STEP=1/120;
const clamp=(x,a,b)=>x<a?a:x>b?b:x;
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const wrapPi=a=>{a=(a+Math.PI)%(2*Math.PI);if(a<0)a+=2*Math.PI;return a-Math.PI;};
const col=h=>new T3.Color(h).convertSRGBToLinear();
const lin=c=>Math.pow(c,2.2);
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const SND=window.EdgelineAudio||{unlock(){},event(){},update(){},toggleMute(){},set(){},state:{}};

/* ================= 雪山：下坡方向为 -z，s = -z。山顶出发，500–800 m 分岔成四条雪道，3100–3400 m 汇合到山脚 ================= */
const S_MIN=-160,S_MAX=3900,FINISH=3600,SPLIT0=500,SPLIT1=800,MERGE0=3100,MERGE1=3400,MAP_X=540;
const center=s=>20*Math.sin(s/170)+7*Math.sin(s/63+0.7);          // 主干道的蜿蜒
const D0=3*Math.sin(1.3);
const drop0=s=>0.26*s+7*Math.sin(s/95+Math.PI)+3*Math.sin(s/41+1.3)-D0; // 山顶公共段剖面（沿用 v0.1 雪道）
const grade0=s=>0.26+7/95*Math.cos(s/95+Math.PI)+3/41*Math.cos(s/41+1.3);
const splitF=s=>smooth(SPLIT0,SPLIT1,s)*(1-smooth(MERGE0,MERGE1,s));
const trunkHalf=s=>30+30*smooth(MERGE0,MERGE1,s);
// knots: [s, 坡度°]，相邻节点之间用 smoothstep 过渡；zones: [s0, s1, 类型]
const PISTES=[
  {key:'A',name:'粉雪大白坡',grade:'红道',color:'#e0383e',lane:-360,half:75,wig:[18,230,.4],bowl:.0015,
    knots:[[600,16],[800,22],[900,26],[1100,25],[1450,27],[1750,25],[1850,16],[2300,13],[2750,11.5]],zones:[[880,1830,'powder']]},
  {key:'B',name:'黑钻蘑菇墙',grade:'黑道',color:'#16181c',lane:-120,half:26,wig:[8,190,1.3],bowl:0,
    knots:[[600,16],[800,16],[1100,17],[1420,18],[1500,22],[1900,22],[1985,37],[2165,37],[2245,15],[2600,13],[2750,12.5]],zones:[[1480,1920,'moguls'],[1940,2250,'steep']]},
  {key:'C',name:'长城刻滑大道',grade:'蓝道',color:'#2f6fe0',lane:130,half:50,wig:[22,300,2.1],bowl:.0003,
    knots:[[600,16],[800,17],[1100,20],[1400,18],[1800,21],[2200,18],[2600,20],[2750,19]],zones:[[820,3100,'carve']]},
  {key:'D',name:'Edgeline 公园',grade:'公园',color:'#ff7a1a',lane:370,half:30,wig:[5,260,.9],bowl:0,
    knots:[[600,16],[800,16],[900,17.5],[1720,17.5],[1800,13],[1960,11],[2100,12],[2185,14],[2198,15],[2216,35],[2290,36],[2330,15],[2420,22],[2750,23]],zones:[[820,3100,'park']]}
];
const TAILK=[[3100,12],[3300,10],[3450,7],[3570,4],[3640,1.5],[3720,.6],[S_MAX,.6]];
const NS=S_MAX-S_MIN+1, NP=PISTES.length;
const LANE=[],HALF=[],PROF=[],GRAD=[];
function gradeFrom(K,s){
  if(s<=520)return grade0(s);
  for(let j=0;j<K.length-1;j++){const a=K[j],b=K[j+1];if(s<=b[0])return Math.tan((a[1]+(b[1]-a[1])*smooth(a[0],b[0],s))*DEG);}
  return Math.tan(K[K.length-1][1]*DEG);
}
function integrate(K,out,gr){
  for(let j=0;j<NS;j++){const s=S_MIN+j;
    if(s<=520)out[j]=-drop0(s);
    else out[j]=out[j-1]-(gradeFrom(K,s-1)+4*gradeFrom(K,s-.5)+gradeFrom(K,s))/6;
    if(gr)gr[j]=gradeFrom(K,s);}
  return out;
}
const knotsFor=(P,a)=>[[520,Math.atan(grade0(520))/DEG],...P.knots,[2900,a],[3040,a],...TAILK];
(function buildTables(){
  // 每条雪道最后一段（2900–3040 m）的坡度由二分求出，保证四条在 3100 m 处一样高
  const target=integrate(knotsFor(PISTES[2],19),new Float32Array(NS))[MERGE0-S_MIN];
  PISTES.forEach((P,i)=>{
    const prof=new Float32Array(NS),gr=new Float32Array(NS);let lo=0,hi=45;
    for(let it=0;it<36;it++){const m=(lo+hi)/2;integrate(knotsFor(P,m),prof);if(prof[MERGE0-S_MIN]>target)lo=m;else hi=m;}
    P.solve=(lo+hi)/2;integrate(knotsFor(P,P.solve),prof,gr);PROF[i]=prof;GRAD[i]=gr;
    const L=new Float32Array(NS),W=new Float32Array(NS);
    for(let j=0;j<NS;j++){const s=S_MIN+j,f=splitF(s);L[j]=center(s)*(1-f)+(P.lane+P.wig[0]*Math.sin(s/P.wig[1]+P.wig[2]))*f;W[j]=trunkHalf(s)*(1-f)+P.half*f;}
    LANE[i]=L;HALF[i]=W;
  });
})();
// 在某个 s 处采样四条雪道的中线、半宽和剖面高度（剖面用 Hermite 插值，坡度连续，不会在格点上被「颠」起来）
const LC=new Float64Array(NP),LW=new Float64Array(NP),LP=new Float64Array(NP);
let sampled=NaN;
function sampleS(s){
  if(s===sampled)return;sampled=s;
  let f=s-S_MIN;if(f<0)f=0;else if(f>NS-1.0001)f=NS-1.0001;
  const j=f|0,t=f-j,t2=t*t,t3=t2*t,ha=2*t3-3*t2+1,hb=t3-2*t2+t,hc=-2*t3+3*t2,hd=t3-t2;
  for(let i=0;i<NP;i++){const L=LANE[i],W=HALF[i],P=PROF[i],Gd=GRAD[i];
    LC[i]=L[j]+(L[j+1]-L[j])*t;LW[i]=W[j]+(W[j+1]-W[j])*t;LP[i]=ha*P[j]-hb*Gd[j]+hc*P[j+1]-hd*Gd[j+1];}
}
const laneAt=(i,s)=>{sampleS(s);return LC[i];};
const halfAt=(i,s)=>{sampleS(s);return LW[i];};
const laneD=(i,s)=>(laneAt(i,s+.5)-laneAt(i,s-.5));
const nat=(x,s)=>2.2*Math.sin(x*.031+s*.017)*Math.sin(s*.043-x*.012)+1.3*Math.sin(x*.071+1.3)*Math.sin(s*.059+.4)+.6*Math.sin(x*.13-s*.09+2);

// 不含蘑菇和跳台的山体高度（远处的网格也用它）
function Hbase(x,z){
  const s=-z;sampleS(s);
  let h;
  if(x<=LC[0])h=LP[0];else if(x>=LC[NP-1])h=LP[NP-1];
  else{let i=0;while(i<NP-2&&x>LC[i+1])i++;let a=LC[i]+LW[i],b=LC[i+1]-LW[i+1];if(b-a<20){const m=(a+b)/2;a=m-10;b=m+10;}h=LP[i]+(LP[i+1]-LP[i])*smooth(a,b,x);}
  let d=1e9;for(let q=0;q<NP;q++){const dq=Math.abs(x-LC[q])-LW[q];if(dq<d)d=dq;}
  const f=splitF(s);
  h+=0.18*Math.sin(x*0.19+s*0.045)*Math.sin(s*0.11+x*0.05);
  const fb=f*(1-smooth(2600,3050,s));
  for(let q=0;q<NP;q++){const bw=PISTES[q].bowl*fb;if(bw>0){const u=Math.min(Math.abs(x-LC[q]),LW[q]);h+=bw*(u*u-LW[q]*LW[q]);}} // 碗状横截面
  if(d>0){ // 雪道外：护坡抬升成林间山脊，叠加自然起伏，外侧是山体两翼
    const dd=Math.min(d,400),e=smooth(0,30,d);
    h+=dd*(0.18+0.0012*Math.min(dd,250))*smooth(0,6,d)*(1-.7*smooth(3600,3900,s));
    h+=nat(x,s)*e;
    h+=150*smooth(380,900,Math.abs(x))*(1-smooth(2600,4700,s))*e;
  }
  if(s<-40){const k=-40-s;h+=520*smooth(0,380,k)*(.35+.65*Math.exp(-(x*x)/144400))-300*smooth(500,1000,k);} // 山峰
  return h;
}
// 蘑菇道：交错排列的鼓包（只往上加）
const MOG0=1490,MOG1=1910,MOGK=2*Math.PI/5.2,R2=Math.SQRT1_2;
function mogul(xc,s){
  const u=(xc+s)*R2,v=(xc-s)*R2;
  const b=Math.cos(MOGK*u+.6*Math.sin(s*.07))+Math.cos(MOGK*v+.6*Math.sin(xc*.11+s*.03));
  const q=(b+2)/4;return .7*q*q;
}
const mogulW=(xc,s,hw)=>smooth(MOG0,MOG0+30,s)*(1-smooth(MOG1-30,MOG1,s))*(1-smooth(hw-6,hw-1,Math.abs(xc)));
// 跳台：s 唇口位置，p 雪道，u 横向偏移，lip 唇口高，ramp 助滑长，land 着陆段衰减长，hw 半宽
const KH=2.2; // 小跳台唇口高度（7 米助滑、16 米着陆坡）
const KICK=[];
{const KU=[0,-8,8,0,-8,8,0];
  [950,1120,1290,1460,1630].forEach((s,i)=>KICK.push({s,p:3,u:KU[i],lip:KH,ramp:7,land:16,hw:4.5}));
  KICK.push({s:2200,p:3,u:0,lip:2.6,ramp:13,land:10,hw:7,big:true});
  [2440,2610,2780].forEach((s,i)=>KICK.push({s,p:3,u:KU[i+1],lip:KH,ramp:7,land:16,hw:4.5}));}
const BIG=KICK.find(k=>k.big);

function H(x,z){
  let h=Hbase(x,z);const s=-z;
  if(s>MOG0&&s<MOG1){const xc=x-LC[1],w=mogulW(xc,s,LW[1]);if(w>0)h+=w*mogul(xc,s);}
  for(let i=0;i<KICK.length;i++){
    const k=KICK[i],ds=s-k.s;
    if(ds>-k.ramp-.5&&ds<k.land+.5){
      const w=1-smooth(k.hw,k.hw+3,Math.abs(x-LC[k.p]-k.u));
      if(w>0){let add;if(ds<0){const t=Math.max(0,(ds+k.ramp)/k.ramp);add=k.lip*t*t;}else add=k.lip*(1-smooth(0,k.land,ds));h+=add*w;}
    }
  }
  return h;
}
function normalAt(x,z,out){const e=0.06;out.set(-(H(x+e,z)-H(x-e,z))/(2*e),1,-(H(x,z+e)-H(x,z-e))/(2*e));return out.normalize();}
function basis(yaw,n,F,T){F.set(Math.sin(yaw),0,Math.cos(yaw));F.addScaledVector(n,-F.dot(n)).normalize();T.crossVectors(F,n);}

// 雪面类型：k 最近的雪道，d 到雪道边缘的距离（<0 在雪道内），powder / groom 为 0..1 的权重
const SURF={k:0,d:0,xc:0,trunk:true,zone:'top',powder:0,groom:1};
function zoneOf(k,s){
  if(s<650)return'top';if(s>3250)return'base';
  for(const z of PISTES[k].zones)if(s>=z[0]&&s<z[1])return z[2];
  return'groomed';
}
function surfaceAt(x,z){
  const s=-z;sampleS(s);
  let d=1e9,k=0;for(let q=0;q<NP;q++){const dq=Math.abs(x-LC[q])-LW[q];if(dq<d){d=dq;k=q;}}
  const inP=1-smooth(-1,3,d);
  const zp=k===0?smooth(880,910,s)*(1-smooth(1800,1830,s)):0;
  const zm=k===1?mogulW(x-LC[1],s,LW[1]):0;
  SURF.k=k;SURF.d=d;SURF.xc=x-LC[k];SURF.trunk=s<650||s>3250;
  SURF.powder=inP*zp+(1-inP)*.45*smooth(2,12,d);
  SURF.groom=inP*(1-zp)*(1-zm);
  SURF.zone=d>5?'off':zoneOf(k,s);
  return SURF;
}
const ZONES={
  top:['山顶主干道','500 m 处分岔：往左是粉雪和黑道，往右是刻滑大道和公园'],
  base:['山脚大道','终点在 3600 m'],
  groomed:['压雪道',''],
  powder:['粉雪 POWDER','重心压后（S）让板头浮起来，别压板头'],
  moguls:['蘑菇道 MOGULS','推坡控速，在鼓包之间转'],
  steep:['陡坡 STEEP','37° 黑道，推坡控速'],
  carve:['刻滑 CARVING','100 米宽，放心立大刃角'],
  park:['公园 PARK','跳台在中线，2200 m 有大跳台'],
  off:['野雪 · 树林','小心树，按 R 回到雪道']
};

/* ================= 渲染器与场景 ================= */
const canvas=document.getElementById('game');
const renderer=new T3.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));
renderer.outputEncoding=T3.sRGBEncoding;
renderer.toneMapping=T3.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.08;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T3.PCFSoftShadowMap;
const scene=new T3.Scene();
const HORIZON=new T3.Color(0xdbe8f5);
scene.fog=new T3.Fog(HORIZON.clone().convertSRGBToLinear(),140,1500);
renderer.setClearColor(HORIZON);
const camera=new T3.PerspectiveCamera(62,1,0.1,3200);

const hemi=new T3.HemisphereLight(col('#d4e5ff'),col('#8c9bb0'),0.62);scene.add(hemi);
const sun=new T3.DirectionalLight(col('#fff2df'),1.05);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:90});
sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.03;
scene.add(sun);scene.add(sun.target);
const SUN_OFF=new V3(-24,26,6);

// 天空
const sky=new T3.Mesh(new T3.SphereGeometry(2400,32,16),new T3.ShaderMaterial({
  side:T3.BackSide,depthWrite:false,fog:false,
  uniforms:{uSun:{value:SUN_OFF.clone().normalize()}},
  vertexShader:'varying vec3 vW;void main(){vW=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 uSun;varying vec3 vW;void main(){float h=vW.y;vec3 top=vec3(.27,.5,.83);vec3 hor=vec3(.86,.91,.96);vec3 c=mix(hor,top,smoothstep(-.02,.42,h));float s=max(dot(vW,uSun),0.);c+=vec3(1.,.93,.8)*(pow(s,600.)*1.2+pow(s,8.)*.12);gl_FragColor=vec4(c,1.);}'
}));
sky.renderOrder=-2;scene.add(sky);

// 远山
const mountains=(function(){
  const r=rng(7),N=60,pos=[],cl=[],R=2200;
  const base=[lin(.62),lin(.70),lin(.82)],top=[lin(.96),lin(.97),lin(1)];
  for(let i=0;i<N;i++){
    const a0=i/N*Math.PI*2,a1=(i+2.6)/N*Math.PI*2,am=(a0+a1)/2;const hp=40+r()*230;
    const P=[[Math.cos(a0)*R,-420,Math.sin(a0)*R],[Math.cos(a1)*R,-420,Math.sin(a1)*R],[Math.cos(am)*R*.985,hp,Math.sin(am)*R*.985]];
    P.forEach((p,j)=>{pos.push(...p);const c=j<2?base:top;cl.push(...c);});
  }
  const g=new T3.BufferGeometry();g.setAttribute('position',new T3.Float32BufferAttribute(pos,3));g.setAttribute('color',new T3.Float32BufferAttribute(cl,3));
  const m=new T3.Mesh(g,new T3.MeshBasicMaterial({vertexColors:true,fog:false,side:T3.DoubleSide}));m.renderOrder=-1;m.frustumCulled=false;scene.add(m);return m;
})();

// 压雪「灯芯绒」法线贴图
function makeCorduroy(){
  const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');const img=g.createImageData(N,N);
  const r=rng(3),h=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const ridge=Math.pow(Math.abs(Math.sin(x/N*Math.PI*26)),0.7);h[y*N+x]=0.55*ridge+0.45*r();}
  const at=(x,y)=>h[((y+N)%N)*N+((x+N)%N)];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const dx=(at(x+1,y)-at(x-1,y))*1.6,dy=(at(x,y+1)-at(x,y-1))*1.6;let nx=-dx,ny=-dy,nz=1;const l=Math.hypot(nx,ny,nz);nx/=l;ny/=l;nz/=l;
    const k=(y*N+x)*4;img.data[k]=(nx*.5+.5)*255;img.data[k+1]=(ny*.5+.5)*255;img.data[k+2]=(nz*.5+.5)*255;img.data[k+3]=255;
  }
  g.putImageData(img,0,0);const t=new T3.CanvasTexture(c);t.wrapS=t.wrapT=T3.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());return t;
}
// 地形材质：顶点属性 aGroom 控制灯芯绒条纹的强度（压雪道 1，粉雪 / 野雪 0）
const corduroy=makeCorduroy();
function groomShader(sh){
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float aGroom;\nvarying float vGroom;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGroom=aGroom;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vGroom;').replace('#include <normal_fragment_maps>',T3.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;','mapN.xy *= normalScale * vGroom;'));
}
function terrainMat(over){
  const m=new T3.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0,normalMap:corduroy,normalScale:new T3.Vector2(.5,.5)});
  m.onBeforeCompile=groomShader;
  if(over){m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-4;}
  return m;
}
const C_ON=[lin(.94),lin(.96),lin(.99)],C_OFF=[lin(.84),lin(.88),lin(.95)],C_POW=[lin(.975),lin(.985),lin(1)],C_ROCK=[lin(.38),lin(.39),lin(.43)],C_FOREST=[lin(.30),lin(.37),lin(.36)];
// 顶点颜色与压雪权重；ny 为法线的 y 分量，用来判断是否陡到露出岩石
function surfColor(x,s,ny,out,far){
  const sf=surfaceAt(x,-s),g=sf.groom,p=sf.powder>.5?1:sf.powder*2,o=1-g;
  for(let q=0;q<3;q++)out[q]=C_ON[q]*g+(C_OFF[q]*(1-p)+C_POW[q]*p)*o;
  if(far){const fo=smooth(20,80,sf.d)*(.35+.25*Math.sin(x*.02+s*.013))*smooth(-200,400,s);for(let q=0;q<3;q++)out[q]+=(C_FOREST[q]-out[q])*fo;} // 远处林带染成深绿
  const rk=smooth(.8,.66,ny);for(let q=0;q<3;q++)out[q]+=(C_ROCK[q]-out[q])*rk;
  return g*(1-rk);
}

// 把规则网格（行 = s，列 = 横向）切成小块网格；X(i,j)/S(i,j) 给出坐标，hg 为高度
function gridMeshes(nx,ns,X,S,hg,step,mat,tileI,tileJ,far,skip){
  const nrm=new Float32Array(nx*ns*3),cl=new Float32Array(nx*ns*3),gr=new Float32Array(nx*ns),c3=[0,0,0];
  for(let j=0;j<ns;j++)for(let i=0;i<nx;i++){
    const k=j*nx+i,i0=Math.max(0,i-1),i1=Math.min(nx-1,i+1),j0=Math.max(0,j-1),j1=Math.min(ns-1,j+1);
    const dHx=(hg[j*nx+i1]-hg[j*nx+i0])/(X(i1,j)-X(i0,j)||step),dHs=(hg[j1*nx+i]-hg[j0*nx+i])/((j1-j0)*step);
    let a=-dHx,b=1,c=dHs;const l=Math.hypot(a,b,c);a/=l;b/=l;c/=l;nrm[k*3]=a;nrm[k*3+1]=b;nrm[k*3+2]=c;
    gr[k]=surfColor(X(i,j),S(i,j),b,c3,far);cl[k*3]=c3[0];cl[k*3+1]=c3[1];cl[k*3+2]=c3[2];
  }
  const out=[];
  for(let j0=0;j0<ns-1;j0+=tileJ)for(let i0=0;i0<nx-1;i0+=tileI){
    const j1=Math.min(ns-1,j0+tileJ),i1=Math.min(nx-1,i0+tileI),w=i1-i0+1,hgt=j1-j0+1,n=w*hgt;
    const pos=new Float32Array(n*3),uv=new Float32Array(n*2),nn=new Float32Array(n*3),cc=new Float32Array(n*3),gg=new Float32Array(n),idx=[];
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const k=j*nx+i,t=(j-j0)*w+(i-i0),x=X(i,j),s=S(i,j);
      pos[t*3]=x;pos[t*3+1]=hg[k];pos[t*3+2]=-s;uv[t*2]=x/2.2;uv[t*2+1]=s/2.2;gg[t]=gr[k];
      for(let q=0;q<3;q++){nn[t*3+q]=nrm[k*3+q];cc[t*3+q]=cl[k*3+q];}}
    for(let j=j0;j<j1;j++)for(let i=i0;i<i1;i++){if(skip&&skip(i,j))continue;const a=(j-j0)*w+(i-i0),b=a+1,c2=a+w,d=c2+1;idx.push(a,b,c2,b,d,c2);}
    if(!idx.length)continue;
    const g=new T3.BufferGeometry();g.setAttribute('position',new T3.BufferAttribute(pos,3));g.setAttribute('normal',new T3.BufferAttribute(nn,3));g.setAttribute('uv',new T3.BufferAttribute(uv,2));g.setAttribute('color',new T3.BufferAttribute(cc,3));g.setAttribute('aGroom',new T3.BufferAttribute(gg,1));
    g.setIndex(idx);g.computeBoundingSphere();
    const m=new T3.Mesh(g,mat);m.receiveShadow=true;scene.add(m);out.push(m);
  }
  return out;
}

// 地形：主网格（5 m）+ 外围山体（20 m）+ 蘑菇和跳台的细网格
const MX0=-560,MX1=560,MS0=-160,MS1=3900;
(function buildTerrain(){
  const mat=terrainMat(false);
  {const st5=5,nx=(MX1-MX0)/st5+1,ns=(MS1-MS0)/st5+1,hg=new Float32Array(nx*ns);
    for(let j=0;j<ns;j++)for(let i=0;i<nx;i++)hg[j*nx+i]=Hbase(MX0+i*st5,-(MS0+j*st5));
    gridMeshes(nx,ns,i=>MX0+i*st5,(i,j)=>MS0+j*st5,hg,st5,mat,56,40,false);}
  {const st20=20,X0=-1400,S0=-1000,nx=141,ns=291,hg=new Float32Array(nx*ns);
    for(let j=0;j<ns;j++)for(let i=0;i<nx;i++){const x=X0+i*st20,s=S0+j*st20;const ins=Math.min(x-MX0,MX1-x,s-MS0,MS1-s);hg[j*nx+i]=Hbase(x,-s)-(ins>0?2.5*smooth(0,20,ins):0);}
    const inside=(i,j)=>{const x=X0+i*st20,s=S0+j*st20;return x>=MX0+20&&x+st20<=MX1-20&&s>=MS0+20&&s+st20<=MS1-20;};
    gridMeshes(nx,ns,i=>X0+i*st20,(i,j)=>S0+j*st20,hg,st20,mat,35,36,true,inside).forEach(m=>{m.receiveShadow=false;});}
  // 细网格沿雪道走向，抬高 3 cm 并用 polygonOffset 盖在主网格上
  const fmat=terrainMat(true);
  function strip(p,s0,s1,u0,u1,st){
    const nx=Math.round((u1-u0)/st)+1,ns=Math.round((s1-s0)/st)+1,hg=new Float32Array(nx*ns),xs=new Float32Array(nx*ns);
    for(let j=0;j<ns;j++){const s=s0+j*st,c=laneAt(p,s);for(let i=0;i<nx;i++){const x=c+u0+i*st;xs[j*nx+i]=x;hg[j*nx+i]=H(x,-s)+.03;}}
    return gridMeshes(nx,ns,(i,j)=>xs[j*nx+i],(i,j)=>s0+j*st,hg,st,fmat,nx,Math.ceil(120/st),false);
  }
  strip(1,MOG0-2,MOG1+2,-(PISTES[1].half+2),PISTES[1].half+2,.6);
  KICK.forEach(k=>strip(k.p,k.s-k.ramp-2,k.s+k.land+2,k.u-k.hw-4,k.u+k.hw+4,.4));
})();

/* ================= 树、岩石、边界杆、指示牌、缆车、山脚小镇 ================= */
const TREE_CELL=8,treeGrid=new Map(),treeChunks=[];
const tkey=(ix,iz)=>(ix+4096)*8192+(iz+4096);
function addCollider(x,z,r,kind){const k=tkey(Math.floor(x/TREE_CELL),Math.floor(z/TREE_CELL));let a=treeGrid.get(k);if(!a)treeGrid.set(k,a=[]);a.push([x,z,r,kind||'prop']);}
function mergeParts(parts){ // [[geometry, '#color'], ...] → 一个带顶点色的非索引几何体
  const pos=[],nor=[],cl=[];
  for(const [g0,h] of parts){const g=g0.index?g0.toNonIndexed():g0,c=col(h),p=g.attributes.position,n=g.attributes.normal;
    for(let i=0;i<p.count;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));nor.push(n.getX(i),n.getY(i),n.getZ(i));cl.push(c.r,c.g,c.b);}}
  const g=new T3.BufferGeometry();g.setAttribute('position',new T3.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T3.Float32BufferAttribute(nor,3));g.setAttribute('color',new T3.Float32BufferAttribute(cl,3));return g;
}
// r128 的 InstancedMesh 用几何体自己的包围球做视锥剔除，所以每块单独设一个世界坐标下的包围球
function instanced(base,mat,list,sphere){
  const g=new T3.BufferGeometry();for(const k in base.attributes)g.setAttribute(k,base.attributes[k]);
  const m=new T3.InstancedMesh(g,mat,list.length);
  if(sphere)g.boundingSphere=sphere;else m.frustumCulled=false;
  list.forEach((M,i)=>m.setMatrixAt(i,M));scene.add(m);return m;
}
function makeSignTex(lines,w,h){
  const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');
  g.fillStyle='#0c1624';g.fillRect(0,0,w,h);g.fillStyle='#ff7a1a';g.fillRect(0,0,w,8);
  const lh=(h-24)/lines.length;
  lines.forEach((L,i)=>{const y=16+lh*i+lh/2;
    if(L.color){g.fillStyle=L.color;g.fillRect(18,y-lh*.32,14,lh*.64);}
    g.fillStyle='#f2f6fa';g.font=`700 ${Math.round(lh*.52)}px "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif`;g.textBaseline='middle';
    g.textAlign=L.align||'left';g.fillText(L.text,L.align==='center'?w/2:L.color?44:18,y);});
  const t=new T3.CanvasTexture(c);t.encoding=T3.sRGBEncoding;t.anisotropy=4;return t;
}
const postMat=new T3.MeshStandardMaterial({color:col('#3a4250'),roughness:.6});
function sign(x,s,lines,w,h,yaw){
  const z=-s,y0=H(x,z),grp=new T3.Group();grp.position.set(x,y0,z);grp.rotation.y=yaw||0;
  const b=new T3.Mesh(new T3.PlaneGeometry(w,h),new T3.MeshBasicMaterial({map:makeSignTex(lines,512,Math.round(512*h/w)),side:T3.DoubleSide}));b.position.y=1.6+h/2;grp.add(b);
  for(const sd of[-1,1]){const p=new T3.Mesh(new T3.CylinderGeometry(.06,.06,1.7+h,6),postMat);p.position.set(sd*(w/2-.15),(1.7+h)/2,-.03);grp.add(p);}
  scene.add(grp);addCollider(x+Math.cos(yaw||0)*w/2,z,.3);addCollider(x-Math.cos(yaw||0)*w/2,z,.3);return grp;
}
function arch(s,half,text){
  const c=laneAt(0,s),z=-s,grp=new T3.Group(),hgt=6.5;
  for(const sd of[-1,1]){const x=c+sd*half,p=new T3.Mesh(new T3.BoxGeometry(.6,hgt+1.5,.6),new T3.MeshStandardMaterial({color:col('#ff7a1a'),roughness:.5}));p.position.set(x,H(x,z)+(hgt+1.5)/2-.5,z);grp.add(p);addCollider(x,z,.5);}
  const y=Math.max(H(c-half,z),H(c+half,z))+hgt;
  const cw=2048,chh=Math.round(cw*2.2/(half*2)),cv=document.createElement('canvas');cv.width=cw;cv.height=chh;const g=cv.getContext('2d'); // 横幅：文字沿长边重复
  g.fillStyle='#0c1624';g.fillRect(0,0,cw,chh);g.fillStyle='#ff7a1a';g.fillRect(0,0,cw,chh*.1);g.fillRect(0,chh*.9,cw,chh*.1);
  g.fillStyle='#f2f6fa';g.font=`800 ${Math.round(chh*.56)}px "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif`;g.textAlign='center';g.textBaseline='middle';
  const rep=Math.max(1,Math.round(half/10));for(let i=0;i<rep;i++)g.fillText(text,cw*(i+.5)/rep,chh*.52);
  const tex=new T3.CanvasTexture(cv);tex.encoding=T3.sRGBEncoding;tex.anisotropy=4;
  const ban=new T3.Mesh(new T3.PlaneGeometry(half*2,2.2),new T3.MeshBasicMaterial({map:tex,side:T3.DoubleSide}));ban.position.set(c,y,z);grp.add(ban);
  scene.add(grp);
}
(function buildProps(){
  const r=rng(11),M=new T3.Matrix4(),Q=new T3.Quaternion(),S=new V3(),P=new V3(),Y=new V3(0,1,0),N=new V3();
  // 树：林带里按密度撒，山顶附近在林线以上不长；粉雪碗里有几簇树岛
  const foliage=new T3.ConeGeometry(1.35,4.4,6);foliage.translate(0,2.6,0);
  const cap=new T3.ConeGeometry(.9,2.1,6);cap.translate(0,4.1,0);
  const trunk=new T3.CylinderGeometry(.16,.2,1,5,1,true);trunk.translate(0,.4,0);
  const treeGeo=mergeParts([[foliage,'#2c4636'],[cap,'#eef3f8'],[trunk,'#4a3a2e']]);
  const treeMat=new T3.MeshStandardMaterial({vertexColors:true,roughness:.9});
  const chunks=new Map();
  function tree(x,s,sc){const z=-s;P.set(x,H(x,z)-.15,z);Q.setFromAxisAngle(Y,r()*6.28);S.set(sc,sc*(.9+r()*.3),sc);M.compose(P,Q,S);
    const key=Math.floor((x-MX0)/280)+'_'+Math.floor((s-MS0)/300);let c=chunks.get(key);if(!c)chunks.set(key,c={list:[],min:new V3(1e9,1e9,1e9),max:new V3(-1e9,-1e9,-1e9)});
    c.list.push(M.clone());c.min.min(P);c.max.max(P);addCollider(x,z,.45*sc,'tree');}
  for(let s=-110;s<MS1-30;s+=10)for(let x=MX0+15;x<MX1-15;x+=10){
    const px=x+(r()-.5)*8,ps=s+(r()-.5)*8,sf=surfaceAt(px,-ps);if(sf.d<5)continue;
    if(ps>3620&&Math.abs(px-center(ps))<190)continue; // 山脚小镇
    normalAt(px,-ps,N);if(N.y<.74)continue;
    const dens=.5*smooth(5,22,sf.d)*smooth(-60,260,ps)*(.75+.25*Math.sin(px*.013+ps*.021));
    if(r()<dens)tree(px,ps,.65+r()*.8);
  }
  for(const [s,u] of[[1150,-34],[1420,38],[1640,-28]]){for(let i=0;i<9;i++){const a=r()*6.28,rr=r()*9;const ps=s+Math.sin(a)*rr;tree(laneAt(0,ps)+u+Math.cos(a)*rr,ps,.7+r()*.6);}}
  chunks.forEach(c=>{const ctr=c.min.clone().add(c.max).multiplyScalar(.5);ctr.y+=3;const m=instanced(treeGeo,treeMat,c.list,new T3.Sphere(ctr,c.min.distanceTo(c.max)/2+8));m.userData.c=ctr;treeChunks.push(m);});
  // 岩石：山顶和陡壁
  const rocks=[];const rockGeo=new T3.DodecahedronGeometry(1,0);
  for(let i=0;i<900;i++){const x=MX0+r()*(MX1-MX0),s=-150+r()*3900,sf=surfaceAt(x,-s);if(sf.d<4)continue;normalAt(x,-s,N);if(!(N.y<.8||s<120))continue;
    const sc=.6+r()*2.2;P.set(x,H(x,-s)-sc*.3,-s);Q.setFromEuler(new T3.Euler(r()*3,r()*3,r()*3));S.set(sc,sc*(.5+r()*.5),sc*(.8+r()*.5));M.compose(P,Q,S);rocks.push(M.clone());if(sc>1)addCollider(x,-s,sc*.8);}
  instanced(rockGeo,new T3.MeshStandardMaterial({color:col('#59606b'),roughness:.95,flatShading:true}),rocks);
  // 边界杆：雪道两侧每 20 米一根，颜色跟雪道
  const poles=[],pc=[],seen=new Set();
  for(let i=0;i<NP;i++)for(let s=10;s<FINISH;s+=20){sampleS(s);for(const sd of[-1,1]){const x=LC[i]+sd*(LW[i]+1.2);let inside=false;for(let q=0;q<NP;q++)if(q!==i&&Math.abs(x-LC[q])<LW[q]+.6)inside=true;
    const key=Math.round(x)+'_'+s;if(inside||seen.has(key))continue;seen.add(key);poles.push([x,-s]);pc.push(s<650||s>3250?'#ff7a1a':PISTES[i].color);}}
  const pg=new T3.CylinderGeometry(.035,.035,1.8,6);pg.translate(0,.9,0);
  const mp=instanced(pg,new T3.MeshStandardMaterial({color:0xffffff,roughness:.5}),poles.map(p=>new T3.Matrix4().makeTranslation(p[0],H(p[0],p[1]),p[1])));
  pc.forEach((h,i)=>mp.setColorAt(i,col(h)));
  // 跳台唇口与侧边的蓝色标线
  const lipMat=new T3.MeshBasicMaterial({color:col('#1f6dff')}),flagMat=new T3.MeshStandardMaterial({color:col('#1f6dff')});
  KICK.forEach(k=>{const s=k.s-.05,x=laneAt(k.p,s)+k.u,z=-s;const b=new T3.Mesh(new T3.BoxGeometry(k.hw*2,.04,.16),lipMat);b.position.set(x,H(x,z)+.02,z);b.rotation.y=-Math.atan(laneD(k.p,s));scene.add(b);
    const fs=k.s-k.ramp-5;for(const sd of[-1,1]){const fx=laneAt(k.p,fs)+k.u+sd*(k.hw+.7),fz=-fs;const f=new T3.Mesh(new T3.CylinderGeometry(.04,.04,1.3,6),flagMat);f.position.set(fx,H(fx,fz)+.65,fz);scene.add(f);}
  });
  // 指示牌
  {const s=470,c=laneAt(0,s),w=halfAt(0,s);
    const L=[{text:'◀ A 粉雪大白坡 · 红',color:PISTES[0].color},{text:'◀ B 黑钻蘑菇墙 · 黑',color:'#8a9099'},{text:'C 长城刻滑大道 · 蓝 ▶',color:PISTES[2].color},{text:'D Edgeline 公园 ▶',color:PISTES[3].color}];
    sign(c+w+3.5,s,L,5.2,3.4);sign(c-w-3.5,s,L,5.2,3.4);}
  const zs=[[0,860,'A 粉雪大白坡 · 粉雪区'],[1,1460,'B 蘑菇道 · 推坡控速'],[1,1925,'⚠ B 陡坡 37°'],[2,840,'C 长城刻滑大道 · 宽 100 m'],[3,880,'D 公园 · 小跳台连跳'],[3,2140,'D 大跳台 · 前方助滑']];
  zs.forEach(([i,s,t])=>{sampleS(s);sign(LC[i]+LW[i]+3,s,[{text:t,color:PISTES[i].color}],4.6,1.1);});
  arch(-6,9,'START · 山顶出发');
  arch(FINISH,24,'FINISH · 终点');
  // 缆车：山脚到山顶一条直线，塔架避开雪道
  const B0=new V3(165,0,-3700),B1=new V3(75,0,60),towers=[],tops=[];
  const lineX=s=>B0.x+(B1.x-B0.x)*(s-3700)/(-60-3700);
  {let last=-1e9;for(let s=3700;s>=-60;s-=5){const x=lineX(s),sf=surfaceAt(x,-s);if((last-s>=110||s<=-60||s===3700)&&sf.d>3){last=s;const y=H(x,-s);towers.push(new T3.Matrix4().makeTranslation(x,y,-s));tops.push(new V3(x,y+11,-s));addCollider(x,-s,.6);}}}
  const tw=mergeParts([[new T3.CylinderGeometry(.22,.32,11,6).translate(0,5.5,0),'#5d6673'],[new T3.BoxGeometry(4.2,.3,.3).translate(0,11,0),'#5d6673']]);
  instanced(tw,new T3.MeshStandardMaterial({vertexColors:true,roughness:.6,metalness:.3}),towers);
  const cablePts=[[],[]],chairs=[];
  for(let i=0;i<tops.length;i++)for(const sd of[0,1])cablePts[sd].push(tops[i].clone().add(new V3(sd?1.9:-1.9,0,0)));
  for(const sd of[0,1]){const ln=new T3.Line(new T3.BufferGeometry().setFromPoints(cablePts[sd]),new T3.LineBasicMaterial({color:col('#2a2f36')}));ln.frustumCulled=false;scene.add(ln);
    const pts=cablePts[sd];let acc=sd*14;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],L=a.distanceTo(b);for(;acc<L;acc+=28){P.copy(a).lerp(b,acc/L);P.y-=1.5;chairs.push(new T3.Matrix4().makeTranslation(P.x,P.y,P.z));}acc-=L;}}
  const ch=mergeParts([[new T3.BoxGeometry(1.4,.12,.6),'#2a2f36'],[new T3.BoxGeometry(1.4,.6,.1).translate(0,.3,-.3),'#e4523b'],[new T3.CylinderGeometry(.03,.03,1.5,4).translate(0,.75,0),'#2a2f36']]);
  instanced(ch,new T3.MeshStandardMaterial({vertexColors:true,roughness:.6}),chairs);
  // 缆车站与山脚木屋
  const wood=new T3.MeshStandardMaterial({color:col('#6b4a33'),roughness:.85}),roof=new T3.MeshStandardMaterial({color:col('#eef3f8'),roughness:.8});
  function cabin(x,s,w,d,h,yaw){const z=-s,y=H(x,z),g=new T3.Group();g.position.set(x,y,z);g.rotation.y=yaw||0;
    const b=new T3.Mesh(new T3.BoxGeometry(w,h,d),wood);b.position.y=h/2-.3;b.castShadow=true;g.add(b);
    const rf=new T3.Mesh(new T3.ConeGeometry(.75,1,4),roof);rf.rotation.y=Math.PI/4;rf.scale.set(w*1.05,w*.42,d*1.05);rf.position.y=h-.3+w*.21;rf.castShadow=true;g.add(rf);
    scene.add(g);for(let a=-1;a<=1;a+=2)for(let c=-1;c<=1;c+=2)addCollider(x+a*w*.35,z+c*d*.35,Math.min(w,d)*.45);}
  cabin(B0.x+8,3708,10,7,5);cabin(B1.x+6,-66,9,7,4.5);
  [[3700,-95],[3740,-130],[3770,92],[3810,-60],[3820,140],[3760,-175]].forEach(([s,u],i)=>cabin(center(s)+u,s,8+(i%3)*2,6+(i%2)*2,4+(i%2),.3*(i%3-1)));
})();

/* ================= 骑手与雪板 ================= */
const UPY=new V3(0,1,0);
function makeRig(){
  const frame=new T3.Object3D(),pivot=new T3.Object3D(),body=new T3.Object3D();frame.add(pivot);pivot.add(body);scene.add(frame);
  const M=(h,r=.7,m=0)=>new T3.MeshStandardMaterial({color:col(h),roughness:r,metalness:m});
  const mJ=M('#e4523b',.62),mP=M('#1e2b42',.82),mH=M('#f3f5f7',.32),mG=M('#ff9d3f',.12,.65),mBt=M('#2a2f36',.7),mBi=M('#111418',.5),mB=M('#163a5e',.35,.05),mGl=M('#141a22',.85);
  // 雪板轮廓：带侧切（腰窄头尾宽）、头尾上翘
  const pts=[];const half=.78,flat=.6,ww=.125,wn=.148;
  const w=x=>{const a=Math.abs(x);if(a<=flat)return ww+(wn-ww)*Math.pow(a/flat,2);const t=(a-flat)/(half-flat);return wn*Math.sqrt(Math.max(0,1-t*t*.96));};
  for(let i=0;i<=40;i++){const x=-half+i/40*half*2;pts.push(new T3.Vector2(x,w(x)));}
  for(let i=40;i>=0;i--){const x=-half+i/40*half*2;pts.push(new T3.Vector2(x,-w(x)));}
  const bg=new T3.ExtrudeGeometry(new T3.Shape(pts),{depth:.018,bevelEnabled:false});bg.rotateX(-Math.PI/2);
  const pa=bg.attributes.position;for(let i=0;i<pa.count;i++){const ax=Math.abs(pa.getX(i));if(ax>flat){const t=(ax-flat)/(half-flat);pa.setY(i,pa.getY(i)+t*t*.075);}}
  bg.computeVertexNormals();
  const board=new T3.Mesh(bg,mB);board.castShadow=true;body.add(board);
  // 固定器（前 +15°、后 -15° 的鸭式站姿）与雪鞋
  for(const [x,a] of[[.26,15],[-.26,-15]]){const g=new T3.Group();g.position.set(x,.018,0);g.rotation.y=a*DEG;
    const bi=new T3.Mesh(new T3.BoxGeometry(.17,.05,.27),mBi);bi.position.y=.025;g.add(bi);
    const bt=new T3.Mesh(new T3.BoxGeometry(.13,.14,.31),mBt);bt.position.y=.11;bt.castShadow=true;g.add(bt);body.add(g);}
  const cyl=(r1,r2,m)=>{const g=new T3.CylinderGeometry(r1,r2,1,10);const o=new T3.Mesh(g,m);o.castShadow=true;body.add(o);return o;};
  const sph=(r,m)=>{const o=new T3.Mesh(new T3.SphereGeometry(r,14,10),m);o.castShadow=true;body.add(o);return o;};
  const P={thF:cyl(.08,.068,mP),shF:cyl(.068,.06,mP),thR:cyl(.08,.068,mP),shR:cyl(.068,.06,mP),knF:sph(.07,mP),knR:sph(.07,mP),hip:sph(.155,mP),
    torso:cyl(.165,.15,mJ),chest:sph(.17,mJ),uaF:cyl(.06,.055,mJ),faF:cyl(.055,.05,mJ),uaR:cyl(.06,.055,mJ),faR:cyl(.055,.05,mJ),elF:sph(.058,mJ),elR:sph(.058,mJ),hdF:sph(.055,mGl),hdR:sph(.055,mGl)};
  const head=new T3.Group();body.add(head);
  const helm=new T3.Mesh(new T3.SphereGeometry(.135,18,14),mH);helm.castShadow=true;head.add(helm);
  const gog=new T3.Mesh(new T3.BoxGeometry(.2,.065,.06),mG);gog.position.set(0,.005,.11);head.add(gog);
  const neckM=new T3.Mesh(new T3.CylinderGeometry(.07,.08,.12,8),mJ);head.add(neckM);neckM.position.y=-.12;
  P.head=head;
  return {frame,pivot,body,P};
}
const rig=makeRig();
const _d=new V3(),_p=new V3();
function setLimb(m,a,b){_d.subVectors(b,a);const L=_d.length();m.position.copy(a).addScaledVector(_d,.5);m.scale.set(1,Math.max(L,.001),1);m.quaternion.setFromUnitVectors(UPY,_d.normalize());}
function ik(a,b,l1,l2,hint,mid,end){
  _d.subVectors(b,a);let L=_d.length();const mx=l1+l2-.002;if(L>mx)L=mx;if(L<.05)L=.05;_d.normalize();
  end.copy(a).addScaledVector(_d,L);
  const x=(l1*l1-l2*l2+L*L)/(2*L),h=Math.sqrt(Math.max(0,l1*l1-x*x));
  _p.copy(hint).addScaledVector(_d,-hint.dot(_d));if(_p.lengthSq()<1e-6)_p.set(0,0,1);_p.normalize();
  mid.copy(a).addScaledVector(_d,x).addScaledVector(_p,h);
}
const pv={hip:new V3(),hF:new V3(),hR:new V3(),aF:new V3(.26,.15,0),aR:new V3(-.26,.15,0),kF:new V3(),kR:new V3(),eF:new V3(),eR:new V3(),dir:new V3(),neck:new V3(),shC:new V3(),sF:new V3(),sR:new V3(),tF:new V3(),tR:new V3(),elF:new V3(),elR:new V3(),hnF:new V3(),hnR:new V3(),hint:new V3(),ax:new V3(),tmp:new V3()};
// 高立刃刻滑姿态（板局部坐标）：前刃髋压低顶向弯内、上身直立反弓，前膝向前、后膝跪雪，双臂张开（前手探雪、后手髋高向后）；后刃坐向脚跟侧、前膝顶起、后膝向前扣（八字）、后手撑雪、上身转向行进方向
const DEEP={
  toe:{hip:[-.08,.68,.22],hF:[.8,1,.3],hR:[-.3,.6,.75],dir:[.08,.75,-.66],tF:[.62,.72,.38],tR:[-.62,.95,-.1]},
  heel:{hip:[0,.5,-.2],hF:[.2,.8,1],hR:[.6,-.4,.4],dir:[.2,1,.25],tR:[-.32,.54,-.6]}
};
const mixTo=(v,a,k)=>v.set(v.x+(a[0]-v.x)*k,v.y+(a[1]-v.y)*k,v.z+(a[2]-v.z)*k);
function poseRider(o){
  const P=rig.P,c=o.crouch,dp=o.deep||0,k=Math.abs(dp),D=dp>0?DEEP.toe:DEEP.heel;
  pv.hip.set(o.lean*.15,.98-.42*c,-.03-.05*c);
  if(o.grab)pv.hip.y=.5;
  if(k>0)mixTo(pv.hip,D.hip,k);
  pv.hF.copy(pv.hip).x+=.1;pv.hR.copy(pv.hip).x-=.1;
  ik(pv.hF,pv.aF,.46,.46,mixTo(pv.hint.set(.3,0,1),D.hF,k),pv.kF,pv.eF);
  ik(pv.hR,pv.aR,.46,.46,mixTo(pv.hint.set(-.3,0,1),D.hR,k),pv.kR,pv.eR);
  setLimb(P.thF,pv.hF,pv.kF);setLimb(P.shF,pv.kF,pv.aF);setLimb(P.thR,pv.hR,pv.kR);setLimb(P.shR,pv.kR,pv.aR);
  P.knF.position.copy(pv.kF);P.knR.position.copy(pv.kR);P.hip.position.copy(pv.hip);
  let fz=.2+.32*c;if(o.grab==='Indy'||o.grab==='Melon')fz=.9;
  pv.dir.set(o.lean*.22,1,o.grab==='Melon'?-.2:fz);if(o.grab==='Melon')pv.dir.set(0,.9,.55);
  if(k>0)mixTo(pv.dir,D.dir,k);pv.dir.normalize();
  pv.neck.copy(pv.hip).addScaledVector(pv.dir,.56);
  setLimb(P.torso,pv.hip,pv.neck);P.chest.position.copy(pv.hip).addScaledVector(pv.dir,.42);
  const tw=o.twist+(dp<0?.6:.3)*o.look*k;pv.ax.set(Math.cos(tw),0,-Math.sin(tw)); // 高立刃时上身转向行进方向（后刃转得更多）
  pv.shC.copy(pv.neck).addScaledVector(pv.dir,-.06);
  pv.sF.copy(pv.shC).addScaledVector(pv.ax,.19);pv.sR.copy(pv.shC).addScaledVector(pv.ax,-.19);
  const sp=o.spread;
  pv.tF.copy(pv.sF).addScaledVector(pv.ax,.18+.2*sp).add(pv.tmp.set(0,-.38+.2*sp,.12));
  pv.tR.copy(pv.sR).addScaledVector(pv.ax,-.16-.2*sp).add(pv.tmp.set(0,-.4+.2*sp,.06));
  if(o.grab==='Indy')pv.tR.set(-.04,.07,.15);
  else if(o.grab==='Melon')pv.tF.set(.04,.07,-.15);
  else if(o.grab==='Nose Grab')pv.tF.set(.66,.08,0);
  else if(o.grab==='Tail Grab')pv.tR.set(-.66,.08,0);
  if(k>0){
    if(dp>0){mixTo(pv.tF,D.tF,k);mixTo(pv.tR,D.tR,k);}                 // 前刃：前手探向雪面，后手在髋部高度向后打开
    else{pv.tmp.copy(pv.kF);pv.tmp.y+=.07;pv.tF.lerp(pv.tmp,k);mixTo(pv.tR,D.tR,k);} // 后刃：前手搭前膝，后手撑雪
  }
  ik(pv.sF,pv.tF,.31,.31,pv.hint.set(.6,-.6,-.4),pv.elF,pv.hnF);
  ik(pv.sR,pv.tR,.31,.31,pv.hint.set(-.6,-.6,-.4),pv.elR,pv.hnR);
  setLimb(P.uaF,pv.sF,pv.elF);setLimb(P.faF,pv.elF,pv.hnF);setLimb(P.uaR,pv.sR,pv.elR);setLimb(P.faR,pv.elR,pv.hnR);
  P.elF.position.copy(pv.elF);P.elR.position.copy(pv.elR);P.hdF.position.copy(pv.hnF);P.hdR.position.copy(pv.hnR);
  P.head.position.copy(pv.neck).addScaledVector(pv.dir,.17);
  const lx=o.look*.85,lz=.5;P.head.rotation.set(0,Math.atan2(lx,lz),0);
}

/* ================= 雪痕与雪雾 ================= */
const trail=(function(){
  const MAX=3200,V=MAX*6,pos=new Float32Array(V*3),al=new Float32Array(V);
  const g=new T3.BufferGeometry();g.setAttribute('position',new T3.BufferAttribute(pos,3));g.setAttribute('aA',new T3.BufferAttribute(al,1));
  g.setDrawRange(0,0);
  const m=new T3.Mesh(g,new T3.ShaderMaterial({transparent:true,depthWrite:false,side:T3.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    uniforms:{uC:{value:new V3(.66,.74,.85)}},
    vertexShader:'attribute float aA;varying float vA;varying float vD;void main(){vA=aA;vec4 mv=modelViewMatrix*vec4(position,1.);vD=-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 uC;varying float vA;varying float vD;void main(){gl_FragColor=vec4(uC,vA*smoothstep(260.,40.,vD));}'}));
  m.frustumCulled=false;m.renderOrder=1;scene.add(m);
  let n=0,last=null;const A0=new V3(),B0=new V3(),A1=new V3(),B1=new V3();
  function put(vi,v,a){pos[vi*3]=v.x;pos[vi*3+1]=v.y;pos[vi*3+2]=v.z;al[vi]=a;}
  return{
    add(c,side,w,a){
      if(last){A0.copy(last.c).addScaledVector(last.s,last.w/2);B0.copy(last.c).addScaledVector(last.s,-last.w/2);A1.copy(c).addScaledVector(side,w/2);B1.copy(c).addScaledVector(side,-w/2);
        const b=(n%MAX)*6;put(b,A0,last.a);put(b+1,B0,last.a);put(b+2,A1,a);put(b+3,B0,last.a);put(b+4,B1,a);put(b+5,A1,a);n++;
        g.setDrawRange(0,Math.min(n,MAX)*6);g.attributes.position.needsUpdate=true;g.attributes.aA.needsUpdate=true;}
      last={c:c.clone(),s:side.clone(),w,a};
    },
    lastPos(){return last?last.c:null;},
    breakStroke(){last=null;},
    clear(){n=0;last=null;g.setDrawRange(0,0);}
  };
})();
const spray=(function(){
  const N=900,pos=new Float32Array(N*3),vel=new Float32Array(N*3),life=new Float32Array(N),maxl=new Float32Array(N),al=new Float32Array(N),sz=new Float32Array(N),base=new Float32Array(N);
  const g=new T3.BufferGeometry();g.setAttribute('position',new T3.BufferAttribute(pos,3));g.setAttribute('aA',new T3.BufferAttribute(al,1));g.setAttribute('aS',new T3.BufferAttribute(sz,1));
  const mat=new T3.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uPx:{value:400}},
    vertexShader:'attribute float aA;attribute float aS;uniform float uPx;varying float vA;void main(){vA=aA;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aS*uPx/max(-mv.z,.5);gl_Position=projectionMatrix*mv;}',
    fragmentShader:'varying float vA;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;gl_FragColor=vec4(.9,.94,1.,vA*smoothstep(.25,.02,r));}'});
  const pts=new T3.Points(g,mat);pts.frustumCulled=false;pts.renderOrder=2;scene.add(pts);
  let k=0;
  return{mat,
    emit(p,v,spread,l,s){const i=k++%N;pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;
      vel[i*3]=v.x+(Math.random()-.5)*spread;vel[i*3+1]=v.y+Math.random()*spread*.6;vel[i*3+2]=v.z+(Math.random()-.5)*spread;
      life[i]=maxl[i]=l*(.6+Math.random()*.6);base[i]=s*(.6+Math.random()*.8);},
    update(dt){for(let i=0;i<N;i++){if(life[i]>0){life[i]-=dt;const t=1-life[i]/maxl[i];
      vel[i*3+1]-=5*dt;const dr=Math.exp(-2.2*dt);vel[i*3]*=dr;vel[i*3+1]*=dr;vel[i*3+2]*=dr;
      pos[i*3]+=vel[i*3]*dt;pos[i*3+1]+=vel[i*3+1]*dt;pos[i*3+2]+=vel[i*3+2]*dt;
      al[i]=Math.max(0,.55*(1-t));sz[i]=base[i]*(1+t*2.2);}else{al[i]=0;}}
      g.attributes.position.needsUpdate=true;g.attributes.aA.needsUpdate=true;g.attributes.aS.needsUpdate=true;}
  };
})();

/* ================= 物理状态 ================= */
const EMAX=52*DEG, RSC=7.6, DRAG=0.0036;
// 卡刃与自动守刃：侧滑角（板和行进方向的夹角）超过 GUARD_SLIP 就自动守住上坡刃，超过 SIDE_SLIP 算横着滑（推坡）；
// 真卡刃要同时满足滑动方向那侧的刃角 > CATCH_E、侧滑速度 > CATCH_V、侧滑角 > CATCH_SLIP；横着落地看侧向速度 LAND_LAT
const GUARD_SLIP=12*DEG, GUARD_OFF=8*DEG, GUARD_V=1.5, SIDE_SLIP=45*DEG, CATCH_E=20*DEG, CATCH_V=4.5, CATCH_SLIP=25*DEG, LAND_LAT=6;
const PW_MU=.06, PW_DRAG=.008, PW_FLOAT=.6, PW_LAND=3.5; // 粉雪：额外滑动阻力、速度平方阻力、压后时阻力倍率、落地缓冲
const st={p:new V3(),v:new V3(),yaw:Math.PI,edge:0,press:0,air:false,airT:0,spin:0,airYaw:0,take:null,charging:false,charge:0,windup:0,noseLoad:false,
  grabT:0,grabName:null,grabbing:false,butterT:0,butterYaw:0,butterSide:0,butterFwd:1,deepT:0,deepMax:0,deepSide:1,crashed:false,crashT:0,crashRoll:0,crashSide:1,
  mode:'flat',vf:0,vl:0,speed:0,fwd:1,grip:false,butter:false,nVis:new V3(0,1,0),s:0,time:0,runTime:0,done:false,
  piste:2,zone:'top',zoneKey:'top',zoneHold:0,pw:0,noseT:0,stuckT:0,lastImpact:0,guard:false,visited:new Set()};
const N0=new V3(),N1=new V3(),F0=new V3(),T0=new V3(),U0=new V3(),LEFT=new V3(),GT=new V3(),TIP=new V3(),VT=new V3();
const score={total:0,best:0,combo:0,lastT:-99};
try{score.best=+(localStorage.getItem('edgeline-best')||0);}catch(e){}
// step() 不直接碰音频 / 界面，往这里推事件，由帧循环取走
const fx=[];
function emit(e){fx.push(e);if(fx.length>64)fx.shift();}
function drainFx(fn){while(fx.length)fn(fx.shift());}

function nearestPiste(x,s){sampleS(s);let d=1e9,k=0;for(let q=0;q<NP;q++){const dq=Math.abs(x-LC[q])-LW[q];if(dq<d){d=dq;k=q;}}return k;}
function placeAt(s,p){
  if(p==null||p<0)p=st.piste;
  s=clamp(s,-30,FINISH-30);
  for(const k of KICK){if(k.p===p&&s>k.s-k.ramp-3&&s<k.s+k.land+1)s=k.s+k.land+2;}
  const x=laneAt(p,s),z=-s;st.p.set(x,H(x,z),z);st.v.set(0,0,0);
  st.yaw=Math.atan2(laneD(p,s),-1);st.s=s;
  Object.assign(st,{edge:0,press:0,air:false,airT:0,spin:0,airYaw:0,charging:false,charge:0,windup:0,grabT:0,grabName:null,grabbing:false,butterT:0,butterYaw:0,deepT:0,crashed:false,crashT:0,crashRoll:0,mode:'flat',piste:p,noseT:0,stuckT:0,guard:false});
  normalAt(st.p.x,st.p.z,st.nVis);trail.breakStroke();
}
function crash(reason){
  if(st.crashed)return;
  st.crashed=true;st.crashT=2.1;st.crashRoll=0;st.crashSide=st.edge>=0?1:-1;st.air=false;st.charging=false;st.charge=0;
  score.combo=0;st.v.multiplyScalar(.7);trail.breakStroke();
  burst(st.p,22,3);
  popup('摔倒了',reason,'',true);
  emit({type:'crash',reason});
}
function award(name,pts,sub,sketchy){
  if(score.lastT>st.time-3.5)score.combo++;else score.combo=1;
  score.lastT=st.time;
  const mult=1+.25*(score.combo-1);let got=Math.round(pts*mult*(sketchy?.5:1));
  score.total+=got;
  popup(name,'+'+got.toLocaleString()+(score.combo>1?'   连招 ×'+mult.toFixed(2):''),sub||'',false);
  emit({type:'award',name,pts:got,combo:score.combo,bad:!!sketchy});
  if(sketchy)score.combo=0;
}

function step(dt,inp){
  st.time+=dt;
  if(st.done)return;
  st.runTime+=dt;
  if(st.crashed){crashStep(dt);return;}
  const sf=surfaceAt(st.p.x,st.p.z);st.pw=st.air?0:sf.powder;
  trackZone(sf,dt);
  if(st.air)airStep(dt,inp);else groundStep(dt,inp);
  if(!st.crashed)hitTree();
  st.s=-st.p.z;
  if(st.s>FINISH-25&&!st.air&&!st.crashed)finishRun();
  if(Math.abs(st.p.x)>MAP_X||st.s<S_MIN+40||st.s>S_MAX-15){placeAt(st.s,nearestPiste(st.p.x,st.s));return;}
  // 在野雪里卡住了就提示复位
  if(!st.air&&!st.crashed&&st.v.length()<.5&&sf.d>5){st.stuckT+=dt;if(st.stuckT>5&&st.stuckT-dt<=5)popup('卡在野雪里','按 R 回到雪道','',false);}else st.stuckT=0;
}
function trackZone(sf,dt){
  const key=sf.trunk?sf.zone:sf.k+':'+sf.zone;
  if(key===st.zoneKey){st.zoneHold=0;return;}
  st.zoneHold+=dt;if(st.zoneHold<.4)return;
  st.zoneKey=key;st.zoneHold=0;st.zone=sf.zone;
  if(!sf.trunk&&sf.zone!=='off'){st.piste=sf.k;st.visited.add(sf.k);}
  emit({type:'zone',zone:sf.zone,piste:sf.trunk?-1:sf.k});
}
function hitTree(){
  if(st.air&&st.p.y-H(st.p.x,st.p.z)>2.5)return;
  const ix=Math.floor(st.p.x/TREE_CELL),iz=Math.floor(st.p.z/TREE_CELL);
  for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const L=treeGrid.get(tkey(ix+a,iz+b));if(!L)continue;
    for(const t of L){const dx=st.p.x-t[0],dz=st.p.z-t[1],r=t[2]+.25;if(dx*dx+dz*dz<r*r){
      const l=Math.hypot(dx,dz)||1;st.p.x=t[0]+dx/l*r;st.p.z=t[1]+dz/l*r;st.p.y=H(st.p.x,st.p.z);
      st.v.multiplyScalar(.2);emit({type:'tree'});crash('撞到树了');return;}}}
}

function groundStep(dt,inp){
  const n=normalAt(st.p.x,st.p.z,N0);
  basis(st.yaw,n,F0,T0);
  const vf0=st.v.dot(F0),vl0=st.v.dot(T0),sp=st.v.length();
  const fwd=vf0>=0?1:-1;st.fwd=fwd;
  if(sp>.6)U0.copy(st.v).normalize();else U0.copy(F0).multiplyScalar(fwd);
  LEFT.crossVectors(n,U0);
  const sideSign=T0.dot(LEFT)>=0?1:-1;   // 脚尖一侧是否在行进方向左边
  const pw=st.pw;

  // 压板（物理坐标：+ 为板头），W 压的是行进方向的前端
  const refFwd=st.butterT>0?st.butterFwd:fwd; // 平花转动过程中保持「前端」的参照不变
  st.press+=(inp.lean*refFwd-st.press)*Math.min(1,dt*9);
  const butter=Math.abs(st.press)>.62&&!inp.brake&&pw<.5; // 深粉雪里压不出平花
  st.butter=butter;

  // 蓄力
  if(inp.jump){
    if(!st.charging){st.charging=true;st.charge=0;st.windup=0;}
    st.charge=Math.min(1,st.charge+dt/.45);
    st.windup=clamp(st.windup+inp.steer*dt*3.2,-1,1);
    st.noseLoad=inp.lean>.35;
  }

  // 自动守刃（带滞回）：板和行进方向差得多时，骑手会本能地守住上坡刃（滑动方向的反侧），不会把下坡刃压下去
  const slip=Math.atan2(Math.abs(vl0),Math.abs(vf0)+.05); // 侧滑角 0–90°，正脚反脚都算
  const up=-Math.sign(vl0);
  if(!st.guard){if(slip>GUARD_SLIP&&Math.abs(vl0)>GUARD_V)st.guard=true;}
  else if(slip<GUARD_OFF||Math.abs(vl0)<.6)st.guard=false;

  // 目标立刃角与偏航
  let eT=0,yawRate=0,sideSlip=false;
  if(inp.brake){
    const au=Math.atan2(U0.x,U0.z);
    const c1=wrapPi(au+Math.PI/2-st.yaw),c2=wrapPi(au-Math.PI/2-st.yaw);
    const dy=Math.abs(c1)<Math.abs(c2)?c1:c2;
    yawRate=clamp(dy*7,-4.5,4.5);
    eT=(vl0>=0?-1:1)*(17+11*Math.abs(inp.steer))*DEG; // 上坡刃
  }else if(butter){
    eT=0;
    yawRate=st.charging?0:inp.steer*5.2; // 蓄力时左右拨只预拧上身，板不转
  }else{
    eT=inp.steerSm*sideSign*EMAX;
    if(st.guard&&!(Math.sign(eT)===up&&Math.abs(eT)>4*DEG)){ // 想立的是下坡刃或者放平：改成上坡刃
      if(slip<=SIDE_SLIP)eT=up*Math.max(Math.abs(eT),30*DEG);                            // 角度差一点：顺势用上坡刃刻过去
      else{eT=up*clamp(8+2.5*Math.abs(vl0),8,24)*DEG;sideSlip=true;}                   // 横着滑：上坡刃推坡
    }
  }
  st.edge+=(eT-st.edge)*Math.min(1,dt*7);
  const absE=Math.abs(st.edge);

  // 上坡刃在侧滑角不太大时就能咬住；下坡刃只有板和速度几乎对齐时才咬得住（正常换刃起弯）
  const correctSide=Math.abs(vl0)<.8||Math.sign(st.edge)===up||slip<GUARD_SLIP;
  const grip=!butter&&!inp.brake&&!sideSlip&&absE>9*DEG&&slip<(10*DEG+absE*.6)&&correctSide;
  st.grip=grip;
  if(grip){
    // 转弯半径：侧切半径 × cos(立刃角)，并受立刃角能承受的向心加速度限制；粉雪里板会漂，弯更大
    const R=Math.max(RSC*Math.cos(absE)*(1+.5*pw),(sp*sp)/(G*Math.tan(absE)*1.1));
    yawRate+=-Math.sign(st.edge)*vf0/R*smooth(9*DEG,16*DEG,absE);
  }else if(!inp.brake&&!butter){
    yawRate+=inp.steer*fwd*2.4*(1-.6*smooth(2,14,sp))*(st.guard&&slip<=SIDE_SLIP&&Math.sign(st.edge)===up?.25:1); // 角度差一点、正在顺势立上坡刃时少拧板，让刃先咬住
    if(sp>2.5){ // 板自然回正到行进方向（正脚或反脚）
      const au=Math.atan2(U0.x,U0.z);const d1=wrapPi(au-st.yaw),d2=wrapPi(au+Math.PI-st.yaw);const d=Math.abs(d1)<Math.abs(d2)?d1:d2;
      yawRate+=d*2.6*(1-Math.abs(inp.steer)*.7)*(sideSlip?0:1); // 横着推坡时板不会自己转回来，松手就一直推坡到停
    }
  }
  if(sp<3&&!butter&&!inp.brake)yawRate+=inp.steer*fwd*1.2;

  const dyaw=yawRate*dt;
  if(butter&&dyaw!==0){const sg=Math.sign(st.press);TIP.copy(st.p).addScaledVector(F0,.7*sg);st.yaw+=dyaw;basis(st.yaw,n,F0,T0);st.p.copy(TIP).addScaledVector(F0,-.7*sg);}
  else{st.yaw+=dyaw;basis(st.yaw,n,F0,T0);}

  // 平花计分
  if(butter){if(st.butterT===0){st.butterSide=Math.sign(st.press);st.butterFwd=fwd;st.butterYaw=0;}st.butterT+=dt;st.butterYaw+=dyaw;}
  else if(st.butterT>0){finishButter();}

  // 重力切向分量
  GT.set(0,-G,0).addScaledVector(n,G*n.y);st.v.addScaledVector(GT,dt);
  let vf=st.v.dot(F0),vl=st.v.dot(T0);const vn=st.v.dot(n),gn=G*n.y;

  // 卡刃：横滑得很快，而滑动方向那一侧的刃（下坡刃）已经大角度压进雪里
  if(!butter&&absE>CATCH_E&&Math.sign(st.edge)===Math.sign(vl)&&Math.abs(vl)>CATCH_V&&slip>CATCH_SLIP){crash('卡刃：横滑时下坡刃压进了雪里');return;}

  if(grip){
    const spd=Math.hypot(vf,vl);vl*=Math.exp(-28*dt);vf=(vf>=0?1:-1)*Math.sqrt(Math.max(0,spd*spd-vl*vl));
    st.mode='carve';
  }else{
    let mu=butter?.24:.05+1.45*Math.sin(absE);if(inp.brake)mu+=.12;if(inp.brake||sideSlip)mu+=.6*smooth(.94,.8,n.y); // 越陡刃咬得越深，陡坡上也能推坡控速
    const d=mu*gn*dt;vl=Math.abs(vl)<=d?0:vl-Math.sign(vl)*d;
    st.mode=butter?'butter':(Math.abs(vl)>1.0?'skid':'flat');
  }
  let fr=(.04+.03*Math.sin(absE))*gn+DRAG*vf*vf;
  if(pw>0){
    // 粉雪：板陷进去，额外的前进阻力；重心压后让板头浮起来能少掉速，高速压板头会扎进去
    const back=st.press*fwd;
    fr+=pw*(PW_MU*gn+PW_DRAG*vf*vf)*(back<-.3?PW_FLOAT:1);
    if(back>.5&&sp>8&&pw>.5){st.noseT+=dt;if(st.noseT>.4){crash('板头扎进粉雪：重心太靠前');return;}}else st.noseT=0;
  }else st.noseT=0;
  vf=Math.abs(vf)<=fr*dt?0:vf-Math.sign(vf)*fr*dt;
  st.vf=vf;st.vl=vl;
  st.v.copy(F0).multiplyScalar(vf).addScaledVector(T0,vl).addScaledVector(n,vn);

  // 高立刃刻滑
  if(st.mode==='carve'&&absE>38*DEG&&sp>9){if(st.deepT===0)st.deepMax=0;st.deepT+=dt;st.deepMax=Math.max(st.deepMax,absE);st.deepSide=Math.sign(st.edge);}
  else finishDeep();

  // 起跳
  if(!inp.jump&&st.charging){
    st.charging=false;
    if(st.charge>.12){pop(n,fwd,2.3+2.7*st.charge);return;}
    st.charge=0;
  }

  st.p.addScaledVector(st.v,dt);
  const h=H(st.p.x,st.p.z);normalAt(st.p.x,st.p.z,N1);
  const gap=st.p.y-h,vout=st.v.dot(N1);
  // 雪面弯走的速度超过重力能把人压住的程度，就离地（跳台唇口、凸包）
  if(vout>G*N1.y*dt+.1&&gap>-.02){
    // 自然离地（跳台唇口、凸包）；如果正在蓄力，就在唇口顺势起跳
    if(st.charging){const pw2=1.1+1.6*st.charge;st.charging=false;st.v.addScaledVector(N1,pw2);beginAir(st.noseLoad?'Nollie':'Ollie',fwd);st.spin=st.windup*4.2;st.charge=0;emit({type:'pop',power:pw2});}
    else beginAir('Air',fwd);
  }else{st.p.y=h;st.v.addScaledVector(N1,-vout);}
}
function pop(n,fwd,strength){
  st.v.addScaledVector(n,strength);
  beginAir(st.noseLoad?'Nollie':'Ollie',fwd);
  st.spin=st.windup*4.2;st.charge=0;
  st.p.addScaledVector(n,.03);
  burst(st.p,10,1.6);
  emit({type:'pop',power:strength});
}
function beginAir(type,fwd){
  st.air=true;st.airT=0;st.airYaw=0;st.grabName=null;st.grabT=0;
  st.take={type,sw:fwd<0,fwd};
  if(st.butterT>0)finishButter();
  finishDeep();
  trail.breakStroke();st.mode='air';
}
function finishDeep(){
  if(st.deepT>1.4)award('高立刃刻滑',Math.round(90+st.deepT*60),`${st.deepSide>0?'前刃':'后刃'} · 最大立刃 ${Math.round(st.deepMax/DEG)}° · ${st.deepT.toFixed(1)} s`,false);
  st.deepT=0;
}
function finishButter(){
  const deg=Math.round(Math.abs(st.butterYaw)/Math.PI)*180;
  const lead=st.butterSide===st.butterFwd?'Nose':'Tail';
  if(deg>=180){const fs=Math.sign(st.butterYaw)===st.butterFwd;award(`${fs?'FS':'BS'} ${lead} Butter ${deg}`,120+deg*.9,lead==='Nose'?'压板头平花':'压板尾平花',false);}
  else if(st.butterT>.8)award(`${lead} Press`,Math.round(50+st.butterT*40),lead==='Nose'?'压板头':'压板尾',false);
  st.butterT=0;st.butterYaw=0;
}
function grabNameFor(inp){if(inp.brake)return'Melon';if(inp.lean>.4)return'Nose Grab';if(inp.lean<-.4)return'Tail Grab';return'Indy';}
function airStep(dt,inp){
  st.airT+=dt;
  st.v.y-=G*dt;const sp=st.v.length();st.v.multiplyScalar(1-DRAG*sp*dt);
  if(inp.steer!==0)st.spin+=(inp.steer*7.6-st.spin)*Math.min(1,dt*4.5);else st.spin*=Math.exp(-4*dt); // 松开方向就收住转体，方便对准落地
  st.grabbing=inp.grab;
  if(inp.grab){st.grabT+=dt;if(st.grabT>.22&&!st.grabName)st.grabName=grabNameFor(inp);}else st.grabT=0;
  const dy=st.spin*(inp.grab?.82:1)*dt;st.yaw+=dy;st.airYaw+=dy;
  st.press+=(inp.lean*st.take.fwd-st.press)*Math.min(1,dt*6);
  st.edge+=(0-st.edge)*Math.min(1,dt*5);
  st.p.addScaledVector(st.v,dt);
  const h=H(st.p.x,st.p.z);
  if(st.p.y<=h)land(h,inp);
}
function land(h,inp){
  const n=normalAt(st.p.x,st.p.z,N0);st.p.y=h;
  const vn=st.v.dot(n);VT.copy(st.v).addScaledVector(n,-vn);const spT=VT.length();
  basis(st.yaw,n,F0,T0);
  let mis=0;if(spT>1)mis=Math.acos(clamp(Math.abs(F0.dot(VT)/spT),0,1));
  const real=st.airT>.28;
  st.air=false;const spin=st.spin;st.spin=0;st.grabbing=false;st.lastImpact=-vn;
  const pw=surfaceAt(st.p.x,st.p.z).powder;
  if(real){
    if(inp.grab)return crash('落地时还抓着板');
    if(mis>70*DEG||(mis>40*DEG&&spT*Math.sin(mis)>LAND_LAT))return crash('卡刃：板横着落地（差 '+Math.round(mis/DEG)+'°）'); // 侧向速度小时横着落地只算不稳，落地后自动守刃推坡
    if(vn<-(12.5+PW_LAND*pw))return crash('落地太重，冲击 '+(-vn).toFixed(1)+' m/s');
  }
  const absorb=clamp(-vn*.025,0,.3);st.v.copy(VT).multiplyScalar(1-absorb);
  const sketchy=real&&mis>18*DEG;if(sketchy)st.v.multiplyScalar(.8);
  burst(st.p,real?18:5,real?2.4:1);
  emit({type:'land',impact:-vn,real,sketchy,airT:st.airT});
  if(real)scoreAir(sketchy,spin);
  st.grabName=null;st.grabT=0;
}
function scoreAir(sketchy){
  const deg=Math.round(Math.abs(st.airYaw)/Math.PI)*180;
  const fs=Math.sign(st.airYaw)===st.take.fwd;
  const parts=[];if(st.take.sw)parts.push('Switch');
  if(st.take.type!=='Air')parts.push(st.take.type);
  if(deg>=180)parts.push((fs?'FS ':'BS ')+deg);
  if(st.grabName)parts.push(st.grabName);
  if(parts.length===0||(parts.length===1&&parts[0]==='Switch'))parts.push(st.airT>.7?'Straight Air':'Hop');
  const pts=50+deg*1.15+st.airT*90+(st.grabName?180:0);
  const sub=[];if(deg>=180)sub.push(fs?'正转':'背转');sub.push('滞空 '+st.airT.toFixed(2)+' s');if(sketchy)sub.push('落地不稳');
  award(parts.join(' '),pts,sub.join(' · '),sketchy);
}
function crashStep(dt){
  st.crashT-=dt;st.crashRoll=Math.min(1.45,st.crashRoll+dt*4);
  const n=normalAt(st.p.x,st.p.z,N0);
  GT.set(0,-G,0).addScaledVector(n,G*n.y);st.v.addScaledVector(GT,dt*.3);
  const sp=st.v.length(),d=6*dt;if(sp<=d)st.v.set(0,0,0);else st.v.multiplyScalar((sp-d)/sp);
  st.v.addScaledVector(n,-st.v.dot(n));
  st.p.addScaledVector(st.v,dt);st.p.y=H(st.p.x,st.p.z);
  st.mode='crash';
  if(st.crashT<=0){const s=-st.p.z,sf=surfaceAt(st.p.x,st.p.z);placeAt(s+2,sf.d>3?nearestPiste(st.p.x,s):sf.k);}
}

/* ================= 输入 ================= */
const keys=new Set();
const PREVENT=new Set(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',e=>{
  if(PREVENT.has(e.code))e.preventDefault();
  keys.add(e.code);SND.unlock();
  if(e.code==='KeyR'&&running&&!st.done)placeAt(st.s,nearestPiste(st.p.x,st.s));
  if(e.code==='KeyM')toggleMute();
  if((e.code==='Enter'||e.code==='Space')&&!running){e.preventDefault();startRun();}
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>keys.clear());
addEventListener('pointerdown',()=>SND.unlock());
const touch={steer:0,lean:0,jump:false,brake:false,grab:false,active:false};
let steerSm=0;
function readInput(dt){
  let ks=0,kl=0;
  if(keys.has('KeyA')||keys.has('ArrowLeft'))ks+=1;
  if(keys.has('KeyD')||keys.has('ArrowRight'))ks-=1;
  if(keys.has('KeyW')||keys.has('ArrowUp'))kl+=1;
  if(keys.has('KeyS')||keys.has('ArrowDown'))kl-=1;
  steerSm+=(ks-steerSm)*Math.min(1,dt*7);
  const t=touch.active;
  return{steer:t?touch.steer:ks,steerSm:t?touch.steer:steerSm,lean:t?touch.lean:kl,
    jump:keys.has('Space')||touch.jump,
    brake:keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('KeyK')||touch.brake,
    grab:keys.has('KeyJ')||keys.has('KeyF')||touch.grab};
}
const isTouch=('ontouchstart' in window)||(window.matchMedia&&matchMedia('(pointer: coarse)').matches);
if(isTouch)document.body.classList.add('is-touch');
(function setupTouch(){
  const stick=document.getElementById('stick'),knob=document.getElementById('knob');let pid=null,cx=0,cy=0;
  const R=52;
  function upd(e){let dx=e.clientX-cx,dy=e.clientY-cy;const l=Math.hypot(dx,dy);if(l>R){dx*=R/l;dy*=R/l;}
    knob.style.transform=`translate(${dx}px,${dy}px)`;
    const dz=v=>Math.abs(v)<.12?0:(v-Math.sign(v)*.12)/.88;
    touch.steer=dz(-dx/R);touch.lean=dz(-dy/R);}
  stick.addEventListener('pointerdown',e=>{e.preventDefault();pid=e.pointerId;stick.setPointerCapture(pid);const r=stick.getBoundingClientRect();cx=r.left+r.width/2;cy=r.top+r.height/2;touch.active=true;upd(e);});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===pid)upd(e);});
  const end=e=>{if(e.pointerId!==pid)return;pid=null;touch.active=false;touch.steer=0;touch.lean=0;knob.style.transform='';};
  stick.addEventListener('pointerup',end);stick.addEventListener('pointercancel',end);
  for(const [id,key] of[['bJump','jump'],['bBrake','brake'],['bGrab','grab']]){
    const b=document.getElementById(id);
    b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);touch[key]=true;b.classList.add('on');if(!running&&key==='jump')startRun();});
    const off=()=>{touch[key]=false;b.classList.remove('on');};
    b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);b.addEventListener('lostpointercapture',off);
  }
  addEventListener('contextmenu',e=>e.preventDefault());
})();

/* ================= HUD ================= */
const $=id=>document.getElementById(id);
const hud={spd:$('spd'),mode:$('mode'),stance:$('stance'),edgeVal:$('edgeVal'),heel:$('edgeHeel'),toe:$('edgeToe'),piste:$('piste'),slope:$('slope'),score:$('score'),best:$('best'),prog:$('prog'),dist:$('dist'),charge:$('charge'),chargeI:document.querySelector('#charge i'),bJump:$('bJump'),
  pDot:$('pisteDot'),pName:$('pisteName'),zone:$('zone'),alt:$('alt'),mute:$('muteBtn')};
const trickEl=$('trick'),bannerEl=$('banner');
function popup(name,pts,sub,bad){
  $('tName').textContent=name;$('tPts').textContent=pts;$('tSub').textContent=sub;
  trickEl.classList.toggle('bad',!!bad);trickEl.classList.remove('show');void trickEl.offsetWidth;trickEl.classList.add('show');
}
function banner(e){
  if(e.zone==='groomed')return;
  const z=ZONES[e.zone]||ZONES.groomed,P=e.piste>=0?PISTES[e.piste]:null;
  $('bnName').textContent=(P?P.key+' '+P.name+' · ':'')+z[0];$('bnTip').textContent=z[1];
  bannerEl.style.setProperty('--c',P?P.color:'#ff7a1a');
  bannerEl.classList.remove('show');void bannerEl.offsetWidth;bannerEl.classList.add('show');
}
const MODE={carve:['刻滑 CARVE','on'],deep:['高立刃 CARVE','on'],skid:['推坡 SKID',''],flat:['平板 FLAT',''],butter:['平花 BUTTER','on'],air:['滞空 AIR','air'],crash:['摔倒','bad']};
const ALT0=1650,H_FIN=H(laneAt(0,FINISH),-FINISH);
// 小地图：雪道俯视示意（横向和纵向比例不同），静态底图只画一次
const minimap=(function(){
  const cv=$('map');if(!cv||!cv.getContext)return{draw(){}};
  const W=104,Hh=176,dpr=Math.min(2,window.devicePixelRatio||1);cv.width=W*dpr;cv.height=Hh*dpr;
  const g=cv.getContext('2d');if(!g||!g.beginPath)return{draw(){}};
  const sx=x=>W/2+x*(W-12)/920,sy=s=>6+(s+40)*(Hh-12)/(FINISH+80);
  const bg=document.createElement('canvas');bg.width=cv.width;bg.height=cv.height;const b=bg.getContext('2d');b.scale(dpr,dpr);
  b.lineCap='round';b.lineJoin='round';
  for(let i=0;i<NP;i++){b.beginPath();for(let s=-30;s<=FINISH;s+=20){const x=sx(laneAt(i,s)),y=sy(s);if(s===-30)b.moveTo(x,y);else b.lineTo(x,y);}
    b.strokeStyle=PISTES[i].color==='#16181c'?'#e9edf2':PISTES[i].color;b.globalAlpha=.85;b.lineWidth=Math.max(2,PISTES[i].half*2*(W-12)/920);b.stroke();}
  b.globalAlpha=1;b.fillStyle='#1f6dff';KICK.forEach(k=>{b.beginPath();b.arc(sx(laneAt(k.p,k.s)+k.u),sy(k.s),k.big?2.6:1.4,0,7);b.fill();});
  b.fillStyle='#f2f6fa';b.font='600 9px sans-serif';b.textAlign='center';
  PISTES.forEach((P,i)=>b.fillText(P.key,sx(P.lane),sy(1300)));
  b.fillText('▲',sx(laneAt(0,-30)),sy(-60)+6);b.fillRect(sx(laneAt(0,FINISH))-8,sy(FINISH),16,1.5);
  return{draw(){g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cv.width,cv.height);g.drawImage(bg,0,0);g.scale(dpr,dpr);
    const x=sx(clamp(st.p.x,-460,460)),y=sy(clamp(st.s,-40,FINISH+20));
    g.beginPath();g.arc(x,y,3.6,0,7);g.fillStyle='#fff';g.fill();g.lineWidth=1.5;g.strokeStyle='#0c1624';g.stroke();}};
})();
let hudT=0;
function updateHud(dt){
  hudT+=dt;if(hudT<1/15)return;hudT=0;
  const sp=st.v.length();hud.spd.textContent=Math.round(sp*3.6);
  const m=MODE[st.air?'air':st.mode==='carve'&&Math.abs(st.edge)>38*DEG?'deep':st.mode]||MODE.flat;
  if(hud.mode.textContent!==m[0]){hud.mode.textContent=m[0];hud.mode.className='chip'+(m[1]?' '+m[1]:'');}
  hud.stance.textContent=st.fwd>0?'REG':'SWITCH';
  const e=st.edge/DEG,ae=Math.abs(e);
  hud.edgeVal.textContent=Math.round(ae)+'°';hud.edgeVal.style.color=ae<3?'':(e>0?'var(--toe)':'var(--heel)');
  hud.toe.style.width=(e>0?ae/52*50:0)+'%';hud.heel.style.width=(e<0?ae/52*50:0)+'%';
  normalAt(st.p.x,st.p.z,N1);const ang=Math.acos(clamp(N1.y,-1,1))/DEG,pct=Math.tan(ang*DEG)*100;
  const cls=pct<12?['#2e9e5b','绿道']:pct<25?['#2f6fe0','蓝道']:pct<40?['#e0383e','红道']:['#111','黑道'];
  hud.piste.style.background=cls[0];hud.slope.textContent=`${cls[1]} · ${ang.toFixed(0)}° / ${pct.toFixed(0)}%`;
  const sf=surfaceAt(st.p.x,st.p.z),P=sf.trunk?null:PISTES[sf.k],z=ZONES[sf.zone]||ZONES.groomed;
  hud.pName.textContent=P?P.key+' '+P.name:(st.s<650?'山顶主干道':'山脚大道');
  hud.pDot.style.background=P?P.color:'#ff7a1a';
  const zt=sf.zone==='groomed'?'压雪道':z[0];if(hud.zone.textContent!==zt)hud.zone.textContent=zt;
  hud.alt.textContent='海拔 '+Math.round(ALT0+st.p.y-H_FIN)+' m';
  hud.score.textContent=score.total.toLocaleString();hud.best.textContent='最佳 '+Math.max(score.best,score.total).toLocaleString();
  const s=clamp(st.s,0,FINISH);hud.prog.style.width=(s/FINISH*100)+'%';
  const next=!sf.trunk&&sf.k===3?KICK.find(k=>k.s>s+2):null;
  hud.dist.textContent=next?`下个${next.big?'大':''}跳台 ${Math.round(next.s-s)} m`:`距山脚 ${Math.round(FINISH-s)} m`;
  const c=st.charging?st.charge:0;hud.charge.classList.toggle('on',st.charging);hud.chargeI.style.width=(c*100)+'%';hud.bJump.style.setProperty('--c',c.toFixed(3));
  minimap.draw();
}
function syncMute(){const m=!!SND.state.muted;if(hud.mute){hud.mute.textContent=m?'声音 关':'声音 开';hud.mute.setAttribute('aria-pressed',String(m));}}
function toggleMute(){SND.unlock();SND.toggleMute();syncMute();}

/* ================= 镜头与可视化 ================= */
const camDir=new V3(0,0,-1),camTarget=new V3(),lookAt=new V3(),tmpV=new V3(),Fv=new V3(),Tv=new V3(),Mb=new T3.Matrix4(),Qb=new T3.Quaternion(),Qr=new T3.Quaternion();
let fov=62,crouchV=.25,twistV=0,spreadV=0,sinkV=0,deepV=0;
const XAX=new V3(1,0,0);
function updateVisual(dt){
  const sp=st.v.length();
  // 板的朝向
  if(st.air)st.nVis.lerp(UPY,1-Math.exp(-4*dt)).normalize();
  else{normalAt(st.p.x,st.p.z,N1);st.nVis.lerp(N1,1-Math.exp(-14*dt)).normalize();}
  basis(st.yaw,st.nVis,Fv,Tv);
  Mb.makeBasis(Fv,st.nVis,Tv);Qb.setFromRotationMatrix(Mb);
  let roll=st.edge;if(st.crashed)roll=st.crashSide*st.crashRoll;
  Qr.setFromAxisAngle(XAX,roll);rig.frame.quaternion.copy(Qb).multiply(Qr);
  // 粉雪里板陷下去，速度越快越浮
  const pw=st.air?0:surfaceAt(st.p.x,st.p.z).powder;
  sinkV+=(pw*.22*(1-.6*smooth(4,14,sp))-sinkV)*Math.min(1,dt*6);
  rig.frame.position.copy(st.p).addScaledVector(st.nVis,Math.sin(Math.abs(roll))*.13+.005-sinkV);
  const ps=Math.sign(st.press)||1,pa=st.press*.3;
  rig.pivot.position.set(ps*.7,0,0);rig.body.position.set(-ps*.7,0,0);rig.pivot.rotation.set(0,0,-pa);
  // 姿态
  const ae=Math.abs(st.edge)/EMAX;
  let cr=st.air?(st.grabbing?1:.5):.22+ae*.45+(st.charging?st.charge*.55:0)+(st.mode==='skid'?.18:0);
  if(st.crashed)cr=1;
  crouchV+=(clamp(cr,0,1)-crouchV)*Math.min(1,dt*10);
  let tw=st.air?clamp(-st.spin*.07,-.6,.6):(st.charging?-st.windup*.7:0);
  twistV+=(tw-twistV)*Math.min(1,dt*8);
  spreadV+=((st.air&&!st.grabbing?.6:st.mode==='skid'?.35:0)-spreadV)*Math.min(1,dt*6);
  // 高立刃刻滑：刃角 30°→48° 之间逐渐换成前刃 / 后刃的高立刃姿态（板立起来了身体就要跟着换，几乎停下时才不换）
  const dT=!st.air&&!st.crashed&&st.mode==='carve'?Math.sign(st.edge)*smooth(30*DEG,48*DEG,Math.abs(st.edge))*smooth(2,5,sp):0;
  deepV+=(dT-deepV)*Math.min(1,dt*6);
  poseRider({crouch:crouchV,lean:st.press,twist:twistV,spread:spreadV,grab:st.air&&st.grabbing?(st.grabName||grabNameFor(lastInp)):null,look:st.fwd,deep:deepV});
  // 镜头
  if(!st.crashed){
    if(sp>1.5)tmpV.set(st.v.x,0,st.v.z).normalize();else tmpV.set(Fv.x*st.fwd,0,Fv.z*st.fwd).normalize();
    if(tmpV.lengthSq()>.5)camDir.lerp(tmpV,1-Math.exp(-(st.air?1.2:2.4)*dt)).normalize();
  }
  camTarget.copy(st.p).addScaledVector(camDir,-6.4);camTarget.y=st.p.y+2.7;
  const hg=H(camTarget.x,camTarget.z)+1.3;if(camTarget.y<hg)camTarget.y=hg;
  camera.position.lerp(camTarget,1-Math.exp(-7*dt));
  lookAt.copy(st.p).addScaledVector(camDir,3).y+=.9;camera.lookAt(lookAt);
  fov+=((60+clamp(sp*.4,0,16))-fov)*Math.min(1,dt*2);camera.fov=fov;camera.updateProjectionMatrix();
  sun.position.copy(st.p).add(SUN_OFF);sun.target.position.copy(st.p);
  sky.position.copy(camera.position);mountains.position.set(camera.position.x,camera.position.y-60,camera.position.z);
  for(const m of treeChunks)m.visible=m.userData.c.distanceToSquared(camera.position)<900*900;
  // 雪痕与雪雾
  if(running&&!st.air&&!st.crashed&&!st.done){
    const lp=trail.lastPos();
    if(!lp||lp.distanceToSquared(st.p)>.09){
      const ae2=Math.abs(st.edge);let w,a;const c=tmpV.copy(st.p).addScaledVector(Tv,Math.sign(st.edge)*.13*smooth(4*DEG,15*DEG,ae2)).addScaledVector(st.nVis,.05);
      const side=LEFT.crossVectors(st.nVis,sp>.5?VT.copy(st.v).normalize():Fv).normalize();
      if(pw>.5){w=.42+(st.mode==='skid'?.4:0);a=.5;}
      else if(st.mode==='carve'){w=.07+.05*(1-ae2/EMAX);a=.62;}
      else if(st.mode==='skid'){w=clamp(1.5*Math.abs(Fv.dot(side)),.3,1.45);a=.26;}
      else if(st.mode==='butter'){w=.34;a=.3;}
      else{w=.27;a=.16;}
      if(sp>.4)trail.add(c,side,w,a);
    }
    const ae2=Math.abs(st.edge);
    if(pw>.4&&sp>4&&Math.random()<dt*(10+sp*2.5)*(ae2>12*DEG||st.mode==='skid'?2.2:.7)){ // 粉雪：板头和刃外侧扬起大团雪
      tmpV.copy(st.p).addScaledVector(Tv,-Math.sign(st.edge||1)*.2).addScaledVector(Fv,st.fwd*(Math.random()-.3));
      VT.copy(Tv).multiplyScalar(-Math.sign(st.edge||1)*(1+ae2*3)).addScaledVector(Fv,st.fwd*sp*.3).addScaledVector(st.nVis,1.8+Math.random()*2);spray.emit(tmpV,VT,1.6,1.3,.3);}
    if(st.mode==='skid'){const n=Math.min(6,Math.abs(st.vl)*1.2*dt*60);for(let i=0;i<n;i++){if(Math.random()<dt*30){tmpV.copy(st.p).addScaledVector(Tv,-Math.sign(st.vl)*.15).addScaledVector(Fv,(Math.random()-.5)*1.4);VT.copy(Tv).multiplyScalar(Math.sign(st.vl)*(1.2+Math.abs(st.vl)*.5)).addScaledVector(st.nVis,1.2+Math.random()*1.6);spray.emit(tmpV,VT,1.2,.9,.16);}}}
    else if(st.mode==='carve'&&sp>8&&ae2>25*DEG){const rate=(ae2-25*DEG)/(27*DEG)*sp*2.2;let n=rate*dt;while(n>0){if(Math.random()<n){tmpV.copy(st.p).addScaledVector(Tv,Math.sign(st.edge)*.14).addScaledVector(Fv,-st.fwd*.5);VT.copy(Tv).multiplyScalar(-Math.sign(st.edge)*2.2).addScaledVector(Fv,st.fwd*sp*.25).addScaledVector(st.nVis,1.4+Math.random()*1.4);spray.emit(tmpV,VT,1,.8,.13);}n-=1;}}
    else if(st.mode==='butter'&&Math.random()<dt*25){tmpV.copy(st.p).addScaledVector(Fv,-Math.sign(st.press)*.6);VT.copy(st.nVis).multiplyScalar(1.2);spray.emit(tmpV,VT,1.4,.7,.12);}
  }
  spray.update(dt);
}
function burst(p,n,power){for(let i=0;i<n;i++){VT.set((Math.random()-.5)*power*2,Math.random()*power,(Math.random()-.5)*power*2).add(tmpV.copy(st.v).multiplyScalar(.3));spray.emit(p,VT,1.5,1.0,.18);}}
function snapCamera(){camDir.set(Math.sin(st.yaw),0,Math.cos(st.yaw));camera.position.copy(st.p).addScaledVector(camDir,-6.4).add(new V3(0,2.7,0));}

/* ================= 流程 ================= */
const ov=$('ov'),cardStart=$('cardStart'),cardEnd=$('cardEnd');
let running=false,lastInp={steer:0,steerSm:0,lean:0,jump:false,brake:false,grab:false},pick=-1;
const startS=p=>p<0?4:820;
function resetRun(){score.total=0;score.combo=0;st.done=false;st.runTime=0;st.visited.clear();trail.clear();placeAt(startS(pick),pick<0?2:pick);snapCamera();}
function startRun(){
  keys.clear();SND.unlock();
  if(st.done)resetRun();
  running=true;ov.hidden=true;canvas.focus();
}
function finishRun(){
  st.done=true;running=false;
  emit({type:'finish',score:score.total});
  if(score.total>score.best){score.best=score.total;try{localStorage.setItem('edgeline-best',String(score.best));}catch(e){}}
  $('endScore').textContent=score.total.toLocaleString();$('endBest').textContent=score.best.toLocaleString();
  const t=Math.round(st.runTime);$('endTime').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  const vis=[...st.visited].map(i=>PISTES[i].name),left=PISTES.filter((P,i)=>!st.visited.has(i));
  $('endNote').textContent=(vis.length?'这趟滑了 '+vis.join('、')+'。':'')+(left.length?'下次试试 '+left[0].key+' '+left[0].name+'：在 500 m 分岔口往'+(left[0].lane<0?'左':'右')+'拐。':'四条雪道都滑过了，试试在大跳台上加抓板和转体。');
  cardStart.hidden=true;cardEnd.hidden=false;ov.hidden=false;
}
$('goBtn').addEventListener('click',startRun);
$('againBtn').addEventListener('click',startRun);
$('helpBtn').addEventListener('click',()=>{running=false;cardEnd.hidden=true;cardStart.hidden=false;$('goBtn').textContent='继续滑行';ov.hidden=false;});
if(hud.mute)hud.mute.addEventListener('click',toggleMute);
// 开始卡片：选出发雪道（点了就把人放过去）、音乐 / 音效开关
document.querySelectorAll('#pick button').forEach(b=>b.addEventListener('click',()=>{
  pick=+b.dataset.p;document.querySelectorAll('#pick button').forEach(o=>o.classList.toggle('on',o===b));
  score.total=0;score.combo=0;st.done=false;st.runTime=0;st.visited.clear();trail.clear();placeAt(startS(pick),pick<0?2:pick);snapCamera();$('goBtn').textContent='开始滑行';
}));
for(const [id,k] of[['optMusic','music'],['optSfx','sfx']]){const el=$(id);if(!el)continue;if(SND.state[k]===false)el.checked=false;el.addEventListener('change',()=>{SND.unlock();SND.set(k,el.checked);});}
syncMute();

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();spray.mat.uniforms.uPx.value=h*renderer.getPixelRatio()*.62;}
addEventListener('resize',resize);resize();

placeAt(4,2);
snapCamera();

function onFx(e){SND.event(e);if(e.type==='zone')banner(e);}
let acc=0,last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;if(dt>.1)dt=.1;if(dt<0)dt=0;
  if(running){
    const inp=readInput(dt);lastInp=inp;acc+=dt;
    while(acc>=STEP){step(STEP,inp);acc-=STEP;}
  }else{acc=0;}
  drainFx(onFx);
  updateVisual(dt);updateHud(dt);
  SND.update({running,speed:st.v.length(),mode:st.air?'air':st.mode,edge:Math.abs(st.edge),vl:Math.abs(st.vl),air:st.air,charging:st.charging,charge:st.charge,powder:st.pw,zone:st.zone,crashed:st.crashed,done:st.done});
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{last=performance.now();});
window.__edgeline={st,step,H,Hbase,placeAt,KICK,BIG,PISTES,FINISH,laneAt,laneD,halfAt,pisteX:laneAt,surfaceAt,nearestPiste,center,fx,drainFx,score,treeGrid,TREE_CELL,MOG0,MOG1,snapCamera,updateVisual,rig};
})();
