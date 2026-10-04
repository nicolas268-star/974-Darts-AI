import { analyzeCapture, type AnalysisRequest } from '@/lib/vision/analysis-pipeline';
// Structured cloning keeps the main-thread raw frames intact. Only owned output buffers transfer back.
self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const request=event.data;
  try {
    const result=analyzeCapture(request);
    const transfer: Transferable[]=[];
    if(result.stabilization.aligned)transfer.push(result.stabilization.aligned.data.buffer);
    if(result.stabilization.validMask)transfer.push(result.stabilization.validMask.buffer);
    if(result.differences)transfer.push(result.differences.data.buffer);
    self.postMessage({result}, {transfer});
  } catch {
    self.postMessage({error:'Analyse locale indisponible — réessayez la capture.',sessionId:request.sessionId,referenceId:request.referenceId,captureId:request.captureId});
  }
};
