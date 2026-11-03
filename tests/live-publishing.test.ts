import {describe,it,expect,vi} from 'vitest';
import {AutomationPipeline} from '../src/main/services/pipeline';
import {codexActivityFromEvent} from '../src/main/codex/runner';
import {mergeSnapshotPreservingLive,appendLiveActivity,liveEventFromPipeline} from '../src/renderer/live-activity';
import type {AppSnapshot,PipelineRunView} from '../src/shared/domain';

const run=(patch:Partial<PipelineRunView>):PipelineRunView=>({id:'run1',accountId:'account',mode:'PUBLISH',status:'RUNNING',stage:'WRITER',progress:50,message:'작성 중',startedAt:'2026-11-03T10:00:00.000Z',updatedAt:'2026-11-03T10:00:01.000Z',quality:[],...patch});
const snapshot=(runs:PipelineRunView[])=>({pipelineRuns:runs}) as AppSnapshot;
describe('live publishing updates',()=>{
 it('maps only known lifecycle events and never exposes AI output',()=>{
  expect(codexActivityFromEvent({type:'turn.started'})).toContain('처리');
  expect(codexActivityFromEvent({type:'item.completed',item:{type:'agent_message',text:'private output'}})).not.toContain('private output');
  expect(codexActivityFromEvent({type:'unknown',text:'secret'})).toBeUndefined();
 });
 it('keeps newer live progress or completion when an older snapshot returns',()=>{
  const old=run({updatedAt:'2026-11-03T10:00:01.000Z'});
  const live=run({status:'COMPLETED',stage:'DONE',progress:100,updatedAt:'2026-11-03T10:00:03.000Z'});
  const merged=mergeSnapshotPreservingLive(snapshot([live]),snapshot([old]),Date.parse('2026-11-03T10:00:02.000Z'));
  expect(merged.pipelineRuns[0].status).toBe('COMPLETED');
  expect(mergeSnapshotPreservingLive(snapshot([live]),snapshot([]),Date.parse('2026-11-03T10:00:02.000Z')).pipelineRuns).toHaveLength(1);
  expect(mergeSnapshotPreservingLive(snapshot([old]),snapshot([]),Date.parse('2026-11-03T10:00:02.000Z')).pipelineRuns).toHaveLength(0);
 });
 it('forwards real AI lifecycle signals to the current run without changing its stage or progress',async()=>{
  const current=run({});
  const repo={getPipelineRun:()=>current,updatePipelineRun:vi.fn()};
  const codex={run:async(input:{onActivity?:(value:string)=>void})=>{input.onActivity?.('AI가 요청을 처리하고 있습니다.');return {result:{decision:'PASS',reason:'',vetoes:[],sourceUrls:[]}};}};
  const pipeline=new AutomationPipeline(repo as never,{read:async()=>({codex:{}})} as never,codex as never,{addRoutineTokens:vi.fn()} as never,{} as never,{} as never,{} as never);
  await pipeline['agent']('writer','요청',false,undefined,false,current.id);
  expect(repo.updatePipelineRun).toHaveBeenCalledWith(current.id,{message:'작성 Agent · AI가 요청을 처리하고 있습니다.'});
 });
 it('does not duplicate identical consecutive updates',()=>{
  const first=liveEventFromPipeline(run({}));
  const second=liveEventFromPipeline(run({updatedAt:'2026-11-03T10:00:02.000Z'}));
  expect(appendLiveActivity([first],second)).toHaveLength(1);
 });
});
