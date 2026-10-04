import { cancelled, type AnalysisRequest, type AnalysisResult } from './analysis-pipeline';
type WorkerLike = Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'|'onmessageerror'>;
/** A single owned job, no queue. Termination interrupts CPU-bound work immediately. */
export class AnalysisClient {
  private active: {worker: WorkerLike; request: AnalysisRequest; resolve: (r: AnalysisResult)=>void; timer: ReturnType<typeof setTimeout>}|null=null;
  constructor(private create: ()=>WorkerLike,private timeoutMs=15_000) {}
  get busy(){return this.active!==null;}
  cancel(reason='Analyse annulée.'){const job=this.active;if(!job)return;this.active=null;clearTimeout(job.timer);job.worker.terminate();job.resolve(cancelled(job.request,reason));}
  run(request: AnalysisRequest): Promise<AnalysisResult> {
    if(this.active)return Promise.resolve(cancelled(request,'Une analyse est déjà en cours.'));
    return new Promise(resolve=>{
      let worker: WorkerLike;
      try{worker=this.create();}catch{resolve(cancelled(request,'Worker indisponible — réessayez avec un navigateur compatible.'));return;}
      const timer=setTimeout(()=>this.cancel('Analyse trop longue — réessayez la capture.'),this.timeoutMs);
      const job={worker,request,resolve,timer};this.active=job;
      worker.onmessage=event=>{
        if(this.active!==job)return;
        const result=event.data.result as AnalysisResult|undefined;
        if(!result){this.cancel(event.data.error??'Erreur du worker.');return;}
        if(result.sessionId!==request.sessionId||result.referenceId!==request.referenceId||result.captureId!==request.captureId)return;
        this.active=null;clearTimeout(timer);worker.terminate();resolve(result);
      };
      worker.onerror=()=>this.cancel('Worker interrompu — réessayez la capture.');
      worker.onmessageerror=()=>this.cancel('Réponse du worker illisible — réessayez.');
      try{worker.postMessage(request);}catch{this.cancel('Impossible de transmettre la capture au worker.');}
    });
  }
}
