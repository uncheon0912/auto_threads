import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoupangChromeCollectorError, CoupangChromeCollectorService } from './coupang-chrome-collector';
import net from 'node:net';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

afterEach(()=>vi.useRealTimers());

describe('collector reconnection protection',()=>{
  it('keeps an in-flight product request when a second socket sends HELLO',async()=>{
    const pipe=process.platform==='win32'?`\\\\.\\pipe\\threads-test-${randomUUID()}`:path.join(process.cwd(),'test-artifacts',`collector-${randomUUID()}.sock`);
    const service=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false,pipePath:pipe,timeoutMs:5000});
    vi.spyOn(service as any,'saveState').mockResolvedValue(undefined);
    await (service as any).listen();
    const active=net.createConnection(pipe);
    await once(active,'connect');
    const ack=once(active,'data');
    active.write(JSON.stringify({type:'HELLO',protocolVersion:2,extensionVersion:'test',capabilities:{collectByAffiliateUrl:true,collectNaverBrandConnect:true}})+'\n');
    await ack;
    active.write(JSON.stringify({type:'READY',protocolVersion:2})+'\n');
    await vi.waitFor(()=>expect(service.status().connected).toBe(true));
    const message=once(active,'data');
    const result=service.research({sourceUrl:'https://link.coupang.com/a/test'});
    const [chunk]=await message;
    const request=JSON.parse(String(chunk));
    const competing=net.createConnection(pipe);
    await once(competing,'connect');
    const closed=once(competing,'close');
    competing.write(JSON.stringify({type:'HELLO',protocolVersion:2,extensionVersion:'other',capabilities:{collectByAffiliateUrl:true}})+'\n');
    await closed;
    active.write(JSON.stringify({type:'COLLECT_PRODUCT_RESULT',protocolVersion:2,requestId:request.requestId,ok:true,product:{qualityChecked:true,finalUrl:'https://www.coupang.com/vp/products/123?itemId=456',productId:'123',itemId:'456',imageUrls:['https://thumbnail.coupangcdn.com/image/a.jpg'],reviews:[]}})+'\n');
    await expect(result).resolves.toMatchObject({productId:'123'});
    active.destroy();
    await service.stop();
  });
  it('keeps the active socket and request when another connection arrives',()=>{
    const service=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false});
    const active={destroyed:false,destroy:vi.fn()};
    const incoming={destroyed:false,destroy:vi.fn()};
    const timer=setTimeout(()=>{},10000);
    const reject=vi.fn();
    (service as any).socket=active;
    (service as any).pending.set('request',{timer,reject});
    expect((service as any).accept(incoming)).toBe(false);
    expect(incoming.destroy).toHaveBeenCalledOnce();
    expect(active.destroy).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    expect((service as any).socket).toBe(active);
    clearTimeout(timer);
  });
  it.each(['COUPANG','NAVER_BRAND_CONNECT'] as const)('retries a temporary disconnection for %s',async provider=>{
    vi.useFakeTimers();
    const service=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false});
    (service as any).server={};
    const result={imageUrls:['sample']};
    const collect=vi.spyOn(service as any,'collectOnce').mockRejectedValueOnce(new CoupangChromeCollectorError('COLLECTOR_DISCONNECTED','끊김')).mockResolvedValue(result);
    const task=provider==='COUPANG'?service.research({sourceUrl:'https://link.coupang.com/a/test'}):service.researchNaverBrand({sourceUrl:'https://naver.me/test'});
    await vi.advanceTimersByTimeAsync(2000);
    await expect(task).resolves.toEqual(result);
    expect(collect).toHaveBeenCalledTimes(2);
  });
  it('stops after three connection failures',async()=>{
    vi.useFakeTimers();
    const service=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false});
    (service as any).server={};
    const collect=vi.spyOn(service as any,'collectOnce').mockRejectedValue(new CoupangChromeCollectorError('COLLECTOR_RECONNECTED','끊김'));
    const task=service.research({sourceUrl:'https://link.coupang.com/a/test'});
    const assertion=expect(task).rejects.toMatchObject({code:'COLLECTOR_RECONNECTED'});
    await vi.advanceTimersByTimeAsync(4000);
    await assertion;
    expect(collect).toHaveBeenCalledTimes(3);
  });
  it('does not retry non-connection errors',async()=>{
    const service=new CoupangChromeCollectorService({userData:'.',hostExecutablePath:'unused',registerHost:false});
    const collect=vi.spyOn(service as any,'collectOnce').mockRejectedValue(new CoupangChromeCollectorError('INVALID_PRODUCT_LINK','주소 오류'));
    await expect(service.research({sourceUrl:'invalid'})).rejects.toMatchObject({code:'INVALID_PRODUCT_LINK'});
    expect(collect).toHaveBeenCalledOnce();
  });
});
