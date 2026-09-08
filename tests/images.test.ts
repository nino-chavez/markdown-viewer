import {describe,it,expect} from 'vitest';
import {localPath,findImage,rasterInfo} from '../src/images';

describe('local image boundaries',()=>{
 it('resolves encoded relative paths only within the selected folder',()=>{
  expect(localPath('../images/a%20b.png','reports')).toBe('images/a b.png');
  for(const value of ['../outside.png','/etc/image.png','https://example.com/a.png','//example.com/a.png','file:///tmp/a.png','..%2Foutside.png','bad%00name.png','a\\b.png','bad%zz.png'])expect(localPath(value)).toBeNull();
 });
 it('keeps folder paths exact and only allows a unique basename for explicitly attached loose files',()=>{
  const first=new File(['a'],'chart.png');const second=new File(['b'],'chart.png');
  const folder=new Map([['images/chart.png',first],['other/chart.png',second]]);
  expect(findImage('../images/chart.png',folder,'reports',false)).toBe(first);
  expect(findImage('chart.png',folder,'',false)).toBeNull();
  expect(findImage('chart.png',folder,'',true)).toBeNull();
  expect(findImage('images/chart.png',new Map([['chart.png',first]]),'',true)).toBe(first);
 });
 it('reads raster dimensions from bytes and rejects disguised SVG and truncated headers',()=>{
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set([73,72,68,82],12);const view=new DataView(png.buffer);view.setUint32(16,240);view.setUint32(20,160);
  expect(rasterInfo(png)).toEqual({type:'image/png',width:240,height:160});
  expect(rasterInfo(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).toBeNull();
  expect(rasterInfo(new Uint8Array([0xff,0xd8,0xff,0xc0]))).toBeNull();
  const gif=new Uint8Array([71,73,70,56,57,97,10,0,20,0]);expect(rasterInfo(gif)).toEqual({type:'image/gif',width:10,height:20});
 });
});
