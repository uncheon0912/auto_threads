import { useEffect, useState } from 'react';

export function UpdateButtons() {
  const api=window.threadsAuto.updates;
  const [status,setStatus]=useState<Awaited<ReturnType<typeof api.status>>>();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if(!api)return;
    void api.status().then(setStatus).catch(()=>setMessage('버전 정보를 확인하지 못했습니다.'));
  },[api]);
  const run=async(action:'check'|'restore')=>{
    setBusy(true);
    setMessage('');
    try{
      const result=await api[action]();
      if(result)setMessage(result);
      setStatus(await api.status());
    }catch(error){
      setMessage(error instanceof Error?error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''):'버전 변경 요청에 실패했습니다.');
    }finally{setBusy(false);}
  };
  return <div className="app-version-controls">
    {status&&<span title="현재 버전">{status.current}</span>}
    <button type="button" disabled={busy||!status?.supported} title={status?.supported?'GitHub에서 새 버전 확인':'GitHub Releases의 Windows 설치판에서 사용 가능'} onClick={()=>void run('check')}>최신 버전 업데이트</button>
    <button type="button" disabled={busy||!status?.previous} title={status?.previous?`${status.previous} 버전 설치 안내`:'업데이트 직전 버전 기록이 없습니다'} onClick={()=>void run('restore')}>이전 버전으로 복원</button>
    {(message||busy)&&<div className="app-version-message" role="status">{busy?'버전 작업 중…':message}{!busy&&<button type="button" aria-label="버전 알림 닫기" onClick={()=>setMessage('')}>×</button>}</div>}
  </div>;
}
