import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../public/assets/save-json.js',import.meta.url),'utf8');
function setup(picker){const events=[];const link={click(){events.push(['download',this.download])},remove(){events.push(['remove'])}};const window=picker?{showSaveFilePicker:picker}:{};runInNewContext(source,{window,document:{body:{append(){events.push(['append'])}},createElement(){return link}},URL:{createObjectURL(){events.push(['url']);return 'blob:test'},revokeObjectURL(u){events.push(['revoke',u])}},setTimeout(fn){fn()}});return {save:window.saveAnswerJson,events};}
test('native save supplies filename and JSON type, writes bytes and waits for close',async()=>{
 let options,written,finish;const closed=new Promise(resolve=>finish=resolve);
 const {save,events}=setup(async o=>{options=o;return {createWritable:async()=>({write:async b=>written=b,close:()=>closed})}});
 const blob=new Blob(['{"version":1}']);let done=false;const pending=save(blob,'민법_2026-10-26.json').then(r=>{done=true;return r});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(done,false);assert.equal(written,blob);assert.equal(options.suggestedName,'민법_2026-10-26.json');assert.equal(options.types[0].accept['application/json'][0],'.json');finish();assert.equal(await pending,'saved');assert.equal(events.length,0);
});
test('cancel does not silently download; picker errors remain errors',async()=>{
 const {save,events}=setup(async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'})});assert.equal(await save(new Blob(),'x.json'),'cancelled');assert.equal(events.length,0);
 const denied=setup(async()=>{throw Object.assign(Error('denied'),{name:'SecurityError'})});await assert.rejects(denied.save(new Blob(),'x.json'),{name:'SecurityError'});assert.equal(denied.events.length,0);
});
test('write failure aborts the write and does not report success or download',async()=>{
 let aborted=false;const {save,events}=setup(async()=>({createWritable:async()=>({write:async()=>{throw Error('full')},close:async()=>{throw Error('must not close')},abort:async()=>{aborted=true}})}));await assert.rejects(save(new Blob(),'x.json'),/full/);assert.equal(aborted,true);assert.equal(events.length,0);
});
test('unsupported browser uses the existing download with the same filename',async()=>{
 const {save,events}=setup();assert.equal(await save(new Blob(),'민법.json'),'downloaded');assert.deepEqual(events,[['url'],['append'],['download','민법.json'],['remove'],['revoke','blob:test']]);
});
