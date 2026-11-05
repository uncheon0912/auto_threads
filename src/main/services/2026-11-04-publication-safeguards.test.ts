import { describe, expect, it, vi } from 'vitest';
import { AutomationPipeline } from './pipeline';
import { UncertainRemoteOperationError } from '../providers/contracts';
import { AutomationScheduler } from './scheduler';

function setup(source?:{id:string;sourceType:string}) {
  const account={id:'acct',active:true,automationTarget:true,writingInstructions:''};
  const repo={createPipelineRun:()=>({id:'run'}),updatePipelineRun:vi.fn(),getAccount:()=>account,savePost:vi.fn(),markSourceDone:vi.fn(),addLog:vi.fn(),getPipelineRun:()=>({accountId:'acct',stage:'PUBLISH'})};
  const threads={publish:vi.fn(async()=>({remoteId:'remote-123'}))};
  const pipeline=new AutomationPipeline(repo as never,{} as never,{} as never,{} as never,{} as never,threads as never,{} as never,{assertAccountReady:async()=>{}});
  vi.spyOn(pipeline as any,'generateDraft').mockResolvedValue({body:'테스트 본문',source});
  const job={id:'job',kind:'PUBLISH',attempt:1,payload:{contentMode:'DAILY'}};
  return {pipeline,repo,threads,job,account};
}

describe('scheduled publication safeguards',()=>{
  it('does not publish a prepared draft after automation stops',async()=>{
    const {pipeline,repo,threads,job,account}=setup();
    await pipeline['publishCycle'](job as never,account as never,()=>false);
    expect(threads.publish).not.toHaveBeenCalled();
    expect(repo.updatePipelineRun).toHaveBeenCalledWith('run',expect.objectContaining({status:'STOPPED'}));
  });
  it('does not retry when remote publication succeeded but source bookkeeping fails',async()=>{
    const {pipeline,repo,threads,job,account}=setup({id:'source',sourceType:'BLOG'});
    repo.markSourceDone.mockImplementation(()=>{throw new Error('database error');});
    await expect(pipeline['publishCycle'](job as never,account as never,()=>true)).rejects.toBeInstanceOf(UncertainRemoteOperationError);
    expect(threads.publish).toHaveBeenCalledTimes(1);
    expect(repo.savePost).toHaveBeenCalledOnce();
  });
  it('stops only the selected account and cancels only its scheduled jobs',()=>{
    const repo={disableAutomationTarget:vi.fn(),cancelPendingScheduledJobs:vi.fn(()=>2),addLog:vi.fn()};
    const scheduler=new AutomationScheduler(repo as never,{} as never);
    expect(scheduler.stopAccount('account-a')).toBe(2);
    expect(repo.disableAutomationTarget).toHaveBeenCalledOnce();
    expect(repo.disableAutomationTarget).toHaveBeenCalledWith('account-a');
    expect(repo.cancelPendingScheduledJobs).toHaveBeenCalledWith('account-a','계정 자동화 중지');
  });
  it('invalidates an in-flight publication for only the stopped account',async()=>{
    const repo={getAccount:(id:string)=>({id,active:true,automationTarget:true}),disableAutomationTarget:vi.fn(),cancelPendingScheduledJobs:vi.fn(()=>0),addLog:vi.fn(),completeJob:vi.fn(),pendingJobs:()=>[]};
    const gates=new Map<string,()=>boolean>();const signals=new Map<string,AbortSignal>();let release!:()=>void;
    const wait=new Promise<void>(resolve=>{release=resolve;});
    const handler={execute:vi.fn(async(job:{accountId:string},_account:unknown,allowed:()=>boolean,signal:AbortSignal)=>{gates.set(job.accountId,allowed);signals.set(job.accountId,signal);await wait;})};
    const scheduler=new AutomationScheduler(repo as never,handler as never,{hasThreadsToken:async()=>true});
    scheduler['running']=true;
    const a=scheduler['executeClaimed']({id:'a',accountId:'account-a',kind:'PUBLISH',attempt:1,payload:{}} as never);
    const b=scheduler['executeClaimed']({id:'b',accountId:'account-b',kind:'PUBLISH',attempt:1,payload:{}} as never);
    await vi.waitFor(()=>expect(gates.size).toBe(2));
    scheduler.stopAccount('account-a');
    expect(gates.get('account-a')!()).toBe(false);
    expect(gates.get('account-b')!()).toBe(true);
    expect(signals.get('account-a')?.aborted).toBe(true);
    expect(signals.get('account-b')?.aborted).toBe(false);
    release();await Promise.all([a,b]);
  });
});
