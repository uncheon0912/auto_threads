import { describe, expect, it, vi } from 'vitest';
import { CoupangChromeCollectorService } from './coupang-chrome-collector';
import { COUPANG_COLLECTOR_PROTOCOL_VERSION } from '../../shared/coupang-collector';

describe('collector progress messages',()=>{
  it('forwards recognised stages only to the matching active request',()=>{
    const collector=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false});
    const progress=vi.fn();const timer=setTimeout(()=>{},10000);
    try{
      (collector as any).pending.set('request-a',{provider:'NAVER_BRAND_CONNECT',sourceUrl:'https://naver.me/example',resolve:vi.fn(),reject:vi.fn(),timer,onProgress:progress});
      const message=(requestId:string,stage:string)=>({type:'COLLECT_PRODUCT_PROGRESS',protocolVersion:COUPANG_COLLECTOR_PROTOCOL_VERSION,requestId,stage});
      (collector as any).handleMessage(message('request-a','AFFILIATE_REDIRECT'));
      (collector as any).handleMessage(message('request-b','PRODUCT_PAGE_LOADING'));
      (collector as any).handleMessage(message('request-a','UNKNOWN'));
      expect(progress).toHaveBeenCalledOnce();expect(progress).toHaveBeenCalledWith('AFFILIATE_REDIRECT');
    }finally{clearTimeout(timer);}
  });
});
