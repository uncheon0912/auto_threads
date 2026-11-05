import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../db/database';
import { Repositories } from '../db/repositories';

describe('per-run AI usage',()=>{
  it('persists measured usage and keeps failed or unreported calls distinguishable',()=>{
    const db=new AppDatabase(':memory:');
    try {
      db.raw.prepare("INSERT INTO accounts(id,name,threads_handle,topic,created_at,updated_at) VALUES ('a','test','','','now','now')").run();
      const repo=new Repositories(db);
      const run=repo.createPipelineRun({accountId:'a',mode:'PUBLISH'});
      repo.recordPipelineAiCall(run.id);
      repo.recordPipelineAiCall(run.id,{input:100,output:25});
      repo.recordPipelineAiCall(run.id);
      expect(repo.getPipelineRun(run.id)).toMatchObject({aiCalls:2,aiMeasuredCalls:1,aiInputTokens:100,aiOutputTokens:25});
      expect(repo.listPipelineRuns('a')[0]).toMatchObject({aiCalls:2,aiMeasuredCalls:1});
    } finally { db.close(); }
  });
});
