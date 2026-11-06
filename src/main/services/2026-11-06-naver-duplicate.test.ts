import { describe, expect, it } from 'vitest';
import { AppDatabase } from '../db/database';
import { Repositories } from '../db/repositories';
import { parseNaverBrandProductInput } from './naver-brand-link-input';

describe('duplicate Naver product lookup',()=>{
  it('finds the existing item by exact link and account, including completed items',()=>{
    const db=new AppDatabase(':memory:');
    try{
      db.raw.prepare("INSERT INTO accounts(id,name,threads_handle,topic,created_at,updated_at) VALUES ('a','A','','','now','now'),('b','B','','','now','now')").run();
      const repo=new Repositories(db);const parsed=parseNaverBrandProductInput('https://naver.me/example');
      const item=repo.createCoupangLink({accountId:'a',providerType:'NAVER_BRAND_CONNECT',originalInputType:'PLAIN_LINK',...parsed,metadataStatus:'FAILED',lastError:'이미지 확인 실패'});
      expect(repo.findProductLinkByFingerprint('a',parsed.urlFingerprint)).toMatchObject({id:item.id,status:'REVIEW_REQUIRED',lastError:'이미지 확인 실패'});
      expect(repo.findProductLinkByFingerprint('b',parsed.urlFingerprint)).toBeUndefined();
      db.raw.prepare("UPDATE coupang_link_queue SET status='COMPLETED' WHERE id=?").run(item.id);
      expect(repo.findProductLinkByFingerprint('a',parsed.urlFingerprint)?.status).toBe('COMPLETED');
    }finally{db.close();}
  });
});
