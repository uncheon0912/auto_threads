import { describe,expect,it } from 'vitest';
import { AppDatabase } from '../db/database';
import { Repositories } from '../db/repositories';

function setup(){
  const db=new AppDatabase(':memory:');
  db.raw.prepare("INSERT INTO accounts(id,name,threads_handle,topic,created_at,updated_at) VALUES ('a','test','','','now','now')").run();
  return {db,repo:new Repositories(db)};
}
describe('product and image recovery',()=>{
  it('moves selected failed products to persistent trash and restores them',()=>{
    const {db,repo}=setup();try{
      const first=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/a',urlFingerprint:'a',metadataStatus:'FAILED'});
      const second=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/b',urlFingerprint:'b',metadataStatus:'FAILED'});
      expect(repo.trashProductLinks('a','COUPANG',[first.id,second.id])).toBe(2);
      expect(repo.listPendingCoupangLinks('a')).toHaveLength(0);
      expect(repo.listTrashedProductLinks('a','COUPANG')).toHaveLength(2);
      repo.restoreTrashedProductLinks('a','COUPANG',[first.id,second.id]);
      expect(repo.listPendingCoupangLinks('a')).toHaveLength(2);
    }finally{db.close();}
  });
  it('excludes and restores multiple images in queue, draft and source together',()=>{
    const {db,repo}=setup();try{
      const urls=['https://example.com/1','https://example.com/2','https://example.com/3'];
      const item=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/a',urlFingerprint:'a',metadataStatus:'READY',imageUrls:urls});
      db.raw.prepare("INSERT INTO sources(id,account_id,source_type,source_key,created_at) VALUES ('source','a','COUPANG','source','now')").run();
      repo.savePost({id:'post',accountId:'a',sourceType:'COUPANG',body:'body',createdAt:'now',imageUrls:urls});
      db.raw.prepare("UPDATE coupang_link_queue SET status='PREVIEW_READY',active_source_id='source',draft_post_id='post' WHERE id=?").run(item.id);
      const original=repo.getCoupangLink(item.id,'a')!;
      const changed=repo.updatePreparedProductImages(item.id,'a',[urls[0],urls[2]],false,original.updatedAt);
      expect(changed.imageUrls).toEqual([urls[1]]);expect(changed.excludedImages).toHaveLength(2);
      expect(repo.getPost('post')?.imageUrls).toEqual([urls[1]]);
      expect(()=>repo.updatePreparedProductImages(item.id,'a',[urls[1]],false,original.updatedAt)).toThrow('변경');
      const restored=repo.updatePreparedProductImages(item.id,'a',[urls[0],urls[2]],true,changed.updatedAt);
      expect(restored.imageUrls).toEqual(urls);expect(restored.excludedImages).toHaveLength(0);
      expect(repo.getPost('post')?.imageUrls).toEqual(urls);
    }finally{db.close();}
  });
  it('rolls back bulk deletion if an item is processing',()=>{
    const {db,repo}=setup();try{
      const a=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/a',urlFingerprint:'a',metadataStatus:'FAILED'});
      const b=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/b',urlFingerprint:'b',metadataStatus:'READY'});
      db.raw.prepare("UPDATE coupang_link_queue SET status='PROCESSING' WHERE id=?").run(b.id);
      expect(()=>repo.trashProductLinks('a','COUPANG',[a.id,b.id])).toThrow('처리 중');
      expect(repo.getCoupangLink(a.id,'a')).toBeTruthy();
      expect(repo.listTrashedProductLinks('a','COUPANG')).toHaveLength(0);
    }finally{db.close();}
  });
  it('keeps size-unknown images in review until the user explicitly restores one',()=>{
    const {db,repo}=setup();try{
      const url='https://example.com/unknown';
      const item=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/a',urlFingerprint:'a',metadataStatus:'FAILED',excludedImages:[{url,position:0,reason:'unverified'}]});
      expect(item.status).toBe('REVIEW_REQUIRED');expect(item.imageUrls).toEqual([]);
      const updated=repo.updatePreparedProductImages(item.id,'a',[url],true,item.updatedAt);
      expect(updated.status).toBe('QUEUED');expect(updated.imageUrls).toEqual([url]);
    }finally{db.close();}
  });
  it('isolates the Naver trash and recovery from Coupang',()=>{
    const {db,repo}=setup();try{
      const item=repo.createCoupangLink({accountId:'a',providerType:'NAVER_BRAND_CONNECT',originalInputType:'PLAIN_LINK',affiliateUrl:'https://example.com/naver',urlFingerprint:'naver',metadataStatus:'FAILED'});
      expect(()=>repo.trashProductLinks('a','COUPANG',[item.id])).toThrow();
      repo.trashProductLinks('a','NAVER_BRAND_CONNECT',[item.id]);
      expect(repo.listTrashedProductLinks('a','COUPANG')).toHaveLength(0);
      expect(repo.listTrashedProductLinks('a','NAVER_BRAND_CONNECT')).toHaveLength(1);
      repo.restoreTrashedProductLinks('a','NAVER_BRAND_CONNECT',[item.id]);
      expect(repo.getNaverBrandLink(item.id,'a')).toBeTruthy();
    }finally{db.close();}
  });
});
