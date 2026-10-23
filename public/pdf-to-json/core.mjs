export function pageLines(items, viewport) {
  const points=items.filter(i=>typeof i.str==='string'&&i.str.trim()).map(i=>{
    const [x,y]=viewport.convertToViewportPoint(i.transform[4],i.transform[5]);
    return {text:i.str,x,y,width:i.width*viewport.scale,h:Math.max(1,Math.hypot(i.transform[2],i.transform[3])*viewport.scale)};
  }).sort((a,b)=>a.y-b.y||a.x-b.x);
  const rows=[];
  for(const p of points){let row=rows.at(-1);if(!row||Math.abs(row.y-p.y)>Math.max(2,Math.min(row.h,p.h)*.35)){row={y:p.y,h:p.h,parts:[]};rows.push(row)}row.parts.push(p)}
  return rows.map(row=>{let text='',end=-Infinity;for(const p of row.parts.sort((a,b)=>a.x-b.x)){if(text&&p.x-end>Math.max(1,p.h*.12)&&!text.endsWith(' ')&&!p.text.startsWith(' '))text+=' ';text+=p.text;end=p.x+p.width}return {text:text.trim(),y:row.y,h:row.h}});
}
export function parsePages(value,total){if(!value.trim())return Array.from({length:total},(_,i)=>i);const set=new Set();for(const part of value.split(',')){const m=part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!m)throw Error('페이지 범위를 1-3, 5 형식으로 입력해 주세요.');const start=+m[1],end=+(m[2]||m[1]);if(start<1||end>total||start>end)throw Error(`페이지는 1~${total} 범위로 입력해 주세요.`);for(let i=start;i<=end;i++)set.add(i-1)}return [...set].sort((a,b)=>a-b)}
const key=s=>s.replace(/\d+/g,'#').replace(/\s+/g,' ').trim();
export function repeatedEdges(pages){const count=new Map();for(const rows of pages){const seen=new Set([...rows.slice(0,2),...rows.slice(-2)].map(r=>key(r.text)));for(const t of seen)count.set(t,(count.get(t)||0)+1)}return new Set([...count].filter(([t,n])=>t&&n>=Math.max(2,Math.ceil(pages.length*.6))).map(([t])=>t))}
const heading=s=>/^(?:제\s*\d+\s*문|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+[.．、\s]|\d+[.．)]|\(\d+\)|[가-힣][.．])/.test(s);
export function composeText(pages,indices,{join=false,trim=false}={}){const repeated=trim?repeatedEdges(pages):new Set();return indices.map(i=>{const rows=pages[i].filter((r,j,a)=>!trim||!((j<2||j>=a.length-2)&&(repeated.has(key(r.text))||/^[-–—]?\s*\d+\s*(?:\/\s*\d+|쪽|페이지)?\s*[-–—]?$/.test(r.text))));let out='';rows.forEach((r,j)=>{if(j){const prev=rows[j-1],gap=r.y-prev.y;out+=join&&!heading(r.text)&&gap<Math.max(prev.h,r.h)*1.85?' ':'\n'}out+=r.text});return out}).join('\n\n')}
export function splitQuestions(text){const lines=text.split('\n'),starts=[];lines.forEach((line,i)=>{if(/^\s*(?:제\s*[1-5]\s*문|문항\s*[1-5])(?:\s|[.．:：)\]】]|$)/.test(line))starts.push(i)});if(starts.length<2)throw Error('문항 제목을 2개 이상 찾지 못했습니다. 문항 추가 또는 커서부터 새 문항 기능을 사용해 주세요.');if(starts.length>5)throw Error('문항 제목이 5개를 넘습니다. 반복 머리말인지 확인하고 직접 나눠 주세요.');starts[0]=0;return starts.map((s,i)=>lines.slice(s,starts[i+1]??lines.length).join('\n').trim())}
export function escapeText(text){return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
export function makePayload(subject,minutes,answers){return {subject:subject.trim().slice(0,40)||'연습문제',count:answers.length,minutes:Math.max(1,Math.min(600,Number(minutes)||120)),answers:Array.from({length:5},(_,i)=>escapeText(answers[i]||'').replace(/\n/g,'<br>')),version:1}}
export function filename(subject,now=new Date()){const name=subject.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().replace(/[. ]+$/g,'')||'연습문제';return name+'_'+[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')+'.json'}
