import {scrypt as derive,timingSafeEqual,randomBytes,createHmac} from 'node:crypto';
import {promisify} from 'node:util';
import sanitize from 'sanitize-html';
import {fail} from './store.mjs';
const scrypt=promisify(derive),uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function validId(id){if(!uuid.test(id||''))fail(400,'ID 형식이 잘못되었습니다.');return id;}
export function cleanPayload(p){
 if(!p||p.version!==1||typeof p.subject!=='string'||!p.subject.trim()||p.subject.length>40||!Number.isInteger(p.count)||p.count<1||p.count>5||!Number.isInteger(p.minutes)||p.minutes<1||p.minutes>600||!Array.isArray(p.answers)||p.answers.length!==5||p.answers.some(x=>typeof x!=='string'))fail(400,'답안 형식이 잘못되었습니다.');
 return {version:1,subject:p.subject,count:p.count,minutes:p.minutes,answers:p.answers.map(html=>sanitize(html,{allowedTags:['div','br','p','span'],allowedAttributes:{'*':['style']},allowedStyles:{'*':{'text-align':[/^(left|right|center|justify)$/]}}}))};
}
export function createHandler(store,config){
 const {origin,passwordHash,epoch,rateKey}=config;
 if(!/^https:\/\//.test(origin)||new URL(origin).origin!==origin||!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(passwordHash||'')||!Number.isInteger(epoch)||epoch<1||!rateKey||rateKey.length<32)throw Error('서버 설정이 누락되거나 잘못되었습니다.');
 const name='__Host-answer-vault';
 return async function handle(req){
  const reply=(status,data,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
  try{
   const url=new URL(req.url),route=url.pathname;
   if(url.origin!==origin)fail(403,'허용되지 않은 사이트입니다.');
   if(!['GET','POST','PUT'].includes(req.method))fail(405,'지원하지 않는 요청입니다.');
   if(req.method!=='GET'&&(req.headers.get('origin')!==origin||!req.headers.get('content-type')?.startsWith('application/json')))fail(403,'같은 사이트의 JSON 요청만 허용합니다.');
   async function body(){const reader=req.body?.getReader();if(!reader)fail(400,'요청 내용이 없습니다.');let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1048576){await reader.cancel();fail(413,'서버 저장은 1MiB 이하여야 합니다.');}chunks.push(value);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail(400,'JSON 형식이 잘못되었습니다.');}}
   if(await store.epoch()!==epoch)fail(503,'서버 설정을 확인해야 합니다.');
   if(route==='/api/vault/login'&&req.method==='POST'){
    // Vercel overwrites x-vercel-forwarded-for. No generic client-forwarded header fallback.
    const ip=req.headers.get('x-vercel-forwarded-for')||'unknown';await store.limit(createHmac('sha256',rateKey).update(ip).digest('hex'));
    const b=await body();if(typeof b.password!=='string'||Buffer.byteLength(b.password)>1024)fail(400,'비밀번호 형식이 잘못되었습니다.');
    const [salt,expected]=passwordHash.split(':');if(!timingSafeEqual(await scrypt(b.password,salt,32),Buffer.from(expected,'hex')))fail(401,'비밀번호가 올바르지 않습니다.');
    if(await store.epoch()!==epoch)fail(503,'서버 설정이 변경되었습니다.');
    const token=randomBytes(32).toString('hex'),seconds=b.remember===true?2592000:43200;await store.login(token,epoch,seconds);
    return reply(200,{ok:true},{'Set-Cookie':`${name}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/${b.remember===true?'; Max-Age='+seconds:''}`});
   }
   const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
   const session=await store.session(token,epoch);if(!session)fail(401,'로그인이 필요하거나 만료되었습니다.');
   if(route==='/api/vault/session'&&req.method==='GET')return reply(200,{expiresAt:new Date(session.expires_at).getTime()});
   if(route==='/api/vault/logout'&&req.method==='POST'){await store.logout(token);return reply(200,{ok:true},{'Set-Cookie':`${name}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`});}
   if(route==='/api/vault/folders'&&req.method==='GET')return reply(200,await store.folders());
   if(route==='/api/vault/folders'&&req.method==='POST'){const b=await body();const name=typeof b.name==='string'?b.name.normalize('NFC').trim():'';if(!name||name.length>40||/[\x00-\x1f]/.test(name))fail(400,'폴더 이름은 1~40자로 입력하세요.');return reply(201,await store.folder(name));}
   if(route==='/api/vault/documents'&&req.method==='GET'){const cursor=url.searchParams.get('cursor'),folder=url.searchParams.has('folder')?url.searchParams.get('folder'):undefined;if(cursor)validId(cursor);if(folder)validId(folder);return reply(200,await store.list(cursor||null,folder));}
   const match=route.match(/^\/api\/vault\/documents\/([^/]+)$/),id=match?validId(match[1]):null;
   if(id&&req.method==='GET')return reply(200,await store.load(id));
   if((route==='/api/vault/documents'&&req.method==='POST')||(id&&req.method==='PUT')){
    const b=await body();validId(b.requestId);if(b.folderId!=null)validId(b.folderId);if(id&&(!Number.isSafeInteger(b.expectedRevision)||b.expectedRevision<1))fail(400,'revision이 필요합니다.');
    const result=await store.save(id,{requestId:b.requestId,payload:cleanPayload(b.payload),...(b.folderId!==undefined?{folderId:b.folderId}:{}),...(id?{expectedRevision:b.expectedRevision}:{})});return reply(id?200:201,result);
   }
   fail(404,'요청 경로가 없습니다.');
  }catch(e){return reply(e.status||503,{error:e.status?e.message:'서버 연결에 실패했습니다. 로컬 답안은 유지됩니다.'},e.status===429?{'Retry-After':'900'}:{});}
 };
}
