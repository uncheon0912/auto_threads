import { describe, expect, it, vi } from 'vitest';
import { AppDatabase } from '../db/database';
import { Repositories } from '../db/repositories';
import { AutomationScheduler } from './scheduler';

function setup(){
  const db=new AppDatabase(':memory:');
  db.raw.prepare(`INSERT INTO accounts(id,name,threads_handle,topic,automation_target,daily_post_target,operation_start,operation_end,weekdays_json,comments_enabled,created_at,updated_at)
    VALUES ('a','테스트','','',1,24,'00:00','23:59','[0,1,2,3,4,5,6]',0,'2026-01-01','2026-01-01')`).run();
  return {db,repo:new Repositories(db)};
}

describe('schedule history and start delay',()=>{
  it('starts one account while stopped and preserves its reservations when another account starts and stops',async()=>{
    const {db,repo}=setup();
    const scheduler=new AutomationScheduler(repo,{} as never,{hasThreadsToken:async()=>true});
    vi.spyOn(scheduler,'tick').mockResolvedValue();
    try{
      db.raw.prepare(`INSERT INTO accounts(id,name,threads_handle,topic,automation_target,daily_post_target,operation_start,operation_end,weekdays_json,comments_enabled,created_at,updated_at)
        VALUES ('b','두 번째','','',1,24,'00:00','23:59','[0,1,2,3,4,5,6]',0,'2026-01-01','2026-01-01')`).run();
      const now=new Date(2026,10,6,12);
      await scheduler.startAccount('a',now);
      const jobsA=repo.pendingJobs(200).filter(job=>job.accountId==='a');
      expect(jobsA.some(job=>job.kind==='PUBLISH')).toBe(true);
      expect(repo.pendingJobs(200).every(job=>job.accountId==='a')).toBe(true);
      expect(scheduler.isAccountRunning(repo.getAccount('b')!)).toBe(false);
      await scheduler.startAccount('b',now);
      expect(repo.pendingJobs(200).some(job=>job.accountId==='b'&&job.kind==='PUBLISH')).toBe(true);
      scheduler.stopAccount('b');
      expect(repo.pendingJobs(200)).toEqual(jobsA);
    }finally{scheduler.pause();db.close();}
  });
  it('keeps a 30 minute minimum during start and subsequent schedule refresh',async()=>{
    const {db,repo}=setup();
    try{
      const scheduler=new AutomationScheduler(repo,{} as never,{hasThreadsToken:async()=>true});
      const now=new Date(2026,10,5,16,50);
      await scheduler.rebuildSchedules(now);
      await scheduler['scheduleAccounts'](new Date(now.getTime()+60_000));
      const jobs=repo.pendingJobs(200).filter(job=>job.kind==='PUBLISH');
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs.every(job=>new Date(job.runAt).getTime()>=now.getTime()+30*60_000)).toBe(true);
    }finally{db.close();}
  });
  it('lists scheduled results separately from immediate runs and preserves the remote ID',()=>{
    const {db,repo}=setup();
    try{
      const now=new Date().toISOString();
      repo.enqueueJob({id:'job',accountId:'a',kind:'PUBLISH',runAt:now,payload:{}});
      const run=repo.createPipelineRun({accountId:'a',jobId:'job',mode:'PUBLISH'});
      repo.savePost({id:'post',accountId:'a',sourceType:'DAILY',body:'본문',threadsPostId:'remote-post',createdAt:now,publishedAt:now});
      repo.updatePipelineRun(run.id,{status:'COMPLETED',postId:'post'});
      const rejected=repo.createPipelineRun({accountId:'a',jobId:'job',mode:'PUBLISH'});
      repo.updatePipelineRun(rejected.id,{status:'REJECTED',message:'검수 반려'});
      const immediate=repo.createPipelineRun({accountId:'a',mode:'PUBLISH'});
      repo.updatePipelineRun(immediate.id,{status:'COMPLETED'});
      const history=repo.listScheduledPublicationHistory();
      expect(history).toHaveLength(2);
      expect(history.find(item=>item.id===run.id)?.threadsPostId).toBe('remote-post');
      expect(history.find(item=>item.id===rejected.id)?.status).toBe('REJECTED');
    }finally{db.close();}
  });
});
