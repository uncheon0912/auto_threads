import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account } from '../shared/domain';

export function AccountSelector({accounts,selectedId,onSelect}:{accounts:Account[];selectedId:string;onSelect:(id:string)=>boolean}) {
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [announcement,setAnnouncement]=useState('');
  const root=useRef<HTMLDivElement>(null);
  const search=useRef<HTMLInputElement>(null);
  const selected=accounts.find(account=>account.id===selectedId);
  const matches=useMemo(()=>{
    const value=query.trim().replace(/^@/,'').toLocaleLowerCase();
    return accounts.filter(account=>!value||`${account.name} ${account.threadsHandle}`.toLocaleLowerCase().includes(value));
  },[accounts,query]);
  useEffect(()=>{if(!open)return;search.current?.focus();const close=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);root.current?.querySelector('button')?.focus();}};document.addEventListener('mousedown',close);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('mousedown',close);document.removeEventListener('keydown',escape);};},[open]);
  useEffect(()=>{if(!announcement)return;const timer=setTimeout(()=>setAnnouncement(''),3000);return()=>clearTimeout(timer);},[announcement]);
  return <div className="global-account-selector" ref={root}>
    <span className="global-account-label">운영 계정</span>
    <button type="button" className="global-account-trigger" aria-expanded={open} aria-controls="global-account-list" disabled={!accounts.length} onClick={()=>{setQuery('');setOpen(value=>!value);}}>
      <span className="dot success"/><strong key={selectedId} className="global-account-current">{selected?.name??'등록된 계정 없음'}</strong><small>{selected?.threadsHandle?`@${selected.threadsHandle.replace(/^@/,'')}`:''}</small><span aria-hidden="true">▾</span>
    </button>
    <span className="global-account-announcement" role="status" aria-live="polite">{announcement}</span>
    {open&&<div className="global-account-menu" id="global-account-list"><label htmlFor="global-account-search">계정 검색</label><input ref={search} id="global-account-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="계정 이름 또는 아이디"/><div className="global-account-results">{matches.length?matches.map(account=><button type="button" key={account.id} aria-current={account.id===selectedId?'true':undefined} onClick={()=>{if(onSelect(account.id)){setOpen(false);setAnnouncement(`${account.name} 계정으로 전환했습니다.`);}}}><strong>{account.name}</strong><small>{account.threadsHandle?`@${account.threadsHandle.replace(/^@/,'')}`:'아이디 없음'}</small>{account.id===selectedId&&<span>선택됨</span>}</button>):<p>검색 결과가 없습니다.</p>}</div></div>}
  </div>;
}
