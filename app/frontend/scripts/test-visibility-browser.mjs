import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Reuses the workflow UI coverage with an isolated development demo administrator.
// Proxy authorization/CSRF are covered separately by test:visibility and workflow CI.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repository=resolve(root,'../..');
const {testVisibility}=await import(pathToFileURL(resolve(repository,'tests/workflow/visibility.browser.mjs')));
const {chromium}=createRequire(resolve(repository,'tests/workflow/package.json'))('playwright');
const output=resolve(repository,'test-results/visibility');
const origin=process.env.VISIBILITY_QA_BASE_URL??'http://127.0.0.1:3022';
let server,browser,logs='';
const errors=[];
try {
  await mkdir(output,{recursive:true});
  if(!process.env.VISIBILITY_QA_BASE_URL){
    server=spawn(process.execPath,[resolve(root,'node_modules/next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1','--port','3022'],{
      cwd:root,env:{...process.env,NODE_ENV:'development',NEXT_PUBLIC_DEMO_MODE:'true',ADMIN_USER_ID:'demo-user',NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe'],
    });
    server.stdout.on('data',chunk=>{logs+=chunk}); server.stderr.on('data',chunk=>{logs+=chunk});
    for(let attempt=0;attempt<100;attempt++){
      try {await fetch(origin+'/login');break}
      catch {if(attempt===99||server.exitCode!==null)throw new Error('Next did not start: '+logs.slice(-3000));await new Promise(done=>setTimeout(done,500))}
    }
  }
  browser=await chromium.launch({...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:process.platform==='win32'?{channel:'msedge'}:{}),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/favicon.ico',route=>route.fulfill({status:204,body:''}));
  await page.addInitScript(()=>localStorage.setItem('974-audience-opt-out','true'));
  await testVisibility(page,null,async(target,name)=>{
    await target.evaluate(()=>scrollTo(0,0));
    await target.screenshot({path:resolve(output,name),fullPage:true});
  },{origin,checkApiGuards:false});
  assert.deepEqual(errors,[],'No browser runtime errors');
  await writeFile(resolve(output,'report.json'),JSON.stringify({passed:true,widths:[1440,390],runtimeErrors:errors,noMessagesSent:true},null,2));
  console.log('PASS standalone visibility desktop/mobile; screenshots: '+output);
} catch(error){
  await writeFile(resolve(output,'failure.txt'),String(error.stack??error)+'\n'+logs.slice(-6000));
  throw error;
} finally {
  await browser?.close();
  if(server){
    if(process.platform==='win32')await new Promise(done=>{const kill=spawn('taskkill',['/pid',String(server.pid),'/t','/f'],{stdio:'ignore'});kill.once('exit',done);kill.once('error',done)});
    else server.kill('SIGTERM');
  }
}
