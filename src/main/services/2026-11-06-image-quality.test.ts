import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe,expect,it } from 'vitest';

describe('image quality screening',()=>{
  it('accepts only images whose shorter side is at least 600 pixels and separates unknowns',async()=>{
    const source=readFileSync('chrome-extension/content-script.js','utf8').replace('  chrome.runtime.onMessage.addListener(', '  globalThis.testQuality = verifyImageQuality;\n  chrome.runtime.onMessage.addListener(');
    class FakeImage {
      naturalWidth=0;naturalHeight=0;referrerPolicy='';onload?:()=>void;onerror?:()=>void;
      set src(value:string){queueMicrotask(()=>{if(value==='unknown'){this.onerror?.();return;}this.naturalWidth=value==='large'?900:599;this.naturalHeight=900;this.onload?.();});}
    }
    const context:any={URL,TextEncoder,Image:FakeImage,queueMicrotask,setTimeout:()=>0,console,location:{pathname:'/',hostname:'example.test',href:'https://example.test/'},document:{},chrome:{runtime:{onMessage:{addListener:()=>undefined}}}};
    vm.runInNewContext(source,context);
    const result=await context.testQuality(['large','small','unknown']);
    expect([...result.imageUrls]).toEqual(['large']);
    expect([...result.unknownImageUrls]).toEqual(['unknown']);
    expect(result.rejectedImageCount).toBe(1);
  });
});
