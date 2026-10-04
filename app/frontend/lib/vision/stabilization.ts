import { project, validateFrame, type Calibration, type Frame, type Point } from './engine';
import { IDENTITY, STABILIZATION_VERSION, type Similarity, type Stabilization, type StabilizationMetrics } from './stabilization-types';

/** Original capture pixels, centred on ((width-1)/2,(height-1)/2). Rotation in radians. */
export function transformPoint(p: Point, t: Similarity, width: number, height: number, inverse = false): Point {
  const cx = (width - 1) / 2, cy = (height - 1) / 2, c = Math.cos(t.rotation), s = Math.sin(t.rotation);
  const x = p.x - cx - (inverse ? t.dx : 0), y = p.y - cy - (inverse ? t.dy : 0);
  return inverse ? { x: cx + (c*x+s*y)/t.scale, y: cy + (-s*x+c*y)/t.scale }
    : { x: cx + t.scale*(c*x-s*y)+t.dx, y: cy + t.scale*(s*x+c*y)+t.dy };
}
const median = (a: number[]) => a.sort((a,b)=>a-b)[Math.floor(a.length/2)] ?? 0;
type Raster = { width: number; height: number; data: Float32Array; factor: number };
function gray(frame: Frame, factor: number): Raster {
  const width = Math.ceil(frame.width/factor), height = Math.ceil(frame.height/factor), data = new Float32Array(width*height);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    let sum=0,n=0;
    for(let j=0;j<factor && y*factor+j<frame.height;j++) for(let i=0;i<factor && x*factor+i<frame.width;i++) {
      const k=((y*factor+j)*frame.width+x*factor+i)*4;
      sum+=(77*frame.data[k]+150*frame.data[k+1]+29*frame.data[k+2])/256;n++;
    }
    data[y*width+x]=sum/n;
  }
  return {width,height,data,factor};
}
function sample(a: Raster, x: number,y: number): number {
  // Raster pixel centres account for block averaging. All geometry remains in capture pixels.
  x=(x-(a.factor-1)/2)/a.factor;y=(y-(a.factor-1)/2)/a.factor;
  if(x<0||y<0||x>=a.width-1||y>=a.height-1)return NaN;
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,k=iy*a.width+ix;
  return (1-fy)*(a.data[k]*(1-fx)+a.data[k+1]*fx)+fy*(a.data[k+a.width]*(1-fx)+a.data[k+a.width+1]*fx);
}
type Site = Point & { region: number; value: number };
function sitesFor(a: Raster, calibration: Calibration, width: number,height: number): Site[] {
  const sites: Site[]=[];
  // Twelve angular regions, three radial bands. No bull-only registration, no wall samples.
  for(let sector=0;sector<12;sector++) for(let band=0;band<3;band++) {
    for(let ai=0;ai<4;ai++) for(let ri=0;ri<4;ri++) {
      const angle=(sector+(ai+.5)/4)*Math.PI/6, radius=[.25,.56,.82][band]+ri*.035;
      const p=project(calibration.boardToImage,{x:Math.sin(angle)*radius,y:-Math.cos(angle)*radius});
      const x=p.x*width,y=p.y*height;
      const value=sample(a,x,y);
      if(Number.isFinite(value))sites.push({x,y,value,region:sector*3+band});
    }
  }
  return sites;
}
function residuals(sites: Site[], b: Raster,t: Similarity,width: number,height: number) {
  const c=Math.cos(t.rotation)/t.scale,s=Math.sin(t.rotation)/t.scale,cx=(width-1)/2,cy=(height-1)/2;
  return sites.map(p=>{
    const x=p.x-cx-t.dx,y=p.y-cy-t.dy;
    return sample(b,cx+c*x+s*y,cy-s*x+c*y)-p.value;
  });
}
function cost(sites: Site[], b: Raster,t: Similarity,w: number,h: number,offset: number) {
  const residual=residuals(sites,b,t,w,h);
  let sum=0;
  for(const r of residual)sum+=Number.isFinite(r)?Math.min(1600,(r-offset)**2):1600;
  return sum/Math.max(1,residual.length);
}
/** Bilinear inverse warp from RAW current, once only. Invalid borders never become differences. */
export function resample(current: Frame,t: Similarity): {frame: Frame; validMask: Uint8Array} {
  const {width:w,height:h}=current,data=new Uint8ClampedArray(w*h*4),validMask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const p=transformPoint({x,y},t,w,h,true),xx=Math.round(p.x*1e10)/1e10,yy=Math.round(p.y*1e10)/1e10;
    if(xx<0||yy<0||xx>w-1||yy>h-1)continue;
    const ix=Math.floor(xx),iy=Math.floor(yy),fx=xx-ix,fy=yy-iy,k=(y*w+x)*4;
    const right=Math.min(ix+1,w-1),bottom=Math.min(iy+1,h-1);
    for(let ch=0;ch<4;ch++)data[k+ch]=(1-fy)*((1-fx)*current.data[(iy*w+ix)*4+ch]+fx*current.data[(iy*w+right)*4+ch])+fy*((1-fx)*current.data[(bottom*w+ix)*4+ch]+fx*current.data[(bottom*w+right)*4+ch]);
    validMask[y*w+x]=1;
  }
  return {frame:{width:w,height:h,data},validMask};
}
export function stabilize(reference: Frame,current: Frame,calibration: Calibration): Stabilization {
  const started=performance.now();
  let transform={...IDENTITY};
  const metrics: StabilizationMetrics={errorBefore:0,errorAfter:0,improvement:0,textureRegions:0,concordantRegions:0,sectors:0,validFraction:0,brightnessShift:0,sharpnessRatio:0,saturatedFraction:0,elapsedMs:0,allocatedBytes:0};
  const finish=(state: Stabilization['state'],reason: string,aligned: Frame|null=null,validMask: Uint8Array|null=null): Stabilization=>({version:STABILIZATION_VERSION,state,reason,transform,metrics:{...metrics,elapsedMs:performance.now()-started},aligned,validMask});
  try { validateFrame(reference);validateFrame(current); } catch { return finish('REJECTED','Image invalide ou trop grande.'); }
  const {width:w,height:h}=reference;
  if(w!==current.width||h!==current.height)return finish('REJECTED','Dimensions différentes — reprenez une capture au même format.');
  const unit=Math.max(w,h)/960,translationLimit=8*unit,angleLimit=2*Math.PI/180;
  const fullA=gray(reference,1),fullB=gray(current,1);
  const sites=sitesFor(fullA,calibration,w,h);
  // Fixed regions, never removed from detection. Reject missing texture instead of hiding regions.
  const regionValues=Array.from({length:36},()=>[] as number[]);
  sites.forEach(p=>regionValues[p.region].push(p.value));
  const textured=regionValues.map(values=>{
    const mean=values.reduce((s,v)=>s+v,0)/Math.max(1,values.length);
    return values.length>=12&&values.reduce((s,v)=>s+(v-mean)**2,0)/values.length>=100;
  });
  metrics.textureRegions=textured.filter(Boolean).length;
  if(metrics.textureRegions<24)return finish('REJECTED','Texture insuffisante — vérifiez la netteté et l’éclairage.');
  const estimateSites=sites.filter(p=>textured[p.region]);
  metrics.brightnessShift=median(residuals(estimateSites,fullB,IDENTITY,w,h).filter(Number.isFinite));
  if(Math.abs(metrics.brightnessShift)>24)return finish('REJECTED','Éclairage fortement modifié.');
  const offset=metrics.brightnessShift;
  // Coarse search only on a <=240px block-averaged raster and 576 samples. Extended envelope detects out-of-range movement.
  const factor=Math.max(1,Math.ceil(Math.max(w,h)/240)),coarseA=gray(reference,factor),coarseB=gray(current,factor);
  const coarseSites=sitesFor(coarseA,calibration,w,h).filter(p=>textured[p.region]);
  let best=cost(coarseSites,coarseB,transform,w,h,offset);
  for(let dx=-12;dx<=12;dx+=4)for(let dy=-12;dy<=12;dy+=4)for(let degrees=-3;degrees<=3;degrees++)for(const scale of [.97,.985,1,1.015,1.03]) {
    const t={dx:dx*unit,dy:dy*unit,rotation:degrees*Math.PI/180,scale},score=cost(coarseSites,coarseB,t,w,h,offset);
    if(score<best){best=score;transform=t;}
  }
  for(const factor of [Math.max(1,Math.ceil(Math.max(w,h)/480)),1]) {
    const a=factor===1?fullA:gray(reference,factor),b=factor===1?fullB:gray(current,factor);
    const selected=sitesFor(a,calibration,w,h).filter(p=>textured[p.region]);
    best=cost(selected,b,transform,w,h,offset);
    for(const step of [1,.5,.25,.1,.04]) {
      for(let iteration=0;iteration<8;iteration++) {
        let improved=false;
        for(const [key,delta] of [['dx',step*unit],['dy',step*unit],['rotation',step*.2*Math.PI/180],['scale',step*.002]] as const)for(const sign of [-1,1]) {
          const t={...transform,[key]:transform[key]+sign*delta};
          if(Math.abs(t.dx)>14*unit||Math.abs(t.dy)>14*unit||Math.abs(t.rotation)>4*Math.PI/180||Math.abs(t.scale-1)>.04)continue;
          const score=cost(selected,b,t,w,h,offset);
          if(score<best){best=score;transform=t;improved=true;}
        }
        if(!improved)break;
      }
    }
  }
  // Freeze a small outlier exclusion for final precision. Only estimation changes; detection still covers every valid ROI pixel.
  const provisional=residuals(estimateSites,fullB,transform,w,h),provisionalShift=median(provisional.filter(Number.isFinite));
  const unstableRegions=new Set(estimateSites.filter((_,i)=>Math.abs(provisional[i]-provisionalShift)>18).map(p=>p.region));
  const stableSites=estimateSites.filter(p=>!unstableRegions.has(p.region));
  if(stableSites.length<estimateSites.length*.8)return finish('REJECTED','Trop de régions modifiées pour un recalage fiable.');
  best=cost(stableSites,fullB,transform,w,h,provisionalShift);
  for(const step of [.5,.2,.08,.02])for(let iteration=0;iteration<12;iteration++) {
    let improved=false;
    for(const [key,delta] of [['dx',step*unit],['dy',step*unit],['rotation',step*.2*Math.PI/180],['scale',step*.002]] as const)for(const sign of [-1,1]) {
      const t={...transform,[key]:transform[key]+sign*delta},value=cost(stableSites,fullB,t,w,h,provisionalShift);
      if(value<best){best=value;transform=t;improved=true;}
    }
    if(!improved)break;
  }
  const residual=residuals(estimateSites,fullB,transform,w,h),shift=median(residual.filter(Number.isFinite));
  metrics.brightnessShift=shift;
  const errors=residual.map(v=>Math.abs(v-shift));
  const beforeErrors=residuals(estimateSites,fullB,IDENTITY,w,h).map(v=>Math.abs(v-offset));
  const rms=(values:number[])=>Math.sqrt(values.reduce((s,v)=>s+Math.min(1600,v*v),0)/Math.max(1,values.length));
  metrics.errorBefore=rms(beforeErrors);metrics.errorAfter=rms(errors);metrics.improvement=(metrics.errorBefore-metrics.errorAfter)/Math.max(1,metrics.errorBefore);
  const regions=Array.from({length:36},()=>[] as number[]);
  estimateSites.forEach((p,i)=>regions[p.region].push(errors[i]));
  const good=regions.map((values,i)=>textured[i]&&values.filter(v=>Number.isFinite(v)&&v<18).length>=values.length*.8);
  metrics.concordantRegions=good.filter(Boolean).length;
  metrics.sectors=Array.from({length:12},(_,i)=>good.slice(i*3,i*3+3).filter(Boolean).length>=2).filter(Boolean).length;
  let sharpA=0,sharpB=0,saturated=0;
  for(const p of estimateSites) {
    const q=transformPoint(p,transform,w,h,true);
    sharpA+=Math.abs(sample(fullA,p.x+1,p.y)-sample(fullA,p.x-1,p.y))+Math.abs(sample(fullA,p.x,p.y+1)-sample(fullA,p.x,p.y-1));
    sharpB+=Math.abs(sample(fullB,q.x+1,q.y)-sample(fullB,q.x-1,q.y))+Math.abs(sample(fullB,q.x,q.y+1)-sample(fullB,q.x,q.y-1));
    const value=sample(fullB,q.x,q.y);if(value<3||value>252)saturated++;
  }
  metrics.sharpnessRatio=sharpB/Math.max(1,sharpA);metrics.saturatedFraction=saturated/estimateSites.length;
  // Relative to the immutable spatial anchor: cumulative camera drift cannot reset these bounds.
  if(Math.abs(transform.dx)>translationLimit+.05*unit||Math.abs(transform.dy)>translationLimit+.05*unit||Math.abs(transform.rotation)>angleLimit+.0002||Math.abs(transform.scale-1)>.0202)return finish('REJECTED','Mouvement hors limites — immobilisez la caméra ou recalibrez.');
  if(!Number.isFinite(metrics.sharpnessRatio)||metrics.sharpnessRatio<.55)return finish('REJECTED','Image trop floue pour un recalage fiable.');
  if(metrics.saturatedFraction>.18||Math.abs(shift)>24)return finish('REJECTED','Éclairage inexploitable ou saturation excessive.');
  if(metrics.concordantRegions<Math.max(24,metrics.textureRegions*.78)||metrics.sectors<9||metrics.errorAfter>14)return finish('REJECTED','Recalage insuffisant — vérifiez la scène (masquage, texture ou mouvement).');
  const displacement=Math.hypot(transform.dx,transform.dy)+Math.abs(transform.rotation)*Math.min(w,h)/2+Math.abs(transform.scale-1)*Math.min(w,h)/2;
  const identity=displacement<.25*unit && metrics.errorBefore<14;
  if(!identity&&metrics.improvement<.12)return finish('REJECTED','Amélioration insuffisante pour justifier le mouvement.');
  if(identity)transform={...IDENTITY};
  const warped=resample(current,transform);
  let valid=0,total=0;
  // Same detection ROI and denominator for raw/aligned diagnostics; require nearly complete coverage.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    const p=project(calibration.imageToBoard,{x:x/w,y:y/h});if(Math.hypot(p.x,p.y)>1.12)continue;
    total++;valid+=warped.validMask[y*w+x];
  }
  metrics.validFraction=valid/Math.max(1,total);
  metrics.allocatedBytes=fullA.data.byteLength+fullB.data.byteLength+coarseA.data.byteLength+coarseB.data.byteLength+warped.frame.data.byteLength+warped.validMask.byteLength;
  if(metrics.validFraction<.98)return finish('REJECTED','Zone cible insuffisamment visible après recalage.');
  return finish(identity?'IDENTITY':'ALIGNED',identity?'Aucun mouvement significatif':'Image recalée — analyse de l’impact',warped.frame,warped.validMask);
}
