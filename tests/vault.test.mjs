import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {Store} from '../server/store.mjs';
import {createHandler} from '../server/handler.mjs';
import {scryptSync} from 'node:crypto';
const passwordHash=async password=>{const salt='0'.repeat(32);return salt+':'+scryptSync(password,salt,32).toString('hex');};
const payload={version:1,subject:'민사소송법',count:1,minutes:120,answers:['<div>답안</div>','','','','']};
test('PostgreSQL: authentication, folders, revisions, idempotency, sanitization, permissions',async()=>{
 const db=new PGlite();await db.exec(await readFile(new URL('./fixtures/vault-schema.sql',import.meta.url),'utf8'));await db.exec(await readFile(new URL('./fixtures/vault-grants.sql',import.meta.url),'utf8'));
 const store=new Store({query:(s,a)=>db.query(s,a),connect:async()=>({query:(s,a)=>db.query(s,a),release(){}})}),origin='https://vault.test';
 const handler=createHandler(store,{origin,passwordHash:await passwordHash('test-pass'),epoch:1,rateKey:'x'.repeat(32)});
 async function call(route,{method,body,cookie,from=origin}={}){const r=await handler(new Request(origin+'/api/vault/'+route,{method:method||(body?'POST':'GET'),headers:{...(body?{Origin:from,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{})}));return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
 try{
  assert.equal((await call('documents')).status,401);assert.equal((await call('login',{body:{password:'test-pass'},from:'https://other.test'})).status,403);
  const login=await call('login',{body:{password:'test-pass'}});assert.equal(login.status,200);assert.match(login.cookie,/HttpOnly; Secure; SameSite=Strict/);const cookie=login.cookie.split(';')[0];
  const folder=await call('folders',{cookie,body:{name:'민사소송법'}});assert.equal(folder.status,201);
  const expiredId=crypto.randomUUID();await db.query("INSERT INTO answer_vault.receipts VALUES($1,'expired','{}',now()-interval '1 day')",[expiredId]);
  const b={requestId:crypto.randomUUID(),payload,folderId:folder.data.id},first=await call('documents',{cookie,body:b});assert.equal(first.status,201);
  assert.equal((await db.query('SELECT * FROM answer_vault.receipts WHERE id=$1',[expiredId])).rows.length,0);
  assert.equal((await call('documents',{cookie,body:b})).data.id,first.data.id);assert.equal((await call('documents?folder='+folder.data.id,{cookie})).data.items.length,1);
  const update={requestId:crypto.randomUUID(),payload:{...payload,answers:['<div onclick="bad()">확인<script>bad()</script></div>','','','','']},expectedRevision:1};
  const saved=await call('documents/'+first.data.id,{cookie,body:update,method:'PUT'});assert.equal(saved.status,200);assert.equal(saved.data.payload.answers[0],'<div>확인</div>');
  assert.equal((await call('documents/'+first.data.id,{cookie,body:{...update,requestId:crypto.randomUUID()},method:'PUT'})).status,409);
  await db.exec('SET ROLE answer_vault_app');assert.equal((await store.load(first.data.id)).revision,2);await assert.rejects(db.exec('UPDATE answer_vault.settings SET epoch=2'));await db.exec('RESET ROLE');
  // Exercise the new endpoints with the actual restricted server role.
  await db.exec('SET ROLE answer_vault_app');
  const folder2=await call('folders',{cookie,body:{name:'삭제할 폴더'}});
  const savedBody={requestId:crypto.randomUUID(),payload,folderId:folder2.data.id};
  const doc2=await call('documents',{cookie,body:savedBody});
  assert.equal((await call('documents/'+doc2.data.id,{method:'DELETE',body:{expectedRevision:1}})).status,401);
  assert.equal((await call('documents/'+doc2.data.id,{cookie,method:'DELETE',from:'https://other.test',body:{expectedRevision:1}})).status,403);
  assert.equal((await call('documents/'+doc2.data.id,{cookie,method:'DELETE',body:{}})).status,400);
  assert.equal((await call('folders/not-an-id',{cookie,method:'DELETE',body:{}})).status,400);
  const removedFolder=await call('folders/'+folder2.data.id,{cookie,method:'DELETE',body:{}});
  assert.equal(removedFolder.status,200);assert.equal(removedFolder.data.moved.length,1);
  const moved=await call('documents/'+doc2.data.id,{cookie});assert.equal(moved.data.folderId,null);assert.equal(moved.data.revision,2);assert.deepEqual(moved.data.payload,payload);
  assert.equal((await call('documents',{cookie,body:savedBody})).status,409);
  assert.equal((await call('documents/'+doc2.data.id,{cookie,method:'DELETE',body:{expectedRevision:1}})).status,409);
  assert.equal((await call('documents/'+doc2.data.id,{cookie,method:'DELETE',body:{expectedRevision:2}})).status,200);
  assert.equal((await call('documents/'+doc2.data.id,{cookie})).status,404);
  assert.equal((await call('documents/'+doc2.data.id,{cookie,method:'DELETE',body:{expectedRevision:2}})).status,200);
  assert.equal((await call('folders/'+folder2.data.id,{cookie,method:'DELETE',body:{}})).status,200);
  assert.equal((await call('documents/'+first.data.id,{cookie})).status,200);
  const body3={requestId:crypto.randomUUID(),payload};const doc3=await call('documents',{cookie,body:body3});
  assert.equal((await call('documents/'+doc3.data.id,{cookie,method:'DELETE',body:{expectedRevision:1}})).status,200);
  assert.equal((await call('documents',{cookie,body:body3})).status,409);
  const receipt=await db.query('SELECT result FROM answer_vault.receipts WHERE id=$1',[body3.requestId]);assert.deepEqual(receipt.rows[0].result,{invalidated:true});
  await db.exec('RESET ROLE');
  assert.equal((await call('logout',{cookie,body:{}})).status,200);assert.equal((await call('session',{cookie})).status,401);
 }finally{await db.close();}
});
