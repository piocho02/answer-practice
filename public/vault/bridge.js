window.vaultEditor={
 read(){collectCurrentAnswers();persist();return structuredClone({...state,version:1});},
 write(p){state={subject:p.subject,count:p.count,minutes:p.minutes,answers:p.answers.map(sanitize)};active=0;preview=false;pageCounts=Array(5).fill(4);$('subject').value=state.subject;$('count').value=state.count;$('minutes').value=state.minutes;$('resetTimer').click();render();persist();}
};
