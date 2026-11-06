import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('Coupang product gallery capture',()=>{
  it('selects thumbnails and keeps only the matching displayed image for each',async()=>{
    const source=readFileSync('chrome-extension/content-script.js','utf8').replace('  chrome.runtime.onMessage.addListener(', '  globalThis.testGallery = collectGalleryImages;\n  chrome.runtime.onMessage.addListener(');
    const url=(size:number,name:string)=>`https://thumbnail.coupangcdn.com/thumbnails/remote/${size}x${size}ex/image/${name}.jpg`;
    const main={currentSrc:url(492,'one'),naturalWidth:492,complete:true,getAttribute:()=>null};
    const make=(name:string,changes=true)=>({currentSrc:url(48,name),getAttribute:()=>null,click:()=>{if(changes)main.currentSrc=url(492,name);}});
    const thumbs=[make('one'),make('two'),make('three',false)];
    const document={body:{innerText:''},title:'product',querySelectorAll:()=>thumbs,querySelector:()=>main};
    const context:any={URL,TextEncoder,setTimeout:(fn:()=>void)=>queueMicrotask(fn),console,location:{pathname:'/vp/products/123',hostname:'www.coupang.com',href:'https://www.coupang.com/vp/products/123?itemId=456'},document,chrome:{runtime:{onMessage:{addListener:()=>undefined},sendMessage:()=>Promise.resolve({ok:true})}}};
    vm.runInNewContext(source,context);
    const result=await context.testGallery(thumbs.map(t=>t.currentSrc),3,{productId:'123',itemId:'456'});
    expect([...result]).toEqual([url(492,'one'),url(492,'two'),url(48,'three')]);
  });
  it('stops if the selected product changes during gallery capture',async()=>{
    const source=readFileSync('chrome-extension/content-script.js','utf8').replace('  chrome.runtime.onMessage.addListener(', '  globalThis.testGallery = collectGalleryImages;\n  chrome.runtime.onMessage.addListener(');
    const url='https://thumbnail.coupangcdn.com/thumbnails/remote/48x48ex/image/one.jpg';
    const thumbnail={currentSrc:url,getAttribute:()=>null,click:()=>{throw new Error('must not click');}};
    const document={body:{innerText:''},title:'product',querySelectorAll:()=>[thumbnail]};
    const context:any={URL,TextEncoder,setTimeout,console,location:{pathname:'/vp/products/999',hostname:'www.coupang.com',href:'https://www.coupang.com/vp/products/999?itemId=456'},document,chrome:{runtime:{onMessage:{addListener:()=>undefined},sendMessage:()=>Promise.resolve({ok:true})}}};
    vm.runInNewContext(source,context);
    await expect(context.testGallery([url],1,{productId:'123',itemId:'456'})).rejects.toThrow('상품 페이지가 바뀌어');
  });
});
