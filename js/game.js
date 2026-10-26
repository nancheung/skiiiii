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

/* ================= 雪道几何：下坡方向为 -z，s = 沿雪道距离 ================= */
const COURSE=1500;
const center=s=>20*Math.sin(s/170)+7*Math.sin(s/63+0.7);
const centerD=s=>20/170*Math.cos(s/170)+7/63*Math.cos(s/63+0.7);
const D0=3*Math.sin(1.3);
const drop=s=>0.26*s+7*Math.sin(s/95+Math.PI)+3*Math.sin(s/41+1.3)-D0;
const KU=[0,-8,8,0,-8,8,0];
const KICK=[];for(let i=0,s=170;s<COURSE-150;s+=175,i++)KICK.push({s,u:KU[i%KU.length]});
const KH=2.2; // 跳台唇口高度（7 米助滑、16 米着陆坡）

function H(x,z){
  const s=-z, xc=x-center(s);
  let h=-drop(s);
  const a=Math.abs(xc)-24; if(a>0)h+=a*(0.2+0.03*a);
  h+=0.18*Math.sin(x*0.19+s*0.045)*Math.sin(s*0.11+x*0.05);
  for(let i=0;i<KICK.length;i++){
    const k=KICK[i], ds=s-k.s;
    if(ds>-8&&ds<17){
      const w=1-smooth(4.5,7.5,Math.abs(xc-k.u));
      if(w>0){let add;if(ds<0){const t=Math.max(0,(ds+7)/7);add=KH*t*t;}else add=KH*(1-smooth(0,16,ds));h+=add*w;}
    }
  }
  return h;
}
function normalAt(x,z,out){const e=0.06;out.set(-(H(x+e,z)-H(x-e,z))/(2*e),1,-(H(x,z+e)-H(x,z-e))/(2*e));return out.normalize();}
function basis(yaw,n,F,T){F.set(Math.sin(yaw),0,Math.cos(yaw));F.addScaledVector(n,-F.dot(n)).normalize();T.crossVectors(F,n);}

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
scene.fog=new T3.Fog(HORIZON.clone().convertSRGBToLinear(),70,430);
renderer.setClearColor(HORIZON);
const camera=new T3.PerspectiveCamera(62,1,0.1,2600);

const hemi=new T3.HemisphereLight(col('#d4e5ff'),col('#8c9bb0'),0.62);scene.add(hemi);
const sun=new T3.DirectionalLight(col('#fff2df'),1.05);
sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);
Object.assign(sun.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:1,far:90});
sun.shadow.bias=-0.0006;sun.shadow.normalBias=0.03;
scene.add(sun);scene.add(sun.target);
const SUN_OFF=new V3(-24,26,6);

// 天空
const sky=new T3.Mesh(new T3.SphereGeometry(1800,32,16),new T3.ShaderMaterial({
  side:T3.BackSide,depthWrite:false,fog:false,
  uniforms:{uSun:{value:SUN_OFF.clone().normalize()}},
  vertexShader:'varying vec3 vW;void main(){vW=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform vec3 uSun;varying vec3 vW;void main(){float h=vW.y;vec3 top=vec3(.27,.5,.83);vec3 hor=vec3(.86,.91,.96);vec3 c=mix(hor,top,smoothstep(-.02,.42,h));float s=max(dot(vW,uSun),0.);c+=vec3(1.,.93,.8)*(pow(s,600.)*1.2+pow(s,8.)*.12);gl_FragColor=vec4(c,1.);}'
}));
sky.renderOrder=-2;scene.add(sky);

// 远山
const mountains=(function(){
  const r=rng(7),N=72,pos=[],cl=[],R=1150;
  const base=[lin(.62),lin(.70),lin(.82)],top=[lin(.96),lin(.97),lin(1)];
  for(let i=0;i<N;i++){
    const a0=i/N*Math.PI*2,a1=(i+1.6)/N*Math.PI*2,am=(a0+a1)/2;const hp=90+r()*260;
    const P=[[Math.cos(a0)*R,-260,Math.sin(a0)*R],[Math.cos(a1)*R,-260,Math.sin(a1)*R],[Math.cos(am)*R*.985,hp,Math.sin(am)*R*.985]];
    P.forEach((p,j)=>{pos.push(...p);const c=j<2?base:top;cl.push(...c);});
  }
  const g=new T3.BufferGeometry();g.setAttribute('position',new T3.Float32BufferAttribute(pos,3));g.setAttribute('color',new T3.Float32BufferAttribute(cl,3));
  const m=new T3.Mesh(g,new T3.MeshBasicMaterial({vertexColors:true,fog:false,side:T3.DoubleSide}));m.renderOrder=-1;scene.add(m);return m;
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

// 地形：沿雪道走向的曲线网格，按 100 米分块方便视锥剔除
(function buildTerrain(){
  const NU=97,UW=150,S0=-30,S1=COURSE+70,rows=S1-S0,CH=100;
  const mat=new T3.MeshStandardMaterial({vertexColors:true,roughness:.93,metalness:0,normalMap:makeCorduroy(),normalScale:new T3.Vector2(.5,.5)});
  const on=[lin(.94),lin(.96),lin(.99)],off=[lin(.86),lin(.9),lin(.97)];
  for(let r0=0;r0<rows;r0+=CH){
    const r1=Math.min(rows,r0+CH),nr=r1-r0+1;
    const pos=new Float32Array(nr*NU*3),uv=new Float32Array(nr*NU*2),cl=new Float32Array(nr*NU*3),idx=new Uint32Array((nr-1)*(NU-1)*6);
    for(let j=0;j<nr;j++){const s=S0+r0+j,c=center(s);
      for(let i=0;i<NU;i++){const u=-UW/2+i*UW/(NU-1),x=c+u,z=-s,k=j*NU+i;
        pos[k*3]=x;pos[k*3+1]=H(x,z);pos[k*3+2]=z;uv[k*2]=u/2.2;uv[k*2+1]=s/2.2;
        const t=smooth(23,32,Math.abs(u));for(let q=0;q<3;q++)cl[k*3+q]=on[q]+(off[q]-on[q])*t;}}
    let p=0;for(let j=0;j<nr-1;j++)for(let i=0;i<NU-1;i++){const a=j*NU+i,b=a+1,c2=a+NU,d=c2+1;idx[p++]=a;idx[p++]=b;idx[p++]=c2;idx[p++]=b;idx[p++]=d;idx[p++]=c2;}
    const g=new T3.BufferGeometry();g.setAttribute('position',new T3.BufferAttribute(pos,3));g.setAttribute('uv',new T3.BufferAttribute(uv,2));g.setAttribute('color',new T3.BufferAttribute(cl,3));g.setIndex(new T3.BufferAttribute(idx,1));
    g.computeVertexNormals();g.computeBoundingSphere();
    const m=new T3.Mesh(g,mat);m.receiveShadow=true;scene.add(m);
  }
})();

// 树、雪道边界杆、跳台唇口染色线
(function buildProps(){
  const r=rng(11),list=[];
  for(let s=-25;s<COURSE+60;s+=2.2+r()*3){for(const side of[-1,1]){if(r()<.55){const u=side*(29+r()*42);list.push([center(s)+u,-s,.65+r()*.8,r()*6.28]);}}}
  const foliage=new T3.ConeGeometry(1.35,4.4,7);foliage.translate(0,2.6,0);
  const cap=new T3.ConeGeometry(.9,2.1,7);cap.translate(0,4.1,0);
  const trunk=new T3.CylinderGeometry(.16,.2,1,5);trunk.translate(0,.4,0);
  const mF=new T3.InstancedMesh(foliage,new T3.MeshStandardMaterial({color:col('#2c4636'),roughness:.9}),list.length);
  const mC=new T3.InstancedMesh(cap,new T3.MeshStandardMaterial({color:col('#eef3f8'),roughness:.85}),list.length);
  const mT=new T3.InstancedMesh(trunk,new T3.MeshStandardMaterial({color:col('#4a3a2e'),roughness:.9}),list.length);
  const M=new T3.Matrix4(),Q=new T3.Quaternion(),S=new V3(),P=new V3(),Y=new V3(0,1,0);
  list.forEach((t,i)=>{P.set(t[0],H(t[0],t[1])-.15,t[1]);Q.setFromAxisAngle(Y,t[3]);S.set(t[2],t[2]*(.9+r()*.3),t[2]);M.compose(P,Q,S);mF.setMatrixAt(i,M);mC.setMatrixAt(i,M);mT.setMatrixAt(i,M);});
  [mF,mC,mT].forEach(m=>{m.castShadow=false;m.receiveShadow=false;scene.add(m);});
  // 边界杆：每 20 米一根，橙黑相间
  const poles=[];for(let s=10;s<COURSE;s+=20){poles.push([center(s)-25.5,-s],[center(s)+25.5,-s]);}
  const pg=new T3.CylinderGeometry(.035,.035,1.8,6);pg.translate(0,.9,0);
  const mp=new T3.InstancedMesh(pg,new T3.MeshStandardMaterial({color:col('#ff7a1a'),roughness:.5}),poles.length);
  poles.forEach((p,i)=>{P.set(p[0],H(p[0],p[1]),p[1]);M.makeTranslation(P.x,P.y,P.z);mp.setMatrixAt(i,M);});scene.add(mp);
  // 跳台唇口与侧边的蓝色标线
  const lipMat=new T3.MeshBasicMaterial({color:col('#1f6dff')});
  KICK.forEach(k=>{const s=k.s-.05,x=center(s)+k.u,z=-s;const b=new T3.Mesh(new T3.BoxGeometry(9,.04,.16),lipMat);b.position.set(x,H(x,z)+.02,z);b.rotation.y=-Math.atan(centerD(s));scene.add(b);
    for(const sd of[-1,1]){const fx=x+sd*5.2,fz=-(k.s-12);const f=new T3.Mesh(new T3.CylinderGeometry(.04,.04,1.3,6),new T3.MeshStandardMaterial({color:col('#1f6dff')}));f.position.set(fx,H(fx,fz)+.65,fz);scene.add(f);}
  });
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
function poseRider(o){
  const P=rig.P,c=o.crouch;
  pv.hip.set(o.lean*.15,.98-.42*c,-.03-.05*c);
  if(o.grab)pv.hip.y=.5;
  pv.hF.copy(pv.hip).x+=.1;pv.hR.copy(pv.hip).x-=.1;
  ik(pv.hF,pv.aF,.46,.46,pv.hint.set(.3,0,1),pv.kF,pv.eF);
  ik(pv.hR,pv.aR,.46,.46,pv.hint.set(-.3,0,1),pv.kR,pv.eR);
  setLimb(P.thF,pv.hF,pv.kF);setLimb(P.shF,pv.kF,pv.aF);setLimb(P.thR,pv.hR,pv.kR);setLimb(P.shR,pv.kR,pv.aR);
  P.knF.position.copy(pv.kF);P.knR.position.copy(pv.kR);P.hip.position.copy(pv.hip);
  let fz=.2+.32*c;if(o.grab==='Indy'||o.grab==='Melon')fz=.9;
  pv.dir.set(o.lean*.22,1,o.grab==='Melon'?-.2:fz);if(o.grab==='Melon')pv.dir.set(0,.9,.55);pv.dir.normalize();
  pv.neck.copy(pv.hip).addScaledVector(pv.dir,.56);
  setLimb(P.torso,pv.hip,pv.neck);P.chest.position.copy(pv.hip).addScaledVector(pv.dir,.42);
  const tw=o.twist;pv.ax.set(Math.cos(tw),0,-Math.sin(tw));
  pv.shC.copy(pv.neck).addScaledVector(pv.dir,-.06);
  pv.sF.copy(pv.shC).addScaledVector(pv.ax,.19);pv.sR.copy(pv.shC).addScaledVector(pv.ax,-.19);
  const sp=o.spread;
  pv.tF.copy(pv.sF).addScaledVector(pv.ax,.18+.2*sp).add(pv.tmp.set(0,-.38+.2*sp,.12));
  pv.tR.copy(pv.sR).addScaledVector(pv.ax,-.16-.2*sp).add(pv.tmp.set(0,-.4+.2*sp,.06));
  if(o.grab==='Indy')pv.tR.set(-.04,.07,.15);
  else if(o.grab==='Melon')pv.tF.set(.04,.07,-.15);
  else if(o.grab==='Nose Grab')pv.tF.set(.66,.08,0);
  else if(o.grab==='Tail Grab')pv.tR.set(-.66,.08,0);
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
  const N=700,pos=new Float32Array(N*3),vel=new Float32Array(N*3),life=new Float32Array(N),maxl=new Float32Array(N),al=new Float32Array(N),sz=new Float32Array(N),base=new Float32Array(N);
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
const st={p:new V3(),v:new V3(),yaw:Math.PI,edge:0,press:0,air:false,airT:0,spin:0,airYaw:0,take:null,charging:false,charge:0,windup:0,noseLoad:false,
  grabT:0,grabName:null,grabbing:false,butterT:0,butterYaw:0,butterSide:0,butterFwd:1,deepT:0,crashed:false,crashT:0,crashRoll:0,crashSide:1,
  mode:'flat',vf:0,vl:0,speed:0,fwd:1,grip:false,butter:false,nVis:new V3(0,1,0),s:0,time:0,runTime:0,done:false};
const N0=new V3(),N1=new V3(),F0=new V3(),T0=new V3(),U0=new V3(),LEFT=new V3(),GT=new V3(),TIP=new V3(),VT=new V3();
const score={total:0,best:0,combo:0,lastT:-99};
try{score.best=+(localStorage.getItem('edgeline-best')||0);}catch(e){}

function placeAt(s){
  for(const k of KICK){if(s>k.s-10&&s<k.s+17)s=k.s+18;}
  const x=center(s),z=-s;st.p.set(x,H(x,z),z);st.v.set(0,0,0);
  st.yaw=Math.atan2(centerD(s),-1);
  Object.assign(st,{edge:0,press:0,air:false,airT:0,spin:0,airYaw:0,charging:false,charge:0,windup:0,grabT:0,grabName:null,grabbing:false,butterT:0,butterYaw:0,deepT:0,crashed:false,crashT:0,crashRoll:0,mode:'flat'});
  normalAt(st.p.x,st.p.z,st.nVis);trail.breakStroke();
}
function crash(reason){
  if(st.crashed)return;
  st.crashed=true;st.crashT=2.1;st.crashRoll=0;st.crashSide=st.edge>=0?1:-1;st.air=false;st.charging=false;st.charge=0;
  score.combo=0;st.v.multiplyScalar(.7);trail.breakStroke();
  burst(st.p,22,3);
  popup('摔倒了',reason,'',true);
}
function award(name,pts,sub,sketchy){
  if(score.lastT>st.time-3.5)score.combo++;else score.combo=1;
  score.lastT=st.time;
  const mult=1+.25*(score.combo-1);let got=Math.round(pts*mult*(sketchy?.5:1));
  score.total+=got;
  popup(name,'+'+got.toLocaleString()+(score.combo>1?'   连招 ×'+mult.toFixed(2):''),sub||'',false);
  if(sketchy)score.combo=0;
}

function step(dt,inp){
  st.time+=dt;
  if(st.done)return;
  st.runTime+=dt;
  if(st.crashed){crashStep(dt);return;}
  if(st.air)airStep(dt,inp);else groundStep(dt,inp);
  st.s=-st.p.z;
  if(st.s>COURSE-25&&!st.air&&!st.crashed)finishRun();
  const xc=st.p.x-center(st.s);
  if(Math.abs(xc)>70)placeAt(st.s);
}

function groundStep(dt,inp){
  const n=normalAt(st.p.x,st.p.z,N0);
  basis(st.yaw,n,F0,T0);
  const vf0=st.v.dot(F0),vl0=st.v.dot(T0),sp=st.v.length();
  const fwd=vf0>=0?1:-1;st.fwd=fwd;
  if(sp>.6)U0.copy(st.v).normalize();else U0.copy(F0).multiplyScalar(fwd);
  LEFT.crossVectors(n,U0);
  const sideSign=T0.dot(LEFT)>=0?1:-1;   // 脚尖一侧是否在行进方向左边

  // 压板（物理坐标：+ 为板头），W 压的是行进方向的前端
  const refFwd=st.butterT>0?st.butterFwd:fwd; // 平花转动过程中保持「前端」的参照不变
  st.press+=(inp.lean*refFwd-st.press)*Math.min(1,dt*9);
  const butter=Math.abs(st.press)>.62&&!inp.brake;
  st.butter=butter;

  // 蓄力
  if(inp.jump){
    if(!st.charging){st.charging=true;st.charge=0;st.windup=0;}
    st.charge=Math.min(1,st.charge+dt/.45);
    st.windup=clamp(st.windup+inp.steer*dt*3.2,-1,1);
    st.noseLoad=inp.lean>.35;
  }

  // 目标立刃角与偏航
  let eT=0,yawRate=0;
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
  }
  st.edge+=(eT-st.edge)*Math.min(1,dt*7);
  const absE=Math.abs(st.edge);

  const slip=Math.atan2(Math.abs(vl0),Math.abs(vf0)+.05);
  const correctSide=Math.abs(vl0)<.8||Math.sign(st.edge)===-Math.sign(vl0);
  const grip=!butter&&!inp.brake&&absE>9*DEG&&slip<(7*DEG+absE*.4)&&correctSide;
  st.grip=grip;
  if(grip){
    // 转弯半径：侧切半径 × cos(立刃角)，并受立刃角能承受的向心加速度限制
    const R=Math.max(RSC*Math.cos(absE),(sp*sp)/(G*Math.tan(absE)*1.1));
    yawRate+=-Math.sign(st.edge)*vf0/R*smooth(9*DEG,16*DEG,absE);
  }else if(!inp.brake&&!butter){
    yawRate+=inp.steer*fwd*2.4*(1-.6*smooth(2,14,sp));
    if(sp>2.5){ // 板自然回正到行进方向（正脚或反脚）
      const au=Math.atan2(U0.x,U0.z);const d1=wrapPi(au-st.yaw),d2=wrapPi(au+Math.PI-st.yaw);const d=Math.abs(d1)<Math.abs(d2)?d1:d2;
      yawRate+=d*2.6*(1-Math.abs(inp.steer)*.7);
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

  // 吃刃：下坡那条刃（滑动方向一侧）被压进雪里
  if(!butter&&absE>14*DEG&&Math.sign(st.edge)===Math.sign(vl)&&Math.abs(vl)>3.2){crash('吃刃：立的是下坡那条刃');return;}

  if(grip){
    const spd=Math.hypot(vf,vl);vl*=Math.exp(-28*dt);vf=(vf>=0?1:-1)*Math.sqrt(Math.max(0,spd*spd-vl*vl));
    st.mode='carve';
  }else{
    let mu=butter?.24:.05+1.45*Math.sin(absE);if(inp.brake)mu+=.12;
    const d=mu*gn*dt;vl=Math.abs(vl)<=d?0:vl-Math.sign(vl)*d;
    st.mode=butter?'butter':(Math.abs(vl)>1.0?'skid':'flat');
  }
  const fr=(.04+.03*Math.sin(absE))*gn+DRAG*vf*vf;
  vf=Math.abs(vf)<=fr*dt?0:vf-Math.sign(vf)*fr*dt;
  st.vf=vf;st.vl=vl;
  st.v.copy(F0).multiplyScalar(vf).addScaledVector(T0,vl).addScaledVector(n,vn);

  // 深刻滑
  if(st.mode==='carve'&&absE>38*DEG&&sp>9)st.deepT+=dt;
  else{if(st.deepT>1.4)award('Deep Carve',Math.round(90+st.deepT*60),'深刻滑',false);st.deepT=0;}

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
    if(st.charging){st.charging=false;st.v.addScaledVector(N1,1.1+1.6*st.charge);beginAir(st.noseLoad?'Nollie':'Ollie',fwd);st.spin=st.windup*4.2;st.charge=0;}
    else beginAir('Air',fwd);
  }else{st.p.y=h;st.v.addScaledVector(N1,-vout);}
}
function pop(n,fwd,strength){
  st.v.addScaledVector(n,strength);
  beginAir(st.noseLoad?'Nollie':'Ollie',fwd);
  st.spin=st.windup*4.2;st.charge=0;
  st.p.addScaledVector(n,.03);
  burst(st.p,10,1.6);
}
function beginAir(type,fwd){
  st.air=true;st.airT=0;st.airYaw=0;st.grabName=null;st.grabT=0;
  st.take={type,sw:fwd<0,fwd};
  if(st.butterT>0)finishButter();
  if(st.deepT>1.4)award('Deep Carve',Math.round(90+st.deepT*60),'深刻滑',false);st.deepT=0;
  trail.breakStroke();st.mode='air';
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
  st.air=false;const spin=st.spin;st.spin=0;st.grabbing=false;
  if(real){
    if(inp.grab)return crash('落地时还抓着板');
    if(mis>40*DEG)return crash('落地时板是横着的（差 '+Math.round(mis/DEG)+'°）');
    if(vn<-12.5)return crash('落地太重，冲击 '+(-vn).toFixed(1)+' m/s');
  }
  const absorb=clamp(-vn*.025,0,.3);st.v.copy(VT).multiplyScalar(1-absorb);
  const sketchy=real&&mis>18*DEG;if(sketchy)st.v.multiplyScalar(.8);
  burst(st.p,real?18:5,real?2.4:1);
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
  if(st.crashT<=0)placeAt(-st.p.z+2);
}

/* ================= 输入 ================= */
const keys=new Set();
const PREVENT=new Set(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
addEventListener('keydown',e=>{
  if(PREVENT.has(e.code))e.preventDefault();
  keys.add(e.code);
  if(e.code==='KeyR'&&running&&!st.done)placeAt(st.s);
  if((e.code==='Enter'||e.code==='Space')&&!running){e.preventDefault();startRun();}
});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>keys.clear());
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
const hud={spd:$('spd'),mode:$('mode'),stance:$('stance'),edgeVal:$('edgeVal'),heel:$('edgeHeel'),toe:$('edgeToe'),piste:$('piste'),slope:$('slope'),score:$('score'),best:$('best'),prog:$('prog'),dist:$('dist'),charge:$('charge'),chargeI:document.querySelector('#charge i'),bJump:$('bJump')};
const trickEl=$('trick');
function popup(name,pts,sub,bad){
  $('tName').textContent=name;$('tPts').textContent=pts;$('tSub').textContent=sub;
  trickEl.classList.toggle('bad',!!bad);trickEl.classList.remove('show');void trickEl.offsetWidth;trickEl.classList.add('show');
}
const MODE={carve:['刻滑 CARVE','on'],skid:['推坡 SKID',''],flat:['平板 FLAT',''],butter:['平花 BUTTER','on'],air:['滞空 AIR','air'],crash:['摔倒','bad']};
let hudT=0;
function updateHud(dt){
  hudT+=dt;if(hudT<1/15)return;hudT=0;
  const sp=st.v.length();hud.spd.textContent=Math.round(sp*3.6);
  const m=MODE[st.air?'air':st.mode]||MODE.flat;
  if(hud.mode.textContent!==m[0]){hud.mode.textContent=m[0];hud.mode.className='chip'+(m[1]?' '+m[1]:'');}
  hud.stance.textContent=st.fwd>0?'REG':'SWITCH';
  const e=st.edge/DEG,ae=Math.abs(e);
  hud.edgeVal.textContent=Math.round(ae)+'°';hud.edgeVal.style.color=ae<3?'':(e>0?'var(--toe)':'var(--heel)');
  hud.toe.style.width=(e>0?ae/52*50:0)+'%';hud.heel.style.width=(e<0?ae/52*50:0)+'%';
  normalAt(st.p.x,st.p.z,N1);const ang=Math.acos(clamp(N1.y,-1,1))/DEG,pct=Math.tan(ang*DEG)*100;
  const cls=pct<12?['#2e9e5b','绿道']:pct<25?['#2f6fe0','蓝道']:pct<40?['#e0383e','红道']:['#111','黑道'];
  hud.piste.style.background=cls[0];hud.slope.textContent=`${cls[1]} · ${ang.toFixed(0)}° / ${pct.toFixed(0)}%`;
  hud.score.textContent=score.total.toLocaleString();hud.best.textContent='最佳 '+Math.max(score.best,score.total).toLocaleString();
  const s=clamp(st.s,0,COURSE);hud.prog.style.width=(s/COURSE*100)+'%';
  let next=KICK.find(k=>k.s>s+2);hud.dist.textContent=next?`下个跳台 ${Math.round(next.s-s)} m`:`${Math.round(s)} / ${COURSE} m`;
  const c=st.charging?st.charge:0;hud.charge.classList.toggle('on',st.charging);hud.chargeI.style.width=(c*100)+'%';hud.bJump.style.setProperty('--c',c.toFixed(3));
}

/* ================= 镜头与可视化 ================= */
const camDir=new V3(0,0,-1),camTarget=new V3(),lookAt=new V3(),tmpV=new V3(),Fv=new V3(),Tv=new V3(),Mb=new T3.Matrix4(),Qb=new T3.Quaternion(),Qr=new T3.Quaternion();
let fov=62,crouchV=.25,twistV=0,spreadV=0;
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
  rig.frame.position.copy(st.p).addScaledVector(st.nVis,Math.sin(Math.abs(roll))*.13+.005);
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
  poseRider({crouch:crouchV,lean:st.press,twist:twistV,spread:spreadV,grab:st.air&&st.grabbing?(st.grabName||grabNameFor(lastInp)):null,look:st.fwd});
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
  sky.position.copy(camera.position);mountains.position.set(camera.position.x,camera.position.y-40,camera.position.z);
  // 雪痕与雪雾
  if(running&&!st.air&&!st.crashed&&!st.done){
    const lp=trail.lastPos();
    if(!lp||lp.distanceToSquared(st.p)>.09){
      const ae2=Math.abs(st.edge);let w,a;const c=tmpV.copy(st.p).addScaledVector(Tv,Math.sign(st.edge)*.13*smooth(4*DEG,15*DEG,ae2)).addScaledVector(st.nVis,.02);
      const side=LEFT.crossVectors(st.nVis,sp>.5?VT.copy(st.v).normalize():Fv).normalize();
      if(st.mode==='carve'){w=.07+.05*(1-ae2/EMAX);a=.62;}
      else if(st.mode==='skid'){w=clamp(1.5*Math.abs(Fv.dot(side)),.3,1.45);a=.26;}
      else if(st.mode==='butter'){w=.34;a=.3;}
      else{w=.27;a=.16;}
      if(sp>.4)trail.add(c,side,w,a);
    }
    const ae2=Math.abs(st.edge);
    if(st.mode==='skid'){const n=Math.min(6,Math.abs(st.vl)*1.2*dt*60);for(let i=0;i<n;i++){if(Math.random()<dt*30){tmpV.copy(st.p).addScaledVector(Tv,-Math.sign(st.vl)*.15).addScaledVector(Fv,(Math.random()-.5)*1.4);VT.copy(Tv).multiplyScalar(Math.sign(st.vl)*(1.2+Math.abs(st.vl)*.5)).addScaledVector(st.nVis,1.2+Math.random()*1.6);spray.emit(tmpV,VT,1.2,.9,.16);}}}
    else if(st.mode==='carve'&&sp>8&&ae2>25*DEG){const rate=(ae2-25*DEG)/(27*DEG)*sp*2.2;let n=rate*dt;while(n>0){if(Math.random()<n){tmpV.copy(st.p).addScaledVector(Tv,Math.sign(st.edge)*.14).addScaledVector(Fv,-st.fwd*.5);VT.copy(Tv).multiplyScalar(-Math.sign(st.edge)*2.2).addScaledVector(Fv,st.fwd*sp*.25).addScaledVector(st.nVis,1.4+Math.random()*1.4);spray.emit(tmpV,VT,1,.8,.13);}n-=1;}}
    else if(st.mode==='butter'&&Math.random()<dt*25){tmpV.copy(st.p).addScaledVector(Fv,-Math.sign(st.press)*.6);VT.copy(st.nVis).multiplyScalar(1.2);spray.emit(tmpV,VT,1.4,.7,.12);}
  }
  spray.update(dt);
}
function burst(p,n,power){for(let i=0;i<n;i++){VT.set((Math.random()-.5)*power*2,Math.random()*power,(Math.random()-.5)*power*2).add(tmpV.copy(st.v).multiplyScalar(.3));spray.emit(p,VT,1.5,1.0,.18);}}

/* ================= 流程 ================= */
const ov=$('ov'),cardStart=$('cardStart'),cardEnd=$('cardEnd');
let running=false,lastInp={steer:0,steerSm:0,lean:0,jump:false,brake:false,grab:false};
function startRun(){
  keys.clear();
  if(st.done){score.total=0;score.combo=0;st.done=false;st.runTime=0;trail.clear();placeAt(4);}
  running=true;ov.hidden=true;canvas.focus();
}
function finishRun(){
  st.done=true;running=false;
  if(score.total>score.best){score.best=score.total;try{localStorage.setItem('edgeline-best',String(score.best));}catch(e){}}
  $('endScore').textContent=score.total.toLocaleString();$('endBest').textContent=score.best.toLocaleString();
  const t=Math.round(st.runTime);$('endTime').textContent=Math.floor(t/60)+':'+String(t%60).padStart(2,'0');
  $('endNote').textContent=score.total<800?'试试在跳台前按住起跳蓄力，到唇口松开，空中往一侧拨转体。':'跳台上加抓板（落地前松开）分数更高，连续落地的动作会叠加连招倍率。';
  cardStart.hidden=true;cardEnd.hidden=false;ov.hidden=false;
}
$('goBtn').addEventListener('click',startRun);
$('againBtn').addEventListener('click',startRun);
$('helpBtn').addEventListener('click',()=>{running=false;cardEnd.hidden=true;cardStart.hidden=false;$('goBtn').textContent='继续滑行';ov.hidden=false;});

function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();spray.mat.uniforms.uPx.value=h*renderer.getPixelRatio()*.62;}
addEventListener('resize',resize);resize();

placeAt(4);
camDir.set(Math.sin(st.yaw),0,Math.cos(st.yaw));
camera.position.copy(st.p).addScaledVector(camDir,-6.4).add(new V3(0,2.7,0));

let acc=0,last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  let dt=(now-last)/1000;last=now;if(dt>.1)dt=.1;if(dt<0)dt=0;
  if(running){
    const inp=readInput(dt);lastInp=inp;acc+=dt;
    while(acc>=STEP){step(STEP,inp);acc-=STEP;}
  }else{acc=0;}
  updateVisual(dt);updateHud(dt);
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
document.addEventListener('visibilitychange',()=>{last=performance.now();});
window.__edgeline={st,step,H,placeAt,KICK,center};
})();
