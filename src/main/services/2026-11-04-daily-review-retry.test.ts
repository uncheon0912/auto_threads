import { describe, expect, it, vi } from 'vitest';
import { AutomationPipeline } from './pipeline';

function setup() {
  const repo={recentContentForAgent:()=>[],updatePipelineRun:vi.fn(),addLog:vi.fn(),getPipelineRun:()=>({accountId:'account'})};
  const pipeline=new AutomationPipeline(repo as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never);
  vi.spyOn(pipeline as any,'profile').mockReturnValue({});
  const account={id:'account',writingInstructions:''};
  const writer={decision:'PASS',content:'테스트 본문입니다.',reason:'작성 완료',vetoes:[],sourceUrls:[],topic:'일상'};
  const rejection={decision:'REJECT',content:null,reason:'첫 문장 수정 필요',vetoes:[],sourceUrls:[]};
  const approval={decision:'PASS',content:writer.content,reason:'승인',vetoes:[],sourceUrls:[]};
  return {pipeline,repo,account,writer,rejection,approval};
}

describe('bounded daily review retries',()=>{
  it('revises a rejection and returns only after an independent approval',async()=>{
    const {pipeline,repo,account,writer,rejection,approval}=setup();
    let reviews=0;
    const agent=vi.spyOn(pipeline as any,'agent').mockImplementation(async(role:unknown)=>role==='writer'?writer:++reviews<=1?rejection:approval);
    const result=await pipeline['generateDailyDraft'](account as never,'run');
    expect(result).toEqual({body:writer.content});
    expect(agent).toHaveBeenCalledTimes(4);
    expect(repo.updatePipelineRun).toHaveBeenCalledWith('run',expect.objectContaining({message:expect.stringContaining('추가 수정 1/2')}));
  });
  it('stops after three rejected submissions without publishing',async()=>{
    const {pipeline,repo,account,writer,rejection}=setup();
    const agent=vi.spyOn(pipeline as any,'agent').mockImplementation(async(role:unknown)=>role==='writer'?writer:rejection);
    expect(await pipeline['generateDailyDraft'](account as never,'run')).toBeUndefined();
    expect(agent).toHaveBeenCalledTimes(6);
    expect(repo.updatePipelineRun).toHaveBeenCalledWith('run',expect.objectContaining({status:'REJECTED',message:expect.stringContaining('총 3회')}));
  });
  it('checks prohibited phrases locally before calling the reviewer',async()=>{
    const {pipeline,repo,account,writer}=setup();
    const agent=vi.spyOn(pipeline as any,'agent').mockResolvedValue(writer);
    expect(await pipeline['generateDailyDraft']({...account,forbiddenExpressions:'테스트'} as never,'run')).toBeUndefined();
    expect(agent).toHaveBeenCalledTimes(3);
    expect(repo.updatePipelineRun).toHaveBeenCalledWith('run',expect.objectContaining({status:'REJECTED',message:expect.stringContaining('금지 표현')}));
  });
  it('stops before another attempt when the account is stopped',async()=>{
    const {pipeline,account,writer,rejection}=setup();
    const controller=new AbortController();pipeline['publishSignals'].set('run',controller.signal);
    let reviews=0;
    const agent=vi.spyOn(pipeline as any,'agent').mockImplementation(async(role:unknown)=>{
      if(role==='writer')return writer;
      if(++reviews===1)controller.abort();
      return rejection;
    });
    await expect(pipeline['generateDailyDraft'](account as never,'run')).rejects.toThrow();
    expect(agent).toHaveBeenCalledTimes(2);
  });
});
