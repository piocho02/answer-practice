import assert from 'node:assert/strict';
import {pageLines,parsePages,composeText,splitQuestions,makePayload,filename} from '../pdf-to-json/core.mjs';
assert.deepEqual(parsePages('1-3, 2, 5',5),[0,1,2,4]);assert.throws(()=>parsePages('0-2',5));assert.throws(()=>parsePages('6',5));
const answers=splitQuestions('제1문\nⅠ. 쟁점\n1. 법리\n제2문\n판단');assert.equal(answers.length,2);assert.match(answers[0],/1. 법리/);assert.throws(()=>splitQuestions('Ⅰ. 쟁점\n1. 법리\n2. 판단'));
const data=makePayload('민법',120,['첫 문단\n<script>alert(1)</script>','둘째 답안']);assert.equal(data.answers.length,5);assert.equal(data.count,2);assert.match(data.answers[0],/<br>&lt;script&gt;/);assert.equal(data.version,1);
assert.equal(filename('민법/사례',new Date(2026,9,22)),'민법_사례_2026-10-22.json');
const rows=pageLines([{str:'법리',width:20,transform:[10,0,0,10,35,90]},{str:'민법',width:20,transform:[10,0,0,10,10,90]},{str:'판단',width:20,transform:[10,0,0,10,10,70]}],{scale:1,convertToViewportPoint:(x,y)=>[x,100-y]});assert.deepEqual(rows.map(r=>r.text),['민법 법리','판단']);
const pages=[['머리말','본문 A','1'],['머리말','본문 B','2']].map(a=>a.map((text,i)=>({text,y:i*20,h:10})));assert.equal(composeText(pages,[0,1]),'머리말\n본문 A\n1\n\n머리말\n본문 B\n2');assert.equal(composeText(pages,[0,1],{trim:true}),'본문 A\n\n본문 B');
console.log('Converter: page ranges, Korean headings, HTML escaping, schema, filename, ordering, cleanup passed');
