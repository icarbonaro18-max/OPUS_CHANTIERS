import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPdfImage,addPdfLogo} from '../lib/pdf-logo.js';

test('logos preserve their original proportions in every document header',()=>{
 for(const [maxWidth,maxHeight] of [[43,14],[49,16],[37,12],[53,14.4],[115,31.2]]){
  for(const [width,height] of [[295,80],[80,295],[100,100]]){
   const size=fitPdfImage({width,height},maxWidth,maxHeight);
   assert.ok(Math.abs(size.width/size.height-width/height)<1e-10);
   assert.ok(size.width<=maxWidth+1e-10&&size.height<=maxHeight+1e-10);
  }
 }
 assert.throws(()=>fitPdfImage({width:0,height:80},43,14));
});
test('PDF logo placement centers vertically without stretching or cropping',()=>{
 let args;const image=new Uint8Array([1]);
 const pdf={getImageProperties:()=>({width:295,height:80,fileType:'PNG'}),addImage:(...a)=>args=a};
 const size=addPdfLogo(pdf,image,12,10,43,14);
 assert.deepEqual(args,[image,'PNG',12,10+(14-size.height)/2,size.width,size.height]);
});
