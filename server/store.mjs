import {createHash,randomUUID} from 'node:crypto';
export const digest=s=>createHash('sha256').update(s).digest('hex');
export const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export class Store {
 constructor(pool){this.pool=pool;}
 async query(sql,args=[]){return (await this.pool.query(sql,args)).rows;}
 async tx(fn){const c=await this.pool.connect();try{await c.query('BEGIN');const result=await fn(async(s,a=[]) => (await c.query(s,a)).rows);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 async epoch(){return (await this.query('SELECT epoch FROM answer_vault.settings WHERE id=1'))[0]?.epoch;}
 async session(token,epoch){const rows=await this.query('SELECT expires_at FROM answer_vault.sessions WHERE token_hash=$1 AND epoch=$2 AND expires_at>now()',[digest(token),epoch]);return rows[0];}
 async login(token,epoch,seconds){await this.query("INSERT INTO answer_vault.sessions VALUES($1,$2,now()+$3*interval '1 second')",[digest(token),epoch,seconds]);}
 async logout(token){await this.query('DELETE FROM answer_vault.sessions WHERE token_hash=$1',[digest(token)]);}
 async limit(ipHash){return this.tx(async q=>{
  await q('SELECT pg_advisory_xact_lock(813742)');
  for(const key of ['all',ipHash]){const [r]=await q("SELECT attempts,started_at>now()-interval '15 minutes' AS active FROM answer_vault.limits WHERE bucket=$1",[key]);if(r?.active&&r.attempts>=(key==='all'?100:10))fail(429,'로그인 시도가 많습니다. 15분 후 다시 시도하세요.');}
  for(const key of ['all',ipHash])await q("INSERT INTO answer_vault.limits VALUES($1,now(),1) ON CONFLICT(bucket) DO UPDATE SET started_at=CASE WHEN limits.started_at<=now()-interval '15 minutes' THEN now() ELSE limits.started_at END,attempts=CASE WHEN limits.started_at<=now()-interval '15 minutes' THEN 1 ELSE limits.attempts+1 END",[key]);
 });}
 async folders(){return {items:await this.query('SELECT f.id,f.name,count(d.id)::int AS count FROM answer_vault.folders f LEFT JOIN answer_vault.documents d ON d.folder_id=f.id GROUP BY f.id ORDER BY f.name'),unfiled:(await this.query('SELECT count(*)::int AS n FROM answer_vault.documents WHERE folder_id IS NULL'))[0].n};}
 async folder(name){try{const id=randomUUID();await this.query('INSERT INTO answer_vault.folders VALUES($1,$2)',[id,name]);return {id,name};}catch(e){if(e.code==='23505')fail(409,'이미 같은 이름의 폴더가 있습니다.');throw e;}}
 row(r){return {id:r.id,payload:r.payload,folderId:r.folder_id,revision:r.revision,updatedAt:new Date(r.updated_at).getTime()};}
 async load(id){const [r]=await this.query('SELECT * FROM answer_vault.documents WHERE id=$1',[id]);if(!r)fail(404,'답안이 없습니다.');return this.row(r);}
 async list(cursor,folder){const rows=await this.query('SELECT id,payload->>\'subject\' AS subject,folder_id,revision,updated_at FROM answer_vault.documents WHERE ($1::uuid IS NULL OR id>$1) AND ($2::boolean OR folder_id IS NOT DISTINCT FROM $3::uuid) ORDER BY id LIMIT 31',[cursor,folder===undefined,folder||null]);return {items:rows.slice(0,30).map(r=>({id:r.id,subject:r.subject,folderId:r.folder_id,revision:r.revision,updatedAt:new Date(r.updated_at).getTime()})),nextCursor:rows.length>30?rows[29].id:null};}
 async deleteDocument(id,revision){return this.tx(async q=>{
  await q('SELECT pg_advisory_xact_lock(813743)');
  const [old]=await q('SELECT revision FROM answer_vault.documents WHERE id=$1 FOR UPDATE',[id]);
  if(!old)return {ok:true};
  if(old.revision!==revision)fail(409,'다른 기기에서 수정된 답안입니다. 목록을 새로고침하고 다시 확인해 주세요.');
  await q('DELETE FROM answer_vault.documents WHERE id=$1',[id]);
  await q("UPDATE answer_vault.receipts SET result='{\"invalidated\":true}'::jsonb WHERE result->>'id'=$1",[id]);
  return {ok:true};
 });}
 async deleteFolder(id){return this.tx(async q=>{
  await q('SELECT pg_advisory_xact_lock(813743)');
  const moved=await q('UPDATE answer_vault.documents SET folder_id=NULL,revision=revision+1,updated_at=now() WHERE folder_id=$1 RETURNING id,revision',[id]);
  await q('DELETE FROM answer_vault.folders WHERE id=$1',[id]);
  // Old save receipts must not return a folder that no longer exists.
  await q("UPDATE answer_vault.receipts SET result='{\"invalidated\":true}'::jsonb WHERE result->>'folderId'=$1",[id]);
  return {ok:true,moved};
 });}
 async save(id,b){return this.tx(async q=>{
  // Personal vault: one short write transaction at a time, including idempotency checks.
  await q('SELECT pg_advisory_xact_lock(813743)');
  await q('DELETE FROM answer_vault.receipts WHERE expires_at<=now()');
  const fingerprint=digest(JSON.stringify({id,...b}));
  const [receipt]=await q('SELECT * FROM answer_vault.receipts WHERE id=$1 AND expires_at>now()',[b.requestId]);
  if(receipt){if(receipt.request_hash!==fingerprint)fail(409,'같은 요청 ID의 내용이 다릅니다.');if(receipt.result.invalidated)fail(409,'이 저장 요청 이후 답안이나 폴더가 삭제되었습니다. 목록을 새로고침해 주세요.');return receipt.result;}
  const [old]=id?await q('SELECT * FROM answer_vault.documents WHERE id=$1 FOR UPDATE',[id]):[];
  if(id&&!old)fail(404,'답안이 없습니다.');
  if(old&&old.revision!==b.expectedRevision)fail(409,'다른 기기에서 수정했습니다. 새 사본으로 저장하거나 최신 답안을 불러오세요.');
  const folder=b.folderId===undefined?(old?.folder_id||null):b.folderId;
  if(folder&&!(await q('SELECT id FROM answer_vault.folders WHERE id=$1',[folder])).length)fail(400,'존재하지 않는 폴더입니다.');
  const docId=id||randomUUID(),revision=(old?.revision||0)+1;
  const [row]=await q('INSERT INTO answer_vault.documents(id,payload,folder_id,revision) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,folder_id=excluded.folder_id,revision=excluded.revision,updated_at=now() RETURNING *',[docId,JSON.stringify(b.payload),folder,revision]);
  const result=this.row(row);
  await q("INSERT INTO answer_vault.receipts VALUES($1,$2,$3,now()+interval '7 days') ON CONFLICT(id) DO UPDATE SET request_hash=excluded.request_hash,result=excluded.result,expires_at=excluded.expires_at",[b.requestId,fingerprint,JSON.stringify(result)]);
  return result;
 });}
}
