import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../app/frontend/package.json', import.meta.url));
const ts = require('typescript');
export async function testNativeCapture() {
  const source = await readFile(new URL('../../app/frontend/lib/vision/capture.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: `const module={exports:{}};const exports=module.exports;${code}\nwindow.nativeCapture=module.exports;` });
    const result = await page.evaluate(async () => {
      const { capture, nativeSnapshot } = window.nativeCapture;
      const source = document.createElement('canvas'); source.width=720;source.height=1280;
      const ctx=source.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,720,1280);
      // A one-pixel detail must survive in the native image, not a downscale/upscale.
      ctx.fillStyle='#0000ff';ctx.fillRect(101,103,1,1);
      const originalDraw=CanvasRenderingContext2D.prototype.drawImage;let sourceDraws=0;
      CanvasRenderingContext2D.prototype.drawImage=function(input,...args){
        const value=originalDraw.call(this,input,...args);
        if(input===source){sourceDraws++;ctx.fillStyle='#00ff00';ctx.fillRect(0,0,720,1280);}
        return value;
      };
      let snapshot;
      try{snapshot=capture(source,720,1280);}finally{CanvasRenderingContext2D.prototype.drawImage=originalDraw;}
      const exported=nativeSnapshot(snapshot);
      const image=new Image();image.src=exported.image;await image.decode();
      const decoded=document.createElement('canvas');decoded.width=image.width;decoded.height=image.height;decoded.getContext('2d').drawImage(image,0,0);
      const pixels=decoded.getContext('2d');
      const tooLarge=capture(source,2400,1800); // native allocation must be skipped, reduced analysis still works
      snapshot.nativeCanvas.toDataURL=()=>{throw Error('encoding denied');};
      const failed=nativeSnapshot(snapshot);
      return { sourceDraws,width:snapshot.frame.width,height:snapshot.frame.height,
        analysisPixel:Array.from(snapshot.frame.data.slice(0,4)),nativePixel:Array.from(pixels.getImageData(0,0,1,1).data),
        detail:Array.from(pixels.getImageData(101,103,1,1).data),decodedSize:[image.width,image.height],
        sourcePixel:Array.from(ctx.getImageData(0,0,1,1).data),exported:{...exported,image:undefined},
        sameId:exported.captureId===snapshot.id,sameTime:exported.capturedAt===snapshot.capturedAt,
        tooLarge:{native:tooLarge.nativeCanvas,status:nativeSnapshot(tooLarge),width:tooLarge.frame.width},failed };
    });
    expect(result.sourceDraws).toBe(1);
    expect([result.width,result.height]).toEqual([540,960]);
    expect(result.decodedSize).toEqual([720,1280]);
    expect(result.analysisPixel).toEqual([255,0,0,255]);expect(result.nativePixel).toEqual([255,0,0,255]);
    expect(result.sourcePixel).toEqual([0,255,0,255]);expect(result.detail).toEqual([0,0,255,255]);
    expect(result.exported.scaleX).toBeCloseTo(4/3);expect(result.exported.scaleY).toBeCloseTo(4/3);
    expect(result.sameId&&result.sameTime).toBe(true);
    expect(result.tooLarge.native).toBeNull();expect(result.tooLarge.width).toBe(960);
    expect(result.tooLarge.status.status).toBe('unavailable');expect(result.tooLarge.status.unavailableReason).toBe('source_too_large');expect(result.tooLarge.status.image).toBeNull();
    expect(result.failed.status).toBe('unavailable');expect(result.failed.unavailableReason).toBe('encoding_failed');expect(result.failed.image).toBeNull();
    console.log('PASS native capture: same instant, original one-pixel detail, 720x1280 / 540x960 mapping, memory bound and explicit encoding failure.');
  } finally { await browser.close(); }
}
