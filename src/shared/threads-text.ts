/**
 * Agent/사용자가 작성한 문자와 구두점은 유지하고 구두점 뒤에 빈 줄 하나를 둔다.
 * URL, 숫자 내부 기호, 공식 제휴 고지문은 보존한다. 문장 생성·교정은 하지 않는다.
 */
export function wrapThreadsLines(value:string):string {
  return value.replace(/\r\n?/g,'\n').split('\n').map(line=>{
    if(line.length<=16 || /※[^※]*※/u.test(line))return line;
    const words=line.split(/\s+/u);
    const lines:string[]=[];
    let current='';
    for(const word of words){
      if(!word)continue;
      const clauseBreak=current.length>=12 && /면$/u.test(current);
      if(current && (clauseBreak || `${current} ${word}`.length>16)){lines.push(current);current=word;}
      else current=current?`${current} ${word}`:word;
    }
    if(current)lines.push(current);
    return lines.join('\n');
  }).join('\n');
}

export function formatThreadsPostText(value:string):string {
  const formatted=value.replace(/\r\n?/g,'\n').trim()
    .split(/(https?:\/\/[^\s]+|※[^※]*※)/gu)
    .map((part,index)=>index%2?part:part.replace(/([,，])[ \t]*\n[\s]*/gu,'$1 ').replace(/([.!?…;:。！？；：]+[\u201d"\u2019')\]}]*)([ \t\n]*)(?=[^\s.,!?…;:。！？，；：\u201d"\u2019')\]}])/gu,
      (match:string,punctuation:string,spaces:string,offset:number,text:string)=>{
        const next=text[offset+match.length];
        if(!spaces&&/^[.,:]$/.test(punctuation)&&/\d/.test(text[offset-1]??'')&&/\d/.test(next??''))return match;
        return `${punctuation}\n\n`;
      }))
    .join('');
  return wrapThreadsLines(formatted);
}
