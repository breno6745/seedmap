"use strict";

// COLOQUE_SUA_SEED_AQUI
const DEFAULT_SEED = 123456789n;

const BIOME_NAMES = {
  0:"Oceano",1:"Planície",2:"Deserto",3:"Colinas extremas",4:"Floresta",
  5:"Taiga",6:"Pântano",7:"Rio",11:"Rio congelado",12:"Planície de gelo",
  14:"Ilha de cogumelos",16:"Praia",21:"Selva",24:"Oceano profundo",
  27:"Floresta de bétulas",29:"Floresta escura",30:"Taiga fria",
  35:"Savana",37:"Mesa"
};
const BIOME_COLORS = {
  0:"#245da8",1:"#8db360",2:"#d9c06c",3:"#687868",4:"#397f3b",
  5:"#596d61",6:"#617b4e",7:"#3e72d8",11:"#9bcad8",12:"#d9f0f0",
  14:"#985c98",16:"#e7d68a",21:"#2f8b25",24:"#173b72",
  27:"#71a94f",29:"#315a2b",30:"#779b91",35:"#bdb25f",37:"#b35d3b"
};

const STRUCT = {
  village:{label:"Vila",icon:"V",color:"#fff5a6",spacing:32,separation:8,salt:10387312n,valid:[1,2,35]},
  temple:{label:"Templo",icon:"T",color:"#ffd36b",spacing:32,separation:8,salt:14357617n,valid:[2,21]},
  witch:{label:"Cabana",icon:"W",color:"#b985ff",spacing:32,separation:8,salt:14357620n,valid:[6]},
  monument:{label:"Monumento",icon:"M",color:"#75e8df",spacing:32,separation:5,salt:10387313n,valid:[0,24]}
};

const canvas=document.getElementById("mapCanvas"),ctx=canvas.getContext("2d",{alpha:false});
const seedInput=document.getElementById("seedInput"),statusEl=document.getElementById("status");
const loading=document.getElementById("loading"),cursorEl=document.getElementById("cursor"),biomeEl=document.getElementById("biome");
const worker=new Worker("worker.js");
let seed=DEFAULT_SEED,centerX=0,centerZ=0,pixelsPerBlock=.125;
let dragging=false,dragX=0,dragY=0,dragCX=0,dragCZ=0;
const TILE=256;
const cache=new Map(),pending=new Map();
let requestId=0,frame=0;

const JAVA_MASK=(1n<<48n)-1n,JAVA_MULT=0x5deece66dn,JAVA_ADD=0xbn;
class JavaRandom{
  constructor(s){this.seed=(BigInt.asUintN(64,s)^JAVA_MULT)&JAVA_MASK}
  next(bits){this.seed=(this.seed*JAVA_MULT+JAVA_ADD)&JAVA_MASK;return Number(this.seed>>(48n-BigInt(bits)))}
  nextInt(bound){if((bound&-bound)===bound)return Math.floor(bound*this.next(31)/2147483648);let bits,val;do{bits=this.next(31);val=bits%bound}while(bits-val+(bound-1)<0);return val}
  nextDouble(){return (this.next(26)*67108864+this.next(27))/9007199254740992}
}

function parseSeed(t){t=t.trim();if(/^[+-]?\d+$/.test(t))return BigInt(t);let h=0;for(let i=0;i<t.length;i++)h=(Math.imul(h,31)+t.charCodeAt(i))|0;return BigInt(h)}
function key(tx,tz){return `${seed}:${tx}:${tz}`}
function resize(){const dpr=Math.min(devicePixelRatio||1,2),w=Math.floor(canvas.clientWidth*dpr),h=Math.floor(canvas.clientHeight*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}}
function worldToScreen(x,z){return{x:canvas.clientWidth/2+(x-centerX)*pixelsPerBlock,y:canvas.clientHeight/2+(z-centerZ)*pixelsPerBlock}}
function screenToWorld(x,y){return{x:centerX+(x-canvas.clientWidth/2)/pixelsPerBlock,z:centerZ+(y-canvas.clientHeight/2)/pixelsPerBlock}}
function bounds(){return{l:centerX-canvas.clientWidth/(2*pixelsPerBlock),r:centerX+canvas.clientWidth/(2*pixelsPerBlock),t:centerZ-canvas.clientHeight/(2*pixelsPerBlock),b:centerZ+canvas.clientHeight/(2*pixelsPerBlock)}}
function floorDiv(a,b){return Math.floor(a/b)}

function requestTile(tx,tz){
  const k=key(tx,tz);if(cache.has(k)||pending.has(k))return;
  const id=++requestId;pending.set(k,id);worker.postMessage({id,seed:seed.toString(),tileX:tx,tileZ:tz,size:TILE});
}
worker.onmessage=e=>{
  const d=e.data;if(d.error){console.error(d.error);return}
  const k=key(d.tileX,d.tileZ);pending.delete(k);
  const image=new ImageData(new Uint8ClampedArray(d.pixels),d.w,d.h);
  const off=document.createElement("canvas");off.width=d.w;off.height=d.h;off.getContext("2d").putImageData(image,0,0);
  cache.set(k,{canvas:off,ids:new Uint8Array(d.ids),w:d.w,h:d.h});
  schedule();
};

function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw)}

function draw(){
  resize();const dpr=canvas.width/canvas.clientWidth,b=bounds();
  ctx.fillStyle="#0a1118";ctx.fillRect(0,0,canvas.width,canvas.height);
  const minX=floorDiv(b.l,TILE)-1,maxX=floorDiv(b.r,TILE)+1,minZ=floorDiv(b.t,TILE)-1,maxZ=floorDiv(b.b,TILE)+1;
  let missing=0;
  ctx.imageSmoothingEnabled=false;
  for(let tz=minZ;tz<=maxZ;tz++)for(let tx=minX;tx<=maxX;tx++){
    const k=key(tx,tz),item=cache.get(k);if(!item){requestTile(tx,tz);missing++;continue}
    const p=worldToScreen(tx*TILE,tz*TILE);
    const size=TILE*pixelsPerBlock;
    ctx.drawImage(item.canvas,p.x*dpr,p.y*dpr,size*dpr,size*dpr);
  }
  if(document.getElementById("showGrid").checked)drawGrid(dpr,b);
  if(document.getElementById("showStructures").checked)drawStructures(dpr,b);
  drawOrigin(dpr);
  loading.style.display=missing?"block":"none";
  loading.textContent=missing?`Gerando ${missing} área(s)…`:"";
  statusEl.textContent=`Centro X ${Math.round(centerX)}, Z ${Math.round(centerZ)} • ${pixelsPerBlock<1?`1 px/${(1/pixelsPerBlock).toFixed(1)} blocos`:`${pixelsPerBlock.toFixed(2)} px/bloco`}`;
}

function drawGrid(dpr,b){
  if(16*pixelsPerBlock*dpr<9)return;ctx.save();ctx.strokeStyle="#00000048";ctx.lineWidth=1;
  for(let x=Math.floor(b.l/16)*16;x<=b.r;x+=16){const sx=Math.round(worldToScreen(x,0).x*dpr)+.5;ctx.beginPath();ctx.moveTo(sx,0);ctx.lineTo(sx,canvas.height);ctx.stroke()}
  for(let z=Math.floor(b.t/16)*16;z<=b.b;z+=16){const sy=Math.round(worldToScreen(0,z).y*dpr)+.5;ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(canvas.width,sy);ctx.stroke()}ctx.restore()
}
function drawOrigin(dpr){const p=worldToScreen(0,0),x=p.x*dpr,y=p.y*dpr;ctx.save();ctx.strokeStyle="#ff3030";ctx.lineWidth=2*dpr;ctx.beginPath();ctx.moveTo(x-8*dpr,y);ctx.lineTo(x+8*dpr,y);ctx.moveTo(x,y-8*dpr);ctx.lineTo(x,y+8*dpr);ctx.stroke();ctx.restore()}

function biomeAt(x,z){
  const tx=floorDiv(x,TILE),tz=floorDiv(z,TILE),item=cache.get(key(tx,tz));if(!item)return null;
  const lx=Math.max(0,Math.min(item.w-1,Math.floor((x-tx*TILE)/4)));
  const lz=Math.max(0,Math.min(item.h-1,Math.floor((z-tz*TILE)/4)));
  return item.ids[lz*item.w+lx];
}
function candidate(type,rx,rz){
  const c=STRUCT[type],s=BigInt(rx)*341873128712n+BigInt(rz)*132897987541n+BigInt.asIntN(64,seed)+c.salt,r=new JavaRandom(s),m=c.spacing-c.separation;
  return{x:(rx*c.spacing+r.nextInt(m))*16+8,z:(rz*c.spacing+r.nextInt(m))*16+8,type}
}
function strongholds(){
  const r=new JavaRandom(BigInt.asIntN(64,seed));let angle=r.nextDouble()*Math.PI*2,out=[];
  for(let i=0;i<3;i++){const dist=(1.25+r.nextDouble())*32;out.push({x:Math.round(Math.cos(angle)*dist)*16+8,z:Math.round(Math.sin(angle)*dist)*16+8,type:"stronghold"});angle+=Math.PI*2/3}
  return out;
}
function activeTypes(){return[...document.querySelectorAll(".structure:checked")].map(e=>e.dataset.type)}
function drawStructures(dpr,b){
  const pts=[];
  for(const type of activeTypes()){
    if(type==="stronghold"){for(const p of strongholds())if(p.x>=b.l&&p.x<=b.r&&p.z>=b.t&&p.z<=b.b)pts.push(p);continue}
    const c=STRUCT[type],rs=c.spacing*16;
    for(let rz=floorDiv(b.t,rs)-1;rz<=floorDiv(b.b,rs)+1;rz++)for(let rx=floorDiv(b.l,rs)-1;rx<=floorDiv(b.r,rs)+1;rx++){
      const p=candidate(type,rx,rz),bio=biomeAt(p.x,p.z);
      if(bio!==null&&c.valid.includes(bio)&&p.x>=b.l&&p.x<=b.r&&p.z>=b.t&&p.z<=b.b)pts.push(p);
    }
  }
  ctx.save();ctx.textAlign="center";ctx.textBaseline="middle";ctx.font=`${12*dpr}px system-ui`;
  for(const p of pts){const s=worldToScreen(p.x,p.z),x=s.x*dpr,y=s.y*dpr,d=p.type==="stronghold"?{icon:"S",color:"#ff7777"}:STRUCT[p.type],r=9*dpr;
    ctx.fillStyle="#111d";ctx.beginPath();ctx.arc(x,y,r+2*dpr,0,Math.PI*2);ctx.fill();ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.fillStyle="#111";ctx.fillText(d.icon,x,y+.5*dpr)}
  ctx.restore()
}

function setZoom(v,sx=canvas.clientWidth/2,sy=canvas.clientHeight/2){const before=screenToWorld(sx,sy);pixelsPerBlock=Math.max(1/64,Math.min(4,v));const after=screenToWorld(sx,sy);centerX+=before.x-after.x;centerZ+=before.z-after.z;schedule()}
canvas.addEventListener("pointerdown",e=>{dragging=true;canvas.classList.add("dragging");canvas.setPointerCapture(e.pointerId);dragX=e.clientX;dragY=e.clientY;dragCX=centerX;dragCZ=centerZ});
canvas.addEventListener("pointermove",e=>{const r=canvas.getBoundingClientRect(),w=screenToWorld(e.clientX-r.left,e.clientY-r.top),bx=Math.floor(w.x),bz=Math.floor(w.z),bio=biomeAt(bx,bz);cursorEl.textContent=`X ${bx}, Z ${bz}`;biomeEl.textContent=`Bioma: ${bio===null?"carregando…":(BIOME_NAMES[bio]||bio)}`;if(!dragging)return;centerX=dragCX-(e.clientX-dragX)/pixelsPerBlock;centerZ=dragCZ-(e.clientY-dragY)/pixelsPerBlock;schedule()});
canvas.addEventListener("pointerup",e=>{dragging=false;canvas.classList.remove("dragging");if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)});
canvas.addEventListener("pointercancel",()=>{dragging=false;canvas.classList.remove("dragging")});
canvas.addEventListener("wheel",e=>{e.preventDefault();const r=canvas.getBoundingClientRect();setZoom(pixelsPerBlock*(e.deltaY<0?1.35:1/1.35),e.clientX-r.left,e.clientY-r.top)},{passive:false});
document.getElementById("zoomIn").onclick=()=>setZoom(pixelsPerBlock*1.5);
document.getElementById("zoomOut").onclick=()=>setZoom(pixelsPerBlock/1.5);
document.getElementById("home").onclick=()=>{centerX=centerZ=0;schedule()};
document.getElementById("applySeed").onclick=()=>{try{seed=parseSeed(seedInput.value);cache.clear();pending.clear();centerX=centerZ=0;schedule()}catch{alert("Seed inválida")}};
seedInput.addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("applySeed").click()});
for(const e of document.querySelectorAll("input[type=checkbox]"))e.addEventListener("change",schedule);
window.addEventListener("resize",schedule);

const legend=document.getElementById("legend");
for(const [id,name] of Object.entries(BIOME_NAMES)){const row=document.createElement("div");row.className="legend-row";row.innerHTML=`<span class="swatch" style="background:${BIOME_COLORS[id]}"></span><span>${name}</span>`;legend.appendChild(row)}
seedInput.value=DEFAULT_SEED.toString();schedule();
