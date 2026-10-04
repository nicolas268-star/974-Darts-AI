import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import { fixture, identity } from './vision-fixtures.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),cache=new Map();
function load(path){path=resolve(path);if(cache.has(path))return cache.get(path);const m={exports:{}};cache.set(path,m.exports);const js=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;new Function('module','exports','require',js)(m,m.exports,name=>load(resolve(dirname(path),name+'.ts')));return m.exports;}
const v=load(root+'/lib/vision/engine.ts'),s=load(root+'/lib/vision/stabilization.ts'),p=load(root+'/lib/vision/analysis-pipeline.ts'),{AnalysisClient}=load(root+'/lib/vision/analysis-client.ts');
const memoryBefore=process.memoryUsage();
let count=0;const measures=[];
function test(name,fn){if(process.env.VISION_TEST_FILTER&&!name.includes(process.env.VISION_TEST_FILTER))return;fn();count++;console.log('PASS stabilization: '+name);}
function calibration(w,h){const r=Math.min(w,h)*.38;return v.calibrate([{x:.5,y:.5-r/h},{x:.5+r/w,y:.5},{x:.5,y:.5+r/h},{x:.5-r/w,y:.5},{x:.5,y:.5}]);}

function request(a,b,c,reference=a,mask){return {sessionId:'session',referenceId:'ref',captureId:'capture',anchor:a,reference,current:b,referenceMask:mask,calibration:c,threshold:30,enabled:true};}
function reprojection(actual,known,w,h){let max=0;for(const [x,y]of [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){const a=s.transformPoint({x:x*w,y:y*h},actual,w,h),b=s.transformPoint({x:x*w,y:y*h},known,w,h);max=Math.max(max,Math.hypot(a.x-b.x,a.y-b.y));}return max;}
// Camera-like luminance noise over the whole image, independent of sample sites.
function noisy(frame,seed=974,rate=.015){
 const data=frame.data.slice();let state=seed;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return (state+.5)/4294967296;};
 for(let k=0;k<data.length;k+=4){const n=random()<rate?(random()<.5?-65:65):(random()-.5)*4;for(let ch=0;ch<3;ch++)data[k+ch]+=n;}
 return {...frame,data};
}
for(const [nw,nh]of [[540,960],[960,540]])for(const dx of [0,2])for(const dart of [false,true])test(`camera noise ${nw}x${nh}, shift ${dx}, dart ${dart}`,()=>{
 const a=fixture(nw,nh),t={...identity,dx},b=noisy(fixture(nw,nh,t,{darts:dart?[{x:nw*.5,y:nh*.31}]:[]})),c=calibration(nw,nh);
 const out=p.analyzeCapture(request(a,b,c));
 assert.ok(out.stabilization.aligned,JSON.stringify(out.stabilization));
 // Severe sparse noise: <=2px within the detection ROI, plus no false candidate.
 // Clean geometry below retains its tighter 0.65px whole-frame gate.
 for(let i=0;i<64;i++){
  const pt=v.project(c.boardToImage,{x:1.12*Math.cos(i*Math.PI/32),y:1.12*Math.sin(i*Math.PI/32)}),pixel={x:pt.x*nw,y:pt.y*nh};
  const got=s.transformPoint(pixel,out.stabilization.transform,nw,nh),expected=s.transformPoint(pixel,t,nw,nh);
  assert.ok(Math.hypot(got.x-expected.x,got.y-expected.y)<2);
 }
 assert.equal(out.detection.status,dart?'CANDIDATES':'NO_CHANGE',JSON.stringify(out.detection));
 assert.equal(out.detection.boxes.length,dart?1:0);
 if(dart)assert.ok(out.detection.candidates.some(({point})=>Math.hypot((point.x-.5)*nw,(point.y-.31)*nh)<2));
});
test('distributed isolated noise does not reject an empty target',()=>{
 // Regression: V1 discarded 14 whole regions for just 19 scattered point outliers.
 // The noise is seeded over all image pixels, never placed at registration sites.
 const a=fixture(540,960),b=noisy(a,12345,.03),c=calibration(540,960);
 const out=p.analyzeCapture(request(a,b,c));
 assert.ok(out.stabilization.aligned,JSON.stringify(out.stabilization));
 assert.equal(out.detection.status,'NO_CHANGE');assert.equal(out.detection.candidates.length,0);
 assert.ok(out.detection.changedFraction<.03);assert.ok(reprojection(out.stabilization.transform,identity,540,960)<2);
});
for(const [w,h]of [[960,960],[540,960],[960,540]]){
 const a=fixture(w,h),c=calibration(w,h);
 const transforms=[identity,{...identity,dx:2},{...identity,dy:-2},{...identity,dx:5},{...identity,dy:5},{...identity,dx:.65,dy:-.4},{...identity,rotation:.8*Math.PI/180},{...identity,rotation:-1.4*Math.PI/180},{...identity,scale:1.012},{...identity,scale:.987},{dx:4,dy:-3,rotation:1.1*Math.PI/180,scale:1.01}];
 transforms.forEach((t,i)=>test(`${w}x${h} geometry ${i}, motion alone has no candidate`,()=>{
  const out=p.analyzeCapture(request(a,fixture(w,h,t),c));
  assert.notEqual(out.stabilization.state,'REJECTED',JSON.stringify(out.stabilization));
  if(i===0)assert.equal(out.stabilization.state,'IDENTITY');
  const error=reprojection(out.stabilization.transform,t,w,h);assert.ok(error<.65,`reprojection ${error}`);
  assert.equal(out.detection.status,'NO_CHANGE',JSON.stringify(out.detection));assert.equal(out.detection.candidates.length,0);
  measures.push({w,h,test:i,reprojection:error,ms:out.totalMs,bytes:out.stabilization.metrics.allocatedBytes});
 }));
 for(const t of [identity,transforms.at(-1)])test(`${w}x${h} dart survives with/without movement`,()=>{
  const b=fixture(w,h,t,{darts:[{x:w*.5,y:h*.31}]}),out=p.analyzeCapture(request(a,b,c));
  assert.ok(out.stabilization.aligned,out.stabilization.reason);assert.equal(out.detection.status,'CANDIDATES',JSON.stringify(out.detection));assert.ok(out.detection.changedFraction>0);
  assert.ok(out.detection.boxes.length===1); // Extrema remain alternatives, never asserted as certain tip.
 });
}
const w=960,h=540,a=fixture(w,h),c=calibration(w,h);
for(const [name,t,opts]of [
 ['uniform',identity,{flat:true}],['different scene',identity,{scene:2}],['large hand',identity,{hand:true}],['blur',identity,{blur:true}],['saturation',identity,{light:180}],['mirror',identity,{mirror:true}],['sector jump',{...identity,rotation:Math.PI/10},{}],['translation limit',{...identity,dx:13},{}],['rotation limit',{...identity,rotation:3*Math.PI/180},{}],['scale limit',{...identity,scale:1.03},{}]
])test('reject '+name,()=>assert.equal(p.analyzeCapture(request(a,fixture(w,h,t,opts),c)).stabilization.state,'REJECTED',name));
test('uniform reference rejected',()=>assert.equal(s.stabilize(fixture(w,h,identity,{flat:true}),fixture(w,h,identity,{flat:true}),c).state,'REJECTED'));
test('dimensions rejected',()=>assert.equal(p.analyzeCapture(request(a,fixture(540,960),c)).stabilization.state,'REJECTED'));
test('uncomputed rejection diagnostics are null, never measured zero',()=>{
 const out=s.stabilize(a,fixture(540,960),c);
 for(const name of ['errorBefore','errorAfter','improvement','textureRegions','concordantRegions','sectors','validFraction','brightnessShift','sharpnessRatio','saturatedFraction'])assert.equal(out.metrics[name],null,name);
 const noTexture=s.stabilize(fixture(w,h,identity,{flat:true}),fixture(w,h,identity,{flat:true}),c);
 assert.equal(noTexture.metrics.textureRegions,0);assert.equal(noTexture.metrics.validFraction,null);
});
test('small brightness variation once only',()=>{const out=p.analyzeCapture(request(a,fixture(w,h,{...identity,dx:3},{light:12}),c));assert.ok(out.stabilization.aligned,out.stabilization.reason);assert.equal(out.detection.status,'NO_CHANGE');assert.ok(Math.abs(out.detection.brightnessShift-12)<1);});
test('explicit promotion, old darts not detected, fixed anchor rejects cumulative drift',()=>{
 let ref=a,mask;const darts=[];
 for(let i=1;i<=3;i++){
  darts.push({x:w*(.44+i*.04),y:h*.31});
  const raw=fixture(w,h,{...identity,dx:i*2},{darts});const bytes=raw.data.slice();
  const out=p.analyzeCapture(request(a,raw,c,ref,mask));assert.ok(out.stabilization.aligned,out.stabilization.reason);assert.equal(out.detection.boxes.length,1,JSON.stringify({i,transform:out.stabilization.transform,boxes:out.detection.boxes}));assert.ok(p.canPromote(out,'LABELLED',true));assert.ok(!p.canPromote(out,'UNRESOLVED',true));assert.ok(!p.canPromote(out,'FALSE_POSITIVE',true));
  assert.deepEqual(raw.data,bytes);ref=out.stabilization.aligned;mask=out.stabilization.validMask;
  assert.equal(p.analyzeCapture(request(a,raw,c,ref,mask)).detection.status,'NO_CHANGE');
 }
 assert.equal(p.analyzeCapture(request(a,fixture(w,h,{...identity,dx:10},{darts}),c,ref,mask)).stabilization.state,'REJECTED');
});
test('inverse pixel convention in non-square images',()=>{for(const [w,h]of [[540,960],[960,540]])for(const pt of [{x:0,y:0},{x:123,y:333}]){const t={dx:5,dy:-2,rotation:.02,scale:1.01},q=s.transformPoint(s.transformPoint(pt,t,w,h),t,w,h,true);assert.ok(Math.hypot(q.x-pt.x,q.y-pt.y)<1e-9);}});
test('invalid borders masked, insufficient coverage refused',()=>{const b=s.resample(a,{...identity,dx:100});assert.equal(b.validMask[0],0);const out=v.detect(a,b.frame,c,30,new Uint8Array(w*h));assert.equal(out.status,'SCENE_CHANGED');assert.equal(out.candidates.length,0);});
test('partial target occlusion and low-contrast texture rejected',()=>{
 const clipped=fixture(w,h);for(let y=0;y<h;y++)for(let x=0;x<w*.44;x++){const k=(y*w+x)*4;clipped.data[k]=clipped.data[k+1]=clipped.data[k+2]=0;}
 assert.equal(s.stabilize(a,clipped,c).state,'REJECTED');
 const low=fixture(w,h);for(let k=0;k<low.data.length;k+=4)low.data[k]=low.data[k+1]=low.data[k+2]=120+(low.data[k]-120)*.03;
 assert.equal(s.stabilize(low,low,c).state,'REJECTED');
});
test('scaled capture movement bounds and immutable calibration',()=>{
 const a=fixture(480,270),c=calibration(480,270),original=JSON.stringify(c);
 assert.notEqual(s.stabilize(a,fixture(480,270,{...identity,dx:2.5}),c).state,'REJECTED');
 assert.equal(s.stabilize(a,fixture(480,270,{...identity,dx:5}),c).state,'REJECTED');assert.equal(JSON.stringify(c),original);
});
test('valid mask does not manufacture edge candidates',()=>{
 const shifted=s.resample(a,{...identity,dx:7});const recovered=s.resample(shifted.frame,{...identity,dx:-7});
 assert.equal(v.detect(a,recovered.frame,c,30,recovered.validMask,0).status,'NO_CHANGE');
});
test('diagnostic disabled cannot promote',()=>{const out=p.analyzeCapture({...request(a,a,c),enabled:false});assert.equal(out.stabilization.aligned,null);assert.equal(p.canPromote(out,'LABELLED',false),false);});
// Controlled worker doubles test the real client lifecycle, not a duplicated implementation.
let worker;const client=new AnalysisClient(()=>worker={postMessage(){},terminate(){this.terminated=true;},onmessage:null,onerror:null,onmessageerror:null},30);
let pending=client.run(request(a,a,c));assert.equal(client.busy,true);assert.equal((await client.run(request(a,a,c))).stabilization.state,'CANCELLED');const old=worker;client.cancel();assert.equal((await pending).stabilization.state,'CANCELLED');assert.ok(old.terminated);
pending=client.run(request(a,a,c));old.onmessage({data:{result:{...p.cancelled(request(a,a,c)),captureId:'old'}}});assert.equal(client.busy,true);worker.onerror();assert.equal((await pending).stabilization.state,'CANCELLED');
pending=client.run(request(a,a,c));worker.onmessage({data:{result:{...p.cancelled(request(a,a,c)),referenceId:'obsolete'}}});assert.equal(client.busy,true);assert.equal((await pending).stabilization.state,'CANCELLED');assert.equal(client.busy,false);
assert.equal((await new AnalysisClient(()=>{throw Error();}).run(request(a,a,c))).stabilization.state,'CANCELLED');
console.log('PASS lifecycle: one in flight, cancellation, stale response, worker failure, timeout, unavailable worker');
console.log(JSON.stringify({count,measures,memoryBefore,memoryAfter:process.memoryUsage()},null,2));
