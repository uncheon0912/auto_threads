import { describe, it, expect, vi } from 'vitest';
import { AutomationPipeline } from '../src/main/services/pipeline';
import { buildHumanQualityPrompt } from '../src/main/services/content-quality';
import { accountSaveSchema } from '../src/main/ipc/schemas';

const account = { id:'00000000-0000-4000-8000-000000000001', name:'테스트', threadsHandle:'test', topic:'매장 홍보', personality:'[표준]', tone:'[표준]', audience:'소상공인', writingInstructions:'100~200자로 작성하고 프로필 링크 확인 안내', forbiddenTopics:'', forbiddenExpressions:'', dailyEnabled:true, promotionEnabled:false, automationTarget:true, active:true, dailyRatio:1, promotionRatio:0, dailyPostTarget:1, operationStart:'09:00', operationEnd:'21:00', weekdays:[1], commentsEnabled:true, commentIntervalMinutes:10, fixedLinkEnabled:false, fixedLinkUrl:'', createdAt:'', updatedAt:'' };
const body='홍보가 막막하다면?\n\n프로필에서 확인해봐.';
const result=(content:string)=>({decision:'PASS',reason:'확인',vetoes:[],content,sourceUrls:[],topic:'주제'});

describe('account daily instructions',()=>{
 it('validates detailed guidance and remains backward compatible',()=>{
  expect(accountSaveSchema.parse(account).writingInstructions).toBe(account.writingInstructions);
  const {writingInstructions: _unused,...old}=account; void _unused;
  expect(accountSaveSchema.parse(old).writingInstructions).toBe('');
  expect(accountSaveSchema.safeParse({...account,writingInstructions:'가'.repeat(12001)}).success).toBe(false);
 });
 it('passes guidance to writer and reviewer and retains reviewed line breaks',async()=>{
  const prompts:string[]=[];
  const repo={recentContentForAgent:()=>[],updatePipelineRun:vi.fn(),addLog:vi.fn()};
  const settings={read:async()=>({codex:{}})};
  const codex={run:async({prompt}:{prompt:string})=>{prompts.push(prompt);return {totalTokens:0,result:result(body)};}};
  const usage={addRoutineTokens:vi.fn()};
  const pipeline=new AutomationPipeline(repo as never,settings as never,codex as never,usage as never,{} as never,{} as never,{} as never);
  const draft=await pipeline['generateDailyDraft'](account,'test');
  expect(draft?.body).toBe(body);
  expect(prompts).toHaveLength(2);
  expect(prompts.every(p=>p.includes(account.writingInstructions))).toBe(true);
  expect(prompts[1]).toContain('자연스러운 매장과 서비스 소개');
  expect(pipeline['profile'](account,'PROMOTION')).not.toHaveProperty('writingInstructions');
 });
 it('keeps independent rejection when guidance is present',async()=>{
  const repo={recentContentForAgent:()=>[],updatePipelineRun:vi.fn(),addLog:vi.fn(),getPipelineRun:()=>({accountId:account.id})};
  const settings={read:async()=>({codex:{}})};
  const codex={run:async({role}:{role:string})=>({totalTokens:0,result:role==='writer'?result(body):{...result(''),decision:'REJECT',reason:'허위 사실',vetoes:['UNSUPPORTED_EPISODE']}})};
  const pipeline=new AutomationPipeline(repo as never,settings as never,codex as never,{addRoutineTokens:vi.fn()} as never,{} as never,{} as never,{} as never);
  expect(await pipeline['generateDailyDraft'](account,'test')).toBeUndefined();
  expect(repo.updatePipelineRun.mock.calls.some(([,patch])=>patch.status==='REJECTED')).toBe(true);
  expect(buildHumanQualityPrompt({mode:'DAILY',profile:account,body})).toContain(account.writingInstructions);
 });
});
