import { describe, expect, it, vi } from 'vitest';
import { AutomationPipeline } from './pipeline';
import { composeCoupangPost } from './coupang-compliance';
import { composeNaverBrandPost } from './naver-brand-compliance';
import { UncertainRemoteOperationError } from '../providers/contracts';

function setup(type:'COUPANG'|'NAVER_BRAND_CONNECT',style:'A'|'B') {
  const account={id:'acct',active:true,automationTarget:true,writingInstructions:'',publicationStyle:style};
  const url=type==='COUPANG'?'https://link.coupang.com/a/test':'https://naver.me/test';
  const original=type==='COUPANG'?composeCoupangPost('상품 소개 문장',url):composeNaverBrandPost('상품 소개 문장',url);
  const repo={createPipelineRun:()=>({id:'run'}),updatePipelineRun:vi.fn(),getAccount:()=>account,savePost:vi.fn(),recordFirstReply:vi.fn(),markSourceDone:vi.fn(),addLog:vi.fn(),getPipelineRun:()=>({accountId:'acct',stage:'PUBLISH'})};
  const threads={publish:vi.fn<(account:string,payload:{text:string;linkUrl?:string})=>Promise<{remoteId:string}>>(async()=>({remoteId:'parent'})),reply:vi.fn<(account:string,parent:string,text:string)=>Promise<{remoteId:string}>>(async()=>({remoteId:'reply'}))};
  const pipeline=new AutomationPipeline(repo as never,{} as never,{} as never,{} as never,{} as never,threads as never,{} as never,{assertAccountReady:async()=>{}});
  vi.spyOn(pipeline as any,'generateDraft').mockResolvedValue({body:original,source:{id:'source',sourceType:type,sourceUrl:url}});
  vi.spyOn(pipeline as any,'createThreadSplit').mockResolvedValue({body:original.slice(0,-url.length).trimEnd(),reply:'상세 설명입니다.'});
  const job={id:'job',kind:'PUBLISH',attempt:1,payload:{contentMode:'DAILY'}};
  return {pipeline,account,job,repo,threads,url};
}

describe('affiliate links in the first reply',()=>{
  for(const type of ['COUPANG','NAVER_BRAND_CONNECT'] as const)for(const style of ['A','B'] as const){
    it(`${type} ${style}: keeps the disclosure in the parent and the exact URL in the reply`,async()=>{
      const {pipeline,account,job,threads,url,repo}=setup(type,style);
      await pipeline['publishCycle'](job as never,account as never,()=>true);
      const payload=threads.publish.mock.calls[0][1] as {text:string;linkUrl?:string};
      expect(payload.text).not.toContain(url);
      expect(payload.text).toContain(type==='COUPANG'?'쿠팡 파트너스':'네이버 쇼핑 커넥트');
      expect(payload.linkUrl).toBeUndefined();
      expect(threads.reply).toHaveBeenCalledOnce();
      const reply=threads.reply.mock.calls[0][2] as string;
      expect(reply.split(url)).toHaveLength(2);
      if(style==='B')expect(reply).toContain('상세 설명입니다.');
      expect(repo.recordFirstReply).toHaveBeenCalledWith(expect.any(String),'acct',reply,'PUBLISHED','reply');
    });
  }
  it('does not repeat parent publication if the link reply outcome is uncertain',async()=>{
    const {pipeline,account,job,threads,repo}=setup('COUPANG','A');
    threads.reply.mockRejectedValue(new UncertainRemoteOperationError('timeout'));
    await pipeline['publishCycle'](job as never,account as never,()=>true);
    expect(threads.publish).toHaveBeenCalledOnce();expect(threads.reply).toHaveBeenCalledOnce();
    expect(repo.recordFirstReply).toHaveBeenCalledWith(expect.any(String),'acct',expect.any(String),'UNCERTAIN',undefined,expect.any(String));
  });
});
