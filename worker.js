"use strict";

/*
 * Gerador intermediário em camadas, inspirado no GenLayer antigo.
 * Não é uma cópia literal do código da Mojang.
 */

const BIOMES = {
  OCEAN: 0, PLAINS: 1, DESERT: 2, HILLS: 3, FOREST: 4, TAIGA: 5,
  SWAMP: 6, RIVER: 7, FROZEN_RIVER: 11, ICE: 12, MUSHROOM: 14,
  BEACH: 16, JUNGLE: 21, DEEP_OCEAN: 24, BIRCH: 27, ROOFED: 29,
  COLD_TAIGA: 30, SAVANNA: 35, MESA: 37
};

const COLORS = {
  0:[36,93,168],1:[141,179,96],2:[217,192,108],3:[104,120,104],
  4:[57,127,59],5:[89,109,97],6:[97,123,78],7:[62,114,216],
  11:[155,202,216],12:[217,240,240],14:[152,92,152],16:[231,214,138],
  21:[47,139,37],24:[23,59,114],27:[113,169,79],29:[49,90,43],
  30:[119,155,145],35:[189,178,95],37:[179,93,59]
};

const MASK64 = (1n << 64n) - 1n;
const A = 6364136223846793005n;
const C = 1442695040888963407n;

function u64(v){ return v & MASK64; }
function step(v, add){ return u64(v * u64(v * A + C) + add); }

class LayerRandom {
  constructor(worldSeed, salt){
    let b = BigInt(salt);
    b = step(b,b); b = step(b,b); b = step(b,b);
    let w = BigInt.asUintN(64, worldSeed);
    w = step(w,b); w = step(w,b); w = step(w,b);
    this.world = w;
  }
  at(x,z){
    let s = this.world;
    s = step(s, BigInt(x)); s = step(s, BigInt(z));
    s = step(s, BigInt(x)); s = step(s, BigInt(z));
    return s;
  }
  next(seed,bound){
    let n = Number((seed >> 24n) % BigInt(bound));
    if(n < 0) n += bound;
    return [n, step(seed,this.world)];
  }
}

function idx(x,z,w){ return z*w+x; }

function islandGrid(seed, x0,z0,w,h,scale){
  const rng = new LayerRandom(seed,1n);
  const out = new Int16Array(w*h);
  for(let z=0;z<h;z++) for(let x=0;x<w;x++){
    const wx=x0+x, wz=z0+z;
    let cs=rng.at(wx,wz), n; [n,cs]=rng.next(cs,10);
    out[idx(x,z,w)] = n===0 ? 1 : 0;
    if(wx===0 && wz===0) out[idx(x,z,w)] = 1;
  }
  return out;
}

function zoom(seed, src, sw,sh, salt, fuzzy=false){
  const dw=(sw-1)*2, dh=(sh-1)*2;
  const dst=new Int16Array(dw*dh);
  const rng=new LayerRandom(seed,salt);
  for(let z=0;z<sh-1;z++) for(let x=0;x<sw-1;x++){
    const a=src[idx(x,z,sw)], b=src[idx(x+1,z,sw)], c=src[idx(x,z+1,sw)], d=src[idx(x+1,z+1,sw)];
    const dx=x*2,dz=z*2;
    dst[idx(dx,dz,dw)]=a;
    let cs=rng.at(dx,dz),n;
    [n,cs]=rng.next(cs,2); dst[idx(dx+1,dz,dw)]=n===0?a:b;
    [n,cs]=rng.next(cs,2); dst[idx(dx,dz+1,dw)]=n===0?a:c;
    if(fuzzy){
      [n,cs]=rng.next(cs,4); dst[idx(dx+1,dz+1,dw)]=[a,b,c,d][n];
    }else{
      let v;
      if(b===c && c===d) v=b;
      else if(a===b && a===c) v=a;
      else if(a===b && a===d) v=a;
      else if(a===c && a===d) v=a;
      else if(a===b && c!==d) v=a;
      else if(a===c && b!==d) v=a;
      else if(a===d && b!==c) v=a;
      else if(b===c && a!==d) v=b;
      else if(b===d && a!==c) v=b;
      else if(c===d && a!==b) v=c;
      else { [n,cs]=rng.next(cs,4); v=[a,b,c,d][n]; }
      dst[idx(dx+1,dz+1,dw)]=v;
    }
  }
  return {data:dst,w:dw,h:dh};
}

function addIsland(seed,src,w,h,salt){
  const dst=new Int16Array((w-2)*(h-2)), dw=w-2, dh=h-2;
  const rng=new LayerRandom(seed,salt);
  for(let z=1;z<h-1;z++) for(let x=1;x<w-1;x++){
    const c=src[idx(x,z,w)];
    const nw=src[idx(x-1,z-1,w)], ne=src[idx(x+1,z-1,w)], sw=src[idx(x-1,z+1,w)], se=src[idx(x+1,z+1,w)];
    let v=c, cs=rng.at(x,z),n;
    if(c===0 && (nw||ne||sw||se)){
      const land=[nw,ne,sw,se].filter(a=>a!==0);
      [n,cs]=rng.next(cs,land.length);
      [n,cs]=rng.next(cs,3);
      v=n===0?land[0]:0;
    }else if(c!==0 && (!nw||!ne||!sw||!se)){
      [n,cs]=rng.next(cs,5);
      if(n===0) v=0;
    }
    dst[idx(x-1,z-1,dw)]=v;
  }
  return {data:dst,w:dw,h:dh};
}

function climate(seed,src,w,h){
  const out=new Int16Array(src.length);
  const rng=new LayerRandom(seed,2n);
  for(let z=0;z<h;z++) for(let x=0;x<w;x++){
    const v=src[idx(x,z,w)];
    if(v===0){ out[idx(x,z,w)]=0; continue; }
    let cs=rng.at(x,z),n; [n,cs]=rng.next(cs,6);
    out[idx(x,z,w)] = n===0?4:(n<=1?3:(n<=3?2:1)); // 1 quente,2 temperado,3 frio,4 gelo
  }
  return out;
}

function assignBiomes(seed,cl,w,h){
  const out=new Int16Array(cl.length);
  const rng=new LayerRandom(seed,200n);
  const hot=[BIOMES.DESERT,BIOMES.DESERT,BIOMES.DESERT,BIOMES.SAVANNA,BIOMES.SAVANNA,BIOMES.PLAINS];
  const warm=[BIOMES.FOREST,BIOMES.ROOFED,BIOMES.PLAINS,BIOMES.BIRCH,BIOMES.SWAMP,BIOMES.PLAINS];
  const cool=[BIOMES.FOREST,BIOMES.TAIGA,BIOMES.PLAINS,BIOMES.BIRCH,BIOMES.HILLS];
  const ice=[BIOMES.ICE,BIOMES.ICE,BIOMES.COLD_TAIGA];
  for(let z=0;z<h;z++) for(let x=0;x<w;x++){
    const c=cl[idx(x,z,w)];
    if(c===0){out[idx(x,z,w)]=BIOMES.OCEAN;continue;}
    let list=c===1?hot:c===2?warm:c===3?cool:ice;
    let cs=rng.at(x,z),n; [n,cs]=rng.next(cs,list.length);
    out[idx(x,z,w)]=list[n];
  }
  return out;
}

function addDeepOcean(src,w,h){
  const out=new Int16Array(src);
  for(let z=1;z<h-1;z++) for(let x=1;x<w-1;x++){
    if(src[idx(x,z,w)]!==BIOMES.OCEAN) continue;
    let count=0;
    if(src[idx(x-1,z,w)]===0)count++;
    if(src[idx(x+1,z,w)]===0)count++;
    if(src[idx(x,z-1,w)]===0)count++;
    if(src[idx(x,z+1,w)]===0)count++;
    if(count>3)out[idx(x,z,w)]=BIOMES.DEEP_OCEAN;
  }
  return out;
}

function addHills(seed,src,w,h){
  const out=new Int16Array(src);
  const rng=new LayerRandom(seed,1000n);
  for(let z=1;z<h-1;z++) for(let x=1;x<w-1;x++){
    const p=idx(x,z,w), b=src[p];
    if(b===0||b===24||b===7)continue;
    let cs=rng.at(x,z),n; [n,cs]=rng.next(cs,9);
    if(n!==0)continue;
    if(b===BIOMES.PLAINS)out[p]=BIOMES.FOREST;
    else if(b===BIOMES.DESERT||b===BIOMES.FOREST||b===BIOMES.TAIGA||b===BIOMES.BIRCH)out[p]=BIOMES.HILLS;
    else if(b===BIOMES.SAVANNA)out[p]=BIOMES.MESA;
  }
  return out;
}

function shore(src,w,h){
  const out=new Int16Array(src);
  for(let z=1;z<h-1;z++) for(let x=1;x<w-1;x++){
    const p=idx(x,z,w), b=src[p];
    if(b===0||b===24)continue;
    const ocean = src[idx(x-1,z,w)]===0||src[idx(x+1,z,w)]===0||src[idx(x,z-1,w)]===0||src[idx(x,z+1,w)]===0||
                  src[idx(x-1,z,w)]===24||src[idx(x+1,z,w)]===24||src[idx(x,z-1,w)]===24||src[idx(x,z+1,w)]===24;
    if(ocean) out[p]=BIOMES.BEACH;
  }
  return out;
}

function rivers(seed,w,h){
  const rng=new LayerRandom(seed,100n);
  let base=new Int16Array(w*h);
  for(let z=0;z<h;z++)for(let x=0;x<w;x++){
    let cs=rng.at(x,z),n;[n,cs]=rng.next(cs,299999);
    base[idx(x,z,w)]=n+2;
  }
  for(let i=0;i<4;i++){const r=zoom(seed,base,w,h,1000n+BigInt(i),false);base=r.data;w=r.w;h=r.h;}
  const out=new Int16Array(w*h);
  const norm=v=>v>=2?2+(v&1):v;
  for(let z=1;z<h-1;z++)for(let x=1;x<w-1;x++){
    const c=norm(base[idx(x,z,w)]);
    const n=norm(base[idx(x,z-1,w)]),s=norm(base[idx(x,z+1,w)]),e=norm(base[idx(x+1,z,w)]),ww=norm(base[idx(x-1,z,w)]);
    out[idx(x,z,w)]=(c===n&&c===s&&c===e&&c===ww)?-1:BIOMES.RIVER;
  }
  return {data:out,w,h};
}

function resizeNearest(src,sw,sh,dw,dh){
  const out=new Int16Array(dw*dh);
  for(let z=0;z<dh;z++){const sz=Math.min(sh-1,Math.floor(z*sh/dh));for(let x=0;x<dw;x++){const sx=Math.min(sw-1,Math.floor(x*sw/dw));out[idx(x,z,dw)]=src[idx(sx,sz,sw)];}}
  return out;
}

function generateTile(seed,tileX,tileZ,size=256){
  const cells=size/4;
  // padding amplo para operações de vizinhança
  let w=12,h=12;
  const coarseX=Math.floor(tileX*size/64)-4;
  const coarseZ=Math.floor(tileZ*size/64)-4;
  let data=islandGrid(seed,coarseX,coarseZ,w,h,64);
  let r=zoom(seed,data,w,h,2000n,true);data=r.data;w=r.w;h=r.h;
  r=addIsland(seed,data,w,h,1n);data=r.data;w=r.w;h=r.h;
  r=zoom(seed,data,w,h,2001n,false);data=r.data;w=r.w;h=r.h;
  r=addIsland(seed,data,w,h,2n);data=r.data;w=r.w;h=r.h;
  r=addIsland(seed,data,w,h,50n);data=r.data;w=r.w;h=r.h;
  data=climate(seed,data,w,h);
  data=assignBiomes(seed,data,w,h);
  data=addDeepOcean(data,w,h);
  for(let i=0;i<3;i++){r=zoom(seed,data,w,h,3000n+BigInt(i),false);data=r.data;w=r.w;h=r.h;}
  data=addHills(seed,data,w,h);
  data=shore(data,w,h);

  const targetW=cells+8,targetH=cells+8;
  data=resizeNearest(data,w,h,targetW,targetH);w=targetW;h=targetH;
  const river=rivers(seed,8,8);
  const riverMap=resizeNearest(river.data,river.w,river.h,w,h);

  for(let z=0;z<h;z++)for(let x=0;x<w;x++){
    const p=idx(x,z,w), b=data[p], rv=riverMap[p];
    if(rv===BIOMES.RIVER && b!==BIOMES.OCEAN && b!==BIOMES.DEEP_OCEAN && b!==BIOMES.BEACH){
      data[p]=b===BIOMES.ICE?BIOMES.FROZEN_RIVER:BIOMES.RIVER;
    }
  }

  const outW=cells,outH=cells;
  const pixels=new Uint8ClampedArray(outW*outH*4);
  const ids=new Uint8Array(outW*outH);
  for(let z=0;z<outH;z++)for(let x=0;x<outW;x++){
    const b=data[idx(x+4,z+4,w)], col=COLORS[b]||COLORS[1], p=(z*outW+x)*4;
    pixels[p]=col[0];pixels[p+1]=col[1];pixels[p+2]=col[2];pixels[p+3]=255;ids[z*outW+x]=b;
  }
  return {pixels,ids,w:outW,h:outH};
}

self.onmessage=e=>{
  const {id,seed,tileX,tileZ,size}=e.data;
  try{
    const result=generateTile(BigInt(seed),tileX,tileZ,size);
    self.postMessage({id,tileX,tileZ,...result},[result.pixels.buffer,result.ids.buffer]);
  }catch(error){
    self.postMessage({id,error:String(error && error.stack || error)});
  }
};
