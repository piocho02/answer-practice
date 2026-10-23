const box=document.createElement('details');
box.style.cssText='position:fixed;right:16px;bottom:76px;z-index:999;background:#fff;padding:14px;border:1px solid #aaa;border-radius:8px;width:min(330px,calc(100vw - 60px));max-height:70vh;overflow:auto;box-shadow:0 4px 20px #0002';
box.innerHTML=`<summary>개인 보관함</summary><form><p><label>비밀번호 <input name="password" type="password" required autocomplete="current-password"></label></p><p><label><input name="remember" type="checkbox"> 이 기기에서 로그인 유지</label></p><button>로그인</button></form><div data-auth hidden><p><label>과목 폴더 보기 <select id="vault-browse"><option value="*">전체 답안</option><option value="">미분류</option></select></label></p><p><input id="vault-folder-name" aria-label="새 과목 폴더 이름" placeholder="예: 민사소송법" maxlength="40"><button data-action="folder">폴더 만들기</button></p><p><button data-action="list">목록 새로고침</button> <button data-action="more" hidden>더 보기</button></p><select aria-label="저장된 답안" style="max-width:100%"></select><p><label>저장할 과목 폴더 <select id="vault-destination"><option value="">미분류</option></select></label></p><p id="vault-current">현재 답안: 새 문서</p><p><button data-action="load">불러오기</button> <button data-action="save">서버 저장</button> <button data-action="copy">새 사본 저장</button></p><button data-action="logout">로그아웃</button></div><p role="status" aria-live="polite">서버 저장은 수동입니다.</p>`;
box.querySelector('summary').textContent='개인 보관함';box.id='answer-vault-panel';document.body.append(box);const printStyle=document.createElement('style');printStyle.textContent='@media print{#answer-vault-panel{display:none!important}}';document.head.append(printStyle);
const form=box.querySelector('form'),auth=box.querySelector('[data-auth]'),select=box.querySelector('select[aria-label="저장된 답안"]'),status=box.querySelector('[role=status]'),more=box.querySelector('[data-action=more]');
const browse=box.querySelector('#vault-browse'),destination=box.querySelector('#vault-destination'),folderName=box.querySelector('#vault-folder-name'),currentLabel=box.querySelector('#vault-current');
let folders=[];
function showCurrent(){currentLabel.textContent=current?'현재 답안: '+current.payload.subject+' · 버전 '+current.revision+' (서버 저장 시 이 답안 갱신)':'현재 답안: 새 문서';}
async function refreshFolders(){const data=await api('folders');folders=data.items;const b=browse.value,d=destination.value;browse.replaceChildren();destination.replaceChildren();function add(el,value,text){const o=document.createElement('option');o.value=value;o.textContent=text;el.append(o);}add(browse,'*','전체 답안');add(browse,'','미분류 ('+data.unfiled+')');add(destination,'','미분류');for(const f of folders){add(browse,f.id,f.name+' ('+f.count+')');add(destination,f.id,f.name);}browse.value=[...browse.options].some(x=>x.value===b)?b:'*';destination.value=[...destination.options].some(x=>x.value===d)?d:'';}
let current=null,busy=false,pending=null,cursor=null;
function report(text){status.textContent=text;}
async function api(route,body,method=body?'POST':'GET'){
 let response;try{response=await fetch('/api/vault/'+route,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});}catch{throw Error('서버에 연결하지 못했습니다. 로컬 답안은 유지됩니다. 다시 저장해 주세요.');}
 const data=await response.json();if(!response.ok){if(response.status===401){form.hidden=false;auth.hidden=true;}throw Object.assign(Error(data.error),{status:response.status});}return data;
}
async function run(fn){if(busy)return;busy=true;box.querySelectorAll('button,select').forEach(x=>x.disabled=true);try{await fn();}catch(e){report(e.message);}finally{busy=false;box.querySelectorAll('button,select').forEach(x=>x.disabled=false);}}
async function list(append=false){const params=new URLSearchParams();if(append&&cursor)params.set('cursor',cursor);if(browse.value!=='*')params.set('folder',browse.value);const data=await api('documents?'+params);if(!append)select.replaceChildren();for(const item of data.items){const option=document.createElement('option');option.value=item.id;option.textContent=(folders.find(f=>f.id===item.folderId)?.name||'미분류')+' / '+item.subject+' · '+new Date(item.updatedAt).toLocaleString();select.append(option);}cursor=data.nextCursor;more.hidden=!cursor;if(current&&[...select.options].some(x=>x.value===current.id))select.value=current.id;}
form.onsubmit=e=>{e.preventDefault();run(async()=>{const data=new FormData(form);try{await api('login',{password:data.get('password'),remember:data.has('remember')});}finally{form.elements.password.value='';}form.hidden=true;auth.hidden=false;await refreshFolders();await list();report('로그인 완료. 저장할 답안을 선택하거나 새 사본으로 저장하세요.');});};
browse.addEventListener('change',()=>run(async()=>{await list();report('선택한 폴더의 답안입니다. 저장 위치는 아래에서 별도로 지정하세요.');}));
box.addEventListener('click',e=>{const action=e.target.dataset.action;if(!action)return;run(async()=>{
 if(action==='folder'){const f=await api('folders',{name:folderName.value});await refreshFolders();browse.value=f.id;destination.value=f.id;folderName.value='';await list();report('폴더를 만들었습니다. 저장할 폴더로 선택되었습니다.');}
 if(action==='list'||action==='more'){await refreshFolders();await list(action==='more');report('서버 목록을 불러왔습니다.');}
 if(action==='load'){
  if(!select.value)return;if(!confirm('현재 답안을 서버 답안으로 교체할까요? 필요하면 먼저 JSON으로 내보내세요.'))return;
  const row=await api('documents/'+select.value);window.vaultEditor.write(row.payload);current=row;destination.value=row.folderId||'';showCurrent();pending=null;report('불러오기 완료 · 버전 '+row.revision);
 }
 if(action==='save'||action==='copy'){
  const p=window.vaultEditor.read(),target=action==='copy'?null:current;
  const folderId=destination.value||null;
  if(target&&target.folderId!==folderId&&!confirm('현재 답안을 선택한 폴더로 이동하여 저장할까요? 원본을 유지하려면 새 사본 저장을 사용하세요.'))return;
  const signature=JSON.stringify({p,id:target?.id,revision:target?.revision,folderId});
  if(!pending||pending.signature!==signature)pending={signature,id:crypto.randomUUID()};
  const row=await api('documents'+(target?'/'+target.id:''),{payload:p,folderId,requestId:pending.id,...(target?{expectedRevision:target.revision}:{})},target?'PUT':'POST');
  current=row;showCurrent();pending=null;const changed=JSON.stringify(window.vaultEditor.read())!==JSON.stringify(p);
  report('서버 저장 완료 · 버전 '+row.revision+(changed?' · 추가 변경 있음':''));browse.value=folderId||'';await refreshFolders();await list();
 }
 if(action==='logout'){await api('logout',{});current=null;showCurrent();pending=null;form.hidden=false;auth.hidden=true;select.replaceChildren();report('로그아웃 완료. 이 브라우저의 로컬 답안은 남아 있습니다.');}
});});
let booted=false;box.addEventListener('toggle',()=>{if(!box.open||booted)return;booted=true;run(async()=>{try{await api('session');form.hidden=true;auth.hidden=false;await refreshFolders();await list();report('기존 로그인으로 연결했습니다.');}catch(e){if(e.status!==401)throw e;report('비밀번호로 개인 보관함을 열어 주세요.');}});
});