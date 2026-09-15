#!/usr/bin/env node
// A CAMERA-RENDERED FILE OPENS AS THE CAMERA MADE IT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/opens-as-shot-walk.mjs [--port=8131]
//
// Reported from the device with two screenshots: the strip of thumbnails looked
// like infrared photographs and the picture above them was a flat purple wash.
//
// `EditParams` defaulted `swapRB: true`, so every photo opened with red and blue
// already exchanged. A raw absorbs that — it arrives unbalanced, gray-world
// balances it, and the swap lands on channels something has pulled apart. A
// CAMERA-RENDERED file has no balance by design (it opens as the camera made it,
// wb [1,1,1]) so the swap ran on the camera's finished rendering with nothing
// before it and no cast correction after: the bare swap, which this app's own
// look table names as flat purple. `makeThumb` never applied it, so the tile was
// right and the photo was wrong. Measured: hue 257 open against 343 in the tile.
//
// THE TILE IS THE WRONG THING TO COMPARE AGAINST, and comparing to it made the
// first version of this walk pass on the broken build. A tile is sometimes the
// camera's own embedded preview and sometimes a render of the live edit; when it
// is the latter it carries the same swap the canvas does, so the two agree and
// the walk learns nothing. The reported screenshots differed only because those
// tiles were previews.
//
// The invariant is the standing ruling instead: a CAMERA-RENDERED file opens as
// the camera made it, measured denoise only. So the canvas at open is compared
// against the FILE'S OWN PIXELS, decoded in the page. A channel swap puts them
// on opposite sides of the wheel, which nothing else at open does.
//
// A raw has no such comparison — it opens gray-world balanced on purpose — so it
// is checked only for the swap state it has always had.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
const PORT=(process.argv.find(a=>a.startsWith("--port="))||"--port=8131").split("=")[1];
const BASE=`http://127.0.0.1:${PORT}`;
const D="/tmp/claude-0/-home-user/2bd37282-d617-5a51-b357-6b20783a5840/scratchpad/real";
const EX="/home/user/Jefferson-Photography-Studio/public/examples";
import { existsSync, readFileSync } from "node:fs";
// TWO FILES, because a lone photo has no strip and the walk then compares
// against nothing and passes. The first run of this did exactly that.
const SET=[[[`${D}/NIR_2821.JPG`,`${D}/NIR_2813.JPG`],"camera JPEG"],
           [[`${EX}/NIR_0063.dng`,`${EX}/NIR_0102.dng`],"raw"]].filter(([fs])=>fs.every(existsSync));
const hue=a=>{const[r,g,b]=a;const mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx-mn<1e-6)return null;
  let h;if(mx===r)h=((g-b)/(mx-mn))%6;else if(mx===g)h=(b-r)/(mx-mn)+2;else h=(r-g)/(mx-mn)+4;
  return ((h*60)%360+360)%360;};
const dHue=(a,b)=>{if(a==null||b==null)return 0;let d=Math.abs(a-b)%360;return d>180?360-d:d;};
let bad=0;const fail=s=>{bad++;console.log("FAIL  "+s);};const ok=s=>console.log("ok    "+s);
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
try{
  const page=await br.newPage({viewport:{width:1000,height:780}});
  for(const [files,label] of SET){
    await page.goto(`${BASE}/ir.html`,{waitUntil:"load"});
    await page.setInputFiles("#file",files);
    await page.waitForFunction(()=>document.getElementById("welcome")?.hidden,null,{timeout:300000});
    // wait for a tile that has actually decoded, not merely for an <img> to exist
    await page.waitForFunction(()=>{
      const t=document.querySelector("#sessionThumbs img");
      return !!t && t.complete && t.naturalWidth > 0;
    },null,{timeout:120000}).catch(()=>{});
    await page.waitForTimeout(2000);
    const r=await page.evaluate(()=>{
      const c=document.querySelector("#view");
      const g=c.getContext("webgl2")||c.getContext("webgl");
      const b=new Uint8Array(c.width*c.height*4);
      g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,b);
      let R=0,G=0,B=0,n=0;
      for(let i=0;i<b.length;i+=4*9){if(b[i+3]===0)continue;R+=b[i];G+=b[i+1];B+=b[i+2];n++;}
      return {canvas:[R/n,G/n,B/n]};
    });
    const hc=hue(r.canvas);
    if(label!=="camera JPEG"){
      const sw=await page.evaluate(()=>document.getElementById("swapBtn")?.getAttribute("aria-pressed"));
      console.log(`  ${label.padEnd(12)} open hue ${String(Math.round(hc)).padStart(3)}  ·  swap ${sw} (unchanged by design)`);
      if(sw!=="true") fail(`${label}: the raw lost the channel swap it has always opened with`);
      else ok(`${label}: raw opens as it always has`);
      continue;
    }
    // the file's own pixels, decoded in the page — "as the camera made it"
    // the bytes are handed in rather than read back off the file input: the app
    // replaces that input on every open (the picker-wedge fix), so its files
    // list is empty by the time this runs.
    const b64=readFileSync(files[0]).toString("base64");
    const src=await page.evaluate(async (b)=>{
      const bin=atob(b); const u=new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
      const bm=await createImageBitmap(new Blob([u],{type:"image/jpeg"}));
      const cv=document.createElement("canvas");cv.width=bm.width;cv.height=bm.height;
      cv.getContext("2d").drawImage(bm,0,0);
      const d=cv.getContext("2d").getImageData(0,0,cv.width,cv.height).data;
      let R=0,G=0,B=0,n=0;
      for(let i=0;i<d.length;i+=4*97){R+=d[i];G+=d[i+1];B+=d[i+2];n++;}
      return [R/n,G/n,B/n];
    }, b64);
    const hs=hue(src),d=dHue(hc,hs);
    console.log(`  ${label.padEnd(12)} open hue ${String(Math.round(hc)).padStart(3)}  ·  the file itself ${String(Math.round(hs)).padStart(3)}  ·  ${Math.round(d)}deg apart`);
    if(d>60) fail(`${label}: opens ${Math.round(d)}deg from the camera's own rendering — a channel swap nobody asked for`);
    else ok(`${label}: opens as the camera made it`);
  }
}finally{await br.close();}
console.log(bad?`\n${bad} failed`:"\npassed");
process.exit(bad?1:0);
