import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startServer, root } from '../tools/serve.mjs';
import { launchBrowser } from '../tools/browser.mjs';

let server, browser;
before(async()=>{server=await startServer();browser=await launchBrowser();});
after(async()=>{await browser?.close();await server?.close();});
async function rows(page){return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('gridsmith',1);request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;const tx=db.transaction('added');const result=tx.objectStore('added').getAll();result.onsuccess=()=>resolve(result.result);tx.oncomplete=()=>db.close();};
}));}
async function until(fn){for(let n=0;n<200;n++){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,30));}assert.fail('Restore did not settle');}
async function scenario(run){
  const context=await browser.newContext();const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{await page.goto(server.url);await page.locator('#grid .tile').first().waitFor();await rows(page);
    await page.locator('#grid .tile:not(.locked)').first().focus();await page.keyboard.press('Alt+ArrowRight');
    const before=await page.evaluate(()=>localStorage.getItem('gridsmith.v3'));
    const order=await page.locator('#grid .tile:not(.locked)').evaluateAll(nodes=>nodes.map(n=>n.dataset.id));
    const src='data:image/png;base64,'+(await readFile(join(root,'tests/fixtures/grid-4x4.png'))).toString('base64');
    const backup={order:['urestore',...order],backlog:[],added:[{id:'urestore',src}],meta:{urestore:{c:'A restored caption',d:'2026-10-12'}},drafts:[],cols:3};
    await run({page,before,order,backup});assert.deepEqual(errors,[]);
  }finally{await context.close();}
}
async function restore(page,backup){
  await page.locator('#fileinput').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await until(async()=>!(await page.locator('#addimages').isDisabled()));
}
async function unchanged(page,before,order){
  assert.equal(await page.evaluate(()=>localStorage.getItem('gridsmith.v3')),before);
  assert.deepEqual(await page.locator('#grid .tile:not(.locked)').evaluateAll(nodes=>nodes.map(n=>n.dataset.id)),order);
  assert.deepEqual(await rows(page),[]);
  assert.doesNotMatch(await page.locator('#toast').textContent(),/^Layout restored/);
}
test('backup restoration rejects blocked image writes without changing layout or image records',()=>scenario(async({page,before,order,backup})=>{
  await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='added')throw new DOMException('Blocked for test','QuotaExceededError');return original.apply(this,args);};});
  await restore(page,backup);await unchanged(page,before,order);
}));
test('backup restoration rolls image writes back when layout storage is blocked',()=>scenario(async({page,before,order,backup})=>{
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='gridsmith.v3')throw new DOMException('Blocked for test','QuotaExceededError');return original.call(this,key,value);};});
  await restore(page,backup);await unchanged(page,before,order);
}));
test('backup restoration rejects unreadable pixels and duplicate image identifiers',()=>scenario(async({page,before,order,backup})=>{
  await restore(page,{...backup,added:[{id:'urestore',src:'data:image/png;base64,aGVsbG8='}]});await unchanged(page,before,order);
  await restore(page,{...backup,added:[backup.added[0],backup.added[0]]});await unchanged(page,before,order);
}));
test('successful backup restoration persists image bytes and metadata across reload',()=>scenario(async({page,backup})=>{
  await restore(page,backup);assert.equal(await page.locator('#toast').textContent(),'Layout restored');
  assert.deepEqual(await rows(page),backup.added);await page.reload();
  await until(async()=>await page.locator('#grid .tile:not(.locked)').count()===13);
  assert.deepEqual(await rows(page),backup.added);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('gridsmith.v3')).meta.urestore),backup.meta.urestore);
}));
test('failed Undo and Redo preserve image bytes, captions and the retryable history entry',()=>scenario(async({page,backup})=>{
  await restore(page,backup);
  const replacement='data:image/png;base64,'+(await readFile(join(root,'tests/fixtures/grid-6x5.png'))).toString('base64');
  const changed={...backup,added:[{id:'urestore',src:replacement}],meta:{urestore:{c:'Replacement caption',d:'2026-11-01'}}};
  await restore(page,changed);
  await page.evaluate(()=>{window.denyHistoryWrites=true;const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='added'&&window.denyHistoryWrites)throw new DOMException('Test quota','QuotaExceededError');return original.apply(this,args);};});
  const before=await page.evaluate(()=>localStorage.getItem('gridsmith.v3'));
  await page.locator('#undo').click();await until(async()=>!(await page.locator('#undo').isDisabled()));
  assert.equal(await page.evaluate(()=>localStorage.getItem('gridsmith.v3')),before);
  assert.deepEqual(await rows(page),changed.added);
  assert.equal(await page.locator('#grid .tile[data-id="urestore"] img').getAttribute('src'),replacement);
  assert.doesNotMatch(await page.locator('#toast').textContent(),/^Undone/);
  await page.evaluate(()=>{window.denyHistoryWrites=false;});
  await page.locator('#undo').click();await until(async()=>!(await page.locator('#redo').isDisabled()));
  assert.deepEqual(await rows(page),backup.added);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('gridsmith.v3')).meta.urestore),backup.meta.urestore);
  await page.evaluate(()=>{window.denyHistoryWrites=true;});
  await page.locator('#redo').click();await until(async()=>!(await page.locator('#redo').isDisabled()));
  assert.deepEqual(await rows(page),backup.added);
  assert.doesNotMatch(await page.locator('#toast').textContent(),/^Redone/);
  await page.reload();await page.locator('#grid .tile[data-id="urestore"] img').waitFor();
  assert.deepEqual(await rows(page),backup.added);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('gridsmith.v3')).meta.urestore),backup.meta.urestore);
}));
