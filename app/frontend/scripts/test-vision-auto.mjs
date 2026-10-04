import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = new Map();
function load(path) {
  const file = resolve(root, path.endsWith('.ts') ? path : path + '.ts');
  if (cache.has(file)) return cache.get(file);
  const mod = {exports:{}};
  const text = ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  new Function('require','module','exports',text)(p=>load(resolve(dirname(file),p)),mod,mod.exports);
  cache.set(file,mod.exports);return mod.exports;
}
const {detectBoard,adjustCalibration} = load('lib/vision/auto-calibration');
const {calibrate,project} = load('lib/vision/engine');
const pi = Math.PI;
const unit = (a,r=1)=>({x:Math.sin(a)*r,y:-Math.cos(a)*r});
const inv = m => {const [a,b,c,d,e,f,g,h,i]=m;const v=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];const det=a*v[0]+b*v[3]+c*v[6];return v.map(x=>x/det);};
export function boardFrame(width=600,height=800,options={}) {
  const cx=options.cx??.5,cy=options.cy??.5,rx=options.rx??.34,ry=options.ry??rx*width/height;
  const theta=options.rotation??0,tx=options.tx??0,ty=options.ty??0;
  const h=[rx*Math.cos(theta)+cx*tx,-rx*Math.sin(theta)+cx*ty,cx,ry*Math.sin(theta)+cy*tx,ry*Math.cos(theta)+cy*ty,cy,tx,ty,1];
  const inverse=inv(h),data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const p=project(inverse,{x:x/width,y:y/height}),r=Math.hypot(p.x,p.y);
    const angle=(Math.atan2(p.x,-p.y)+2*pi)%(2*pi),sector=Math.floor((angle+pi/20)/(pi/10))%20;
    let rgb=[80,75,65];
    if(r<1.25)rgb=[20,20,20];
    if(r<1)rgb=sector%2?[208,198,170]:[44,44,42];
    if(r>=.953&&r<1 || r>=.582&&r<.63) rgb=options.monochrome?[170,40,35]:sector%2?[24,160,80]:[200,38,35];
    if(r<.0935)rgb=[22,160,80];
    if(r<.0374)rgb=[200,38,35];
    if(options.light!==false&&r>1.20&&r<1.25)rgb=[255,20,20];
    if(options.occlude&&x>width*.5&&y<height*.5)rgb=[180,145,115];
    if(options.noise){const n=((x*17+y*23)%17)-8;rgb=rgb.map(v=>Math.max(0,Math.min(255,v+n)));}
    data.set([...rgb,255],(y*width+x)*4);
  }
  return {frame:{width,height,data},h};
}
let count=0;
function test(name,fn){fn();count++;console.log('PASS auto: '+name);}
const cases=[
 ['square',600,600,{}],['portrait',540,960,{}],['landscape',960,540,{rx:.23}],
 ['offset',600,800,{cx:.58,cy:.56,rx:.30}],['ellipse',700,800,{rx:.27,ry:.36}],
 ['rotation',600,800,{rotation:.16}],['perspective',600,800,{tx:.15,ty:-.12}],
 ['moderate colour noise',600,800,{noise:true}],
];
for(const [name,w,h,opts]of cases)test(name+' detects two rings and Bull, not surrounding red light',()=>{
 const {frame,h:expected}=boardFrame(w,h,opts),p=detectBoard(frame),c=p.calibration;
 const target=project(expected,{x:0,y:0});
 assert.ok(Math.hypot(c.anchors[4].x-target.x,c.anchors[4].y-target.y)<.018,JSON.stringify(c.anchors[4]));
 for(let i=0;i<40;i++){
  const point=project(c.boardToImage,unit(i*2*pi/40)),r=project(inv(expected),point);
  assert.ok(Math.abs(Math.hypot(r.x,r.y)-1)<.06,`${name}: radius ${Math.hypot(r.x,r.y)}`);
 }
 assert.equal(p.orientation,'ASSUMED_20_UP');assert.ok(p.ringSupport>=.62);
});
test('empty scene rejects without fabricated anchors',()=>{const {frame}=boardFrame();frame.data.fill(128);assert.throws(()=>detectBoard(frame),/non reconnue/);});
test('uniform red annuli reject (not a dartboard)',()=>assert.throws(()=>detectBoard(boardFrame(600,800,{monochrome:true}).frame)));
test('partial target rejects',()=>assert.throws(()=>detectBoard(boardFrame(600,800,{cx:.05}).frame)));
test('large hand occlusion rejects',()=>assert.throws(()=>detectBoard(boardFrame(600,800,{occlude:true}).frame)));
test('invalid frame rejects',()=>{assert.throws(()=>detectBoard({width:200,height:300,data:new Uint8ClampedArray(10)}));assert.throws(()=>detectBoard({width:0,height:0,data:new Uint8ClampedArray()}));});
const base=calibrate([{x:.5,y:.2},{x:.8,y:.5},{x:.5,y:.8},{x:.2,y:.5},{x:.5,y:.5}]);
for(const [forward,back]of [['LEFT','RIGHT'],['UP','DOWN'],['GROW','SHRINK'],['WIDER','NARROWER'],['TALLER','SHORTER'],['ROTATE_LEFT','ROTATE_RIGHT'],['SECTOR_LEFT','SECTOR_RIGHT'],['TILT_LEFT','TILT_RIGHT'],['TILT_UP','TILT_DOWN']])test(forward+' and inverse preserve points',()=>{
 const snapshot=JSON.stringify(base);const next=adjustCalibration(adjustCalibration(base,forward,600,800),back,600,800);
 for(let i=0;i<5;i++)assert.ok(Math.hypot(next.anchors[i].x-base.anchors[i].x,next.anchors[i].y-base.anchors[i].y)<1e-9);
 assert.equal(JSON.stringify(base),snapshot);
});
test('pixel nudge depends on original non-square dimensions',()=>{const c=adjustCalibration(base,'DOWN',540,960);assert.ok(Math.abs(c.anchors[4].y-.5-1/960)<1e-9);});
test('unknown action and invalid dimensions reject',()=>{assert.throws(()=>adjustCalibration(base,'INVALID',600,800));assert.throws(()=>adjustCalibration(base,'UP',NaN,800));});
const {imageToView} = load('lib/vision/frame-renderer');
const {viewToImage,zoomView} = load('lib/vision/calibration-ui');
for (const zoom of [1,2,4]) test(`one shared coordinate transform at zoom ${zoom}`,()=>{
 const p={x:.35,y:.61},v=zoomView(p,zoom),q=imageToView(p,v),back=viewToImage(v,q.x,q.y);
 assert.ok(Math.hypot(back.x-p.x,back.y-p.y)<1e-12);
});
test('a surrounding red ring without board cannot calibrate',()=>{
 const {frame}=boardFrame();for(let i=0;i<frame.data.length;i+=4){if(frame.data[i]!==255){frame.data[i]=frame.data[i+1]=frame.data[i+2]=70;}}
 assert.throws(()=>detectBoard(frame));
});
test('two candidate targets require recadrage',()=>{
 const a=boardFrame(960,540,{cx:.24,rx:.18}).frame,b=boardFrame(960,540,{cx:.76,rx:.18}).frame;
 for(let y=0;y<540;y++)a.data.set(b.data.slice((y*960+480)*4,(y+1)*960*4),(y*960+480)*4);
 assert.throws(()=>detectBoard(a),/Plusieurs cibles/);
});
console.log(`${count} automatic calibration checks passed (synthetic fixtures, not real-world accuracy).`);
