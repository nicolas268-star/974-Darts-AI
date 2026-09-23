// Everything shares one loopback network namespace; all data is disposable.
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openSync} from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const env={...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',SUPABASE_URL:'http://127.0.0.1:55321',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55321',SUPABASE_SERVICE_ROLE_KEY:'test-service-role-key',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon-key',NEXT_PUBLIC_DEMO_MODE:'false',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3008',BACKEND_API_URL:'http://127.0.0.1:8008',PYTHON_API_URL:'http://127.0.0.1:8008',INTERNAL_API_TOKEN:'test-internal-token',ADMIN_USER_ID:'00000000-0000-0000-0000-000000000001',RANKING_WORKFLOW_ENABLED:'true',RANKING_EMAIL_ENABLED:'false',PYTHONPATH:[resolve(root,'app/backend'),process.env.WORKFLOW_TEST_PYTHONPATH].filter(Boolean).join(':')};
const children=[];
function start(cmd,args,name,cwd=root){const fd=openSync('/tmp/974darts-'+name+'.log','w');const child=spawn(cmd,args,{cwd,env,stdio:['ignore',fd,fd]});children.push(child);return child;}
async function ready(url){for(let n=0;n<120;n++){try{await fetch(url);return;}catch{await delay(500)}}throw new Error('Server unavailable: '+url)}
try{
 start(process.execPath,['tests/workflow/preview-server.mjs'],'fixture');
 start('python',['-m','uvicorn','preview_api:app','--app-dir','tests/workflow','--host','127.0.0.1','--port','8008'],'api');
 start(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','3008'],'web',resolve(root,'app/frontend'));
 await Promise.all([ready('http://127.0.0.1:55321'),ready('http://127.0.0.1:8008/docs'),ready('http://127.0.0.1:3008/login')]);
 console.log('Isolated frontend, FastAPI and PostgreSQL fixture ready.');
 const test=spawn(process.execPath,['tests/workflow/browser.test.mjs'],{cwd:root,env,stdio:'inherit'});
 process.exitCode=await new Promise(resolve=>test.on('exit',resolve));
}catch(e){console.error(e.message);process.exitCode=1;}finally{for(const child of children)child.kill('SIGTERM');}
