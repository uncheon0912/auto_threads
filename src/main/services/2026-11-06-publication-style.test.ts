import { describe, expect, it, vi } from 'vitest';
import { AutomationPipeline } from './pipeline';
import { UncertainRemoteOperationError } from '../providers/contracts';

function setup() {
  const account={id:'acct',active:true,automationTarget:true,writingInstructions:'',publicationStyle:'B'};
  const repo={createPipelineRun:()=>({id:'run'}),updatePipelineRun:vi.fn(),getAccount:()=>account,savePost:vi.fn(),recordFirstReply:vi.fn(),addLog:vi.fn(),getPipelineRun:()=>({accountId:'acct',stage:'PUBLISH'})};
  const threads={publish:vi.fn(async()=>({remoteId:'parent-1'})),reply:vi.fn(async()=>({remoteId:'reply-1'}))};
  const pipeline=new AutomationPipeline(repo as never,{} as never,{} as never,{} as never,{} as never,threads as never,{} as never,{assertAccountReady:async()=>{}});
  vi.spyOn(pipeline as any,'generateDraft').mockResolvedValue({body:'원래 본문'});
  vi.spyOn(pipeline as any,'createThreadSplit').mockResolvedValue({body:'짧은 본문',reply:'첫 댓글'});
  const job={id:'job',kind:'PUBLISH',attempt:1,payload:{contentMode:'DAILY'}};
  return {account,repo,threads,pipeline,job};
}

describe('B style publication',()=>{
  it('records the parent and first reply independently',async()=>{
    const {pipeline,account,job,threads,repo}=setup();
    await pipeline['publishCycle'](job as never,account as never,()=>true);
    expect(threads.publish).toHaveBeenCalledTimes(1);
    expect(threads.reply).toHaveBeenCalledWith('acct','parent-1','첫 댓글');
    expect(repo.recordFirstReply).toHaveBeenCalledWith(expect.any(String),'acct','첫 댓글','PENDING');
    expect(repo.recordFirstReply).toHaveBeenCalledWith(expect.any(String),'acct','첫 댓글','PUBLISHED','reply-1');
  });
  it('does not retry the parent or reply when reply outcome is uncertain',async()=>{
    const {pipeline,account,job,threads,repo}=setup();
    threads.reply.mockRejectedValue(new UncertainRemoteOperationError('timeout'));
    await pipeline['publishCycle'](job as never,account as never,()=>true);
    expect(threads.publish).toHaveBeenCalledTimes(1);
    expect(threads.reply).toHaveBeenCalledTimes(1);
    expect(repo.recordFirstReply).toHaveBeenCalledWith(expect.any(String),'acct','첫 댓글','UNCERTAIN',undefined,expect.any(String));
    expect(repo.updatePipelineRun).toHaveBeenCalledWith('run',expect.objectContaining({status:'COMPLETED',message:expect.stringContaining('결과 확인')}));
  });
  it('does not send a first reply after the automation is stopped',async()=>{
    const {pipeline,account,job,threads,repo}=setup();const controller=new AbortController();
    threads.publish.mockImplementation(async()=>{controller.abort();return {remoteId:'parent-1'};});
    await pipeline['publishCycle'](job as never,account as never,()=>true,controller.signal);
    expect(threads.publish).toHaveBeenCalledTimes(1);
    expect(threads.reply).not.toHaveBeenCalled();
    expect(repo.recordFirstReply).toHaveBeenCalledWith(expect.any(String),'acct','첫 댓글','STOPPED',undefined,expect.any(String));
  });
});
