import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { LocalWritingPrompts } from './2026-11-06-local-writing-prompts';
import { AutomationPipeline } from './pipeline';

const files=vi.hoisted(()=>new Map<string,string>());
vi.mock('node:fs',()=>({
  existsSync:(file:string)=>files.has(file),
  readFileSync:(file:string)=>files.get(file),
  mkdirSync:()=>undefined,
  writeFileSync:(file:string,text:string)=>files.set(file,text),
}));
const first={id:'local-one',threadsUserId:'threads-one'};
const second={id:'local-two',threadsUserId:'threads-two'};
beforeEach(()=>files.clear());
describe('local writing prompts',()=>{
  it('keeps common prompts enabled by default for existing accounts',()=>{
    const store=new LocalWritingPrompts('test-data');
    expect(store.get(first).excludeCommon).toBe(false);
  });
  it('keeps account examples separate while sharing common instructions',()=>{
    const store=new LocalWritingPrompts(path.join('test-artifacts','writing-prompts-test'));
    store.save(first,{common:'공통 지침',account:'첫 지침',reference:'첫 계정 말투',promotion:'첫 홍보',excludeCommon:true});
    store.save(second,{common:'공통 지침',account:'둘째 지침',reference:'둘째 계정 말투',promotion:'둘째 홍보',excludeCommon:false});
    expect(store.get(first)).toEqual({common:'공통 지침',account:'첫 지침',reference:'첫 계정 말투',promotion:'첫 홍보',excludeCommon:true});
    expect(store.get(second)).toEqual({common:'공통 지침',account:'둘째 지침',reference:'둘째 계정 말투',promotion:'둘째 홍보',excludeCommon:false});
    expect(store.get({...first,id:'other-install-id'}).reference).toBe('첫 계정 말투');
  });
  it('includes the right prompts for daily and promotion profiles',()=>{
    const store=new LocalWritingPrompts('test-data');
    store.save(first,{common:'공통 지침',account:'첫 지침',reference:'첫 계정 말투',promotion:'첫 홍보',excludeCommon:true});
    store.save(second,{common:'공통 지침',account:'둘째 지침',reference:'둘째 계정 말투',promotion:'둘째 홍보',excludeCommon:false});
    const pipeline=new AutomationPipeline({} as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never,{} as never,store);
    const account={...first,topic:'주제',personality:'[표준]',tone:'[표준]',audience:'',writingInstructions:'기존 지침',forbiddenTopics:'',forbiddenExpressions:''};
    const daily=pipeline['profile'](account as never,'DAILY');
    const promotion=pipeline['profile']({...account,...second} as never,'PROMOTION');
    expect(daily).toMatchObject({writingInstructions:'기존 지침',commonWritingInstructions:'',accountWritingInstructions:'첫 지침',accountStyleExamples:'첫 계정 말투'});
    expect(daily).not.toHaveProperty('promotionWritingInstructions');
    expect(promotion).toMatchObject({commonWritingInstructions:'공통 지침',accountWritingInstructions:'둘째 지침',accountStyleExamples:'둘째 계정 말투',promotionWritingInstructions:'둘째 홍보'});
    expect(promotion).not.toHaveProperty('writingInstructions');
  });
  it('rejects overlong inputs before writing any files',()=>{
    const store=new LocalWritingPrompts('test-data');
    expect(()=>store.save(first,{common:'x'.repeat(12001),account:'',reference:'',promotion:'',excludeCommon:false})).toThrow();
    expect(files.size).toBe(0);
  });
});
