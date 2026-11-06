import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CoupangChromeCollectorService } from './coupang-chrome-collector';
import { AppDatabase } from '../db/database';
import { Repositories } from '../db/repositories';

describe('product image review',()=>{
  it('prefers the larger observed image for the same product image even after the candidate limit',()=>{
    const source=readFileSync('chrome-extension/content-script.js','utf8').replace('  chrome.runtime.onMessage.addListener(', '  globalThis.testCollect = collectImages;\n  chrome.runtime.onMessage.addListener(');
    const make=(size:number,name:string)=>({naturalWidth:size,naturalHeight:size,currentSrc:`https://thumbnail.coupangcdn.com/thumbnails/remote/${size}x${size}ex/image/${name}.jpg`,getAttribute:()=>null});
    const thumbnail=make(48,'same'),second=make(48,'second'),large=make(492,'same');
    const document={querySelectorAll:(selector:string)=>selector.includes('twc-w-')?[thumbnail,second]:selector.includes('prod-image__item')?[large]:[]};
    const context:any={URL,TextEncoder,setTimeout,console,location:{pathname:'/',hostname:'www.coupang.com',href:'https://www.coupang.com/'},document,chrome:{runtime:{onMessage:{addListener:()=>undefined}}}};
    vm.runInNewContext(source,context);
    expect([...context.testCollect(1)]).toEqual([large.currentSrc]);
  });
  it('retains small but verified images for manual review without accepting them for publishing',()=>{
    const collector=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false});
    const url='https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/example.jpg';
    const result=(collector as any).parseProduct({qualityChecked:true,finalUrl:'https://www.coupang.com/vp/products/123?itemId=456',productId:'123',itemId:'456',imageUrls:[],unknownImageUrls:[],smallImages:[{url,width:492,height:492}],reviews:[]});
    expect(result.imageUrls).toEqual([]);expect(result.smallImages).toEqual([{url,width:492,height:492}]);
  });
  it('keeps small images out of publication until explicitly selected and preserves dimensions',()=>{
    const db=new AppDatabase(':memory:');
    try{
      db.raw.prepare("INSERT INTO accounts(id,name,threads_handle,topic,created_at,updated_at) VALUES ('a','A','','','now','now')").run();
      const repo=new Repositories(db);const url='https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/example.jpg';
      const item=repo.createCoupangLink({accountId:'a',originalInputType:'PLAIN_LINK',affiliateUrl:'https://link.coupang.com/a/example',urlFingerprint:'example',metadataStatus:'FAILED',excludedImages:[{url,position:0,reason:'too_small',width:492,height:492}]});
      expect(item.imageUrls).toEqual([]);expect(item.status).toBe('REVIEW_REQUIRED');
      expect(item.excludedImages?.[0]).toMatchObject({width:492,height:492,reason:'too_small'});
      const selected=repo.updatePreparedProductImages(item.id,'a',[url],true,item.updatedAt);
      expect(selected.imageUrls).toEqual([url]);expect(selected.status).toBe('QUEUED');
    }finally{db.close();}
  });
});
