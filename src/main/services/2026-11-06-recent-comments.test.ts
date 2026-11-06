import { describe, expect, it, vi } from 'vitest';
import { MetaThreadsProvider } from '../providers/threads';
import { AutomationPipeline } from './pipeline';

describe('recent comment collection',()=>{
  it('collects replies from latest post and previous two without narrowing existing 50 post limit',async()=>{
    const provider=new MetaThreadsProvider({} as never);
    vi.spyOn(provider as any,'token').mockResolvedValue('test-token');
    const request=vi.spyOn(provider as any,'request').mockImplementation(async (url:unknown)=>String(url).startsWith('/me?')?{username:'owner'}:{data:[1,2,3].map(n=>({id:`post${n}`,replies:{data:[{id:`reply${n}`,text:'질문',username:'visitor'}]}}))});
    const result=await provider.comments('account');
    expect(result.map(item=>item.postId)).toEqual(['post1','post2','post3']);
    expect(request.mock.calls[1][0]).toContain('limit=50');
  });
  it('does not reply again to previously processed comments',async()=>{
    const account={id:'account',active:true,automationTarget:true,commentsEnabled:true};
    const comments=[1,2,3].map(n=>({id:`reply${n}`,postId:`post${n}`,text:'질문',username:'visitor'}));
    const repo={getAccount:()=>account,unprocessedCommentIds:()=>new Set<string>(),addLog:vi.fn()};
    const threads={comments:vi.fn().mockResolvedValue(comments),reply:vi.fn()};
    const pipeline=new AutomationPipeline(repo as never,{} as never,{} as never,{} as never,{} as never,threads as never,{} as never);
    await pipeline['commentCycle'](account as never);
    expect(threads.comments).toHaveBeenCalledOnce();
    expect(threads.reply).not.toHaveBeenCalled();
  });
});
