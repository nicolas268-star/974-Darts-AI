// Read-only UI checks against the existing disposable statistics fixture.
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {openSync,closeSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
import {testChampionshipCharts} from './championship-charts.browser.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const output=process.env.CHAMPIONSHIP_QA_OUTPUT||'/tmp/974darts-championship-dashboard';
await mkdir(output,{recursive:true});
const env={...process.env,PYTHONPATH:[resolve(root,'app/backend'),process.env.WORKFLOW_TEST_PYTHONPATH].filter(Boolean).join(':'),PYTHON_API_URL:'http://127.0.0.1:8008',NEXT_PUBLIC_DEMO_MODE:'false',NEXT_TELEMETRY_DISABLED:'1'};
const children=[];
async function start(command,args,cwd,name){const fd=openSync(resolve(output,name+'.log'),'w');const child=spawn(command,args,{cwd,env,stdio:['ignore',fd,fd]});closeSync(fd);children.push(child);return child;}
async function ready(url){for(let n=0;n<100;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Server unavailable: '+url);}
let browser;
try {
 await start('python',['-m','uvicorn','championship_preview:app','--app-dir','tests/workflow','--host','127.0.0.1','--port','8008'],root,'api');
 await start(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3008'],resolve(root,'app/frontend'),'web');
 await Promise.all([ready('http://127.0.0.1:8008/docs'),ready('http://127.0.0.1:3008/championships/2027')]);
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--no-zygote','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await testChampionshipCharts(page,async(page,name,options)=>{
   await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
   await page.screenshot({path:resolve(output,name),...options});
 });
 if(errors.length)throw Error(errors.join('\n'));
} catch(error){console.error(error);process.exitCode=1;}
finally {if(browser)await browser.close();for(const child of children)child.kill('SIGTERM');}
