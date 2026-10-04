import { detect, project, type Calibration, type Detection, type Frame } from './engine';
import { stabilize } from './stabilization';
import { IDENTITY, STABILIZATION_VERSION, type Stabilization } from './stabilization-types';
export type AnalysisRequest = {
  sessionId: string; referenceId: string; captureId: string;
  anchor: Frame; reference: Frame; current: Frame; referenceMask?: Uint8Array;
  calibration: Calibration; threshold: number; enabled: boolean;
};
export type AnalysisResult = {
  sessionId: string; referenceId: string; captureId: string;
  stabilization: Stabilization; detection: Detection | null; rawChangedFraction: number | null;
  differences: Frame | null; totalMs: number;
};
export function cancelled(request: Pick<AnalysisRequest,'sessionId'|'referenceId'|'captureId'>,reason='Analyse annulée.'): AnalysisResult {
  return {sessionId:request.sessionId,referenceId:request.referenceId,captureId:request.captureId,stabilization:{version:STABILIZATION_VERSION,state:'CANCELLED',reason,transform:{...IDENTITY},aligned:null,validMask:null,
    metrics:{errorBefore:null,errorAfter:null,improvement:null,textureRegions:null,concordantRegions:null,sectors:null,validFraction:null,brightnessShift:null,sharpnessRatio:null,saturatedFraction:null,elapsedMs:0,allocatedBytes:0}},detection:null,rawChangedFraction:null,differences:null,totalMs:0};
}
const luminance=(f: Frame,k: number)=>(77*f.data[k]+150*f.data[k+1]+29*f.data[k+2])/256;
/** One bounded robust offset in detection ROI; no second gain/offset or corrected image. */
function offset(a: Frame,b: Frame,calibration: Calibration,mask?: Uint8Array): number {
  const shifts:number[]=[];
  for(let y=0;y<a.height;y+=5)for(let x=0;x<a.width;x+=5) {
    const p=project(calibration.imageToBoard,{x:x/a.width,y:y/a.height}),i=y*a.width+x;
    if(Math.hypot(p.x,p.y)>1||mask&&!mask[i])continue;
    shifts.push(luminance(b,i*4)-luminance(a,i*4));
  }
  return shifts.sort((a,b)=>a-b)[Math.floor(shifts.length/2)]??0;
}
export function analyzeCapture(request: AnalysisRequest): AnalysisResult {
  const started=performance.now(),{anchor,reference,current,calibration,threshold,enabled}=request;
  const stabilization=stabilize(anchor,current,calibration);
  const response: AnalysisResult={sessionId:request.sessionId,referenceId:request.referenceId,captureId:request.captureId,stabilization,detection:null,rawChangedFraction:null,differences:null,totalMs:0};
  const same=reference.width===current.width&&reference.height===current.height;
  if(same)response.rawChangedFraction=detect(reference,current,calibration,threshold,request.referenceMask,offset(reference,current,calibration,request.referenceMask)).changedFraction;
  if(!enabled) {
    stabilization.reason='Stabilisation désactivée — comparaison brute diagnostique, sans promotion de référence.';
    stabilization.aligned=null;stabilization.validMask=null;
    if(same)response.detection=detect(reference,current,calibration,threshold,request.referenceMask,offset(reference,current,calibration,request.referenceMask));
  } else if(stabilization.aligned&&stabilization.validMask) {
    const aligned=stabilization.aligned,mask=stabilization.validMask.slice();
    if(request.referenceMask)for(let i=0;i<mask.length;i++)mask[i]&=request.referenceMask[i];
    response.rawChangedFraction=detect(reference,current,calibration,threshold,mask,offset(reference,current,calibration,mask)).changedFraction;
    const shift=offset(reference,aligned,calibration,mask);
    response.detection=detect(reference,aligned,calibration,threshold,mask,shift);
    const data=new Uint8ClampedArray(reference.data.length);
    for(let i=0;i<mask.length;i++) {
      const k=i*4,value=mask[i]?Math.min(255,Math.abs(luminance(aligned,k)-luminance(reference,k)-shift)*3):0;
      data[k]=data[k+1]=data[k+2]=value;data[k+3]=255;
    }
    response.differences={width:reference.width,height:reference.height,data};
  }
  response.totalMs=performance.now()-started;return response;
}
export function canPromote(result: AnalysisResult|null,annotation: string|null,enabled: boolean): boolean {
  return Boolean(enabled&&result&&result.stabilization.aligned&&['IDENTITY','ALIGNED'].includes(result.stabilization.state)&&result.detection&&result.detection.status!=='SCENE_CHANGED'&&annotation==='LABELLED');
}
