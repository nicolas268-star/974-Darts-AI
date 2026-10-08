/** Production Next build + loopback fixture. Never uses a live project. */
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openSync} from 'node:fs';
import {testNativeCapture} from './vision-native-capture.browser.mjs';
import {testVisionStabilization} from './vision-stabilization.browser.mjs';
import {testVisionJournal} from './vision-journal.browser.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const env={...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',SUPABASE_URL:'http://127.0.0.1:55321',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:55321',SUPABASE_SERVICE_ROLE_KEY:'test-service-role-key',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-anon-key',NEXT_PUBLIC_DEMO_MODE:'false',NEXT_PUBLIC_SITE_URL:'http://127.0.0.1:3010',ADMIN_USER_ID:'00000000-0000-0000-0000-000000000001'};
const children=[];
function start(args,name,cwd=root){const fd=openSync('/tmp/974darts-vision-'+name+'.log','w');const child=spawn(process.execPath,args,{cwd,env,stdio:['ignore',fd,fd]});children.push(child);return child;}
async function ready(url){for(let n=0;n<120;n++){try{await fetch(url);return;}catch{await delay(500);}}throw Error('Server unavailable: '+url);}
try{
 start(['tests/workflow/preview-server.mjs'],'fixture');
 const build=start(['node_modules/next/dist/bin/next','build'],'build',resolve(root,'app/frontend'));
 const code=await new Promise(resolve=>build.on('exit',resolve));if(code!==0)throw Error('Production build failed: '+code);
 start(['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3010'],'web',resolve(root,'app/frontend'));
 await Promise.all([ready('http://127.0.0.1:55321'),ready('http://127.0.0.1:3010/login')]);
 await testNativeCapture();
 await testVisionStabilization();
 await testVisionJournal();
}catch(error){console.error(error);process.exitCode=1;}finally{for(const child of children)child.kill('SIGTERM');}
