import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises'; import { resolve } from 'node:path';
import validator from 'gltf-validator';
import { geometryGlb, parseGlb, writeGlb } from '../../src/glb.js';
const origin='http://127.0.0.1:8765';
const simple=()=>geometryGlb([{positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2]}]);
function animated(){
 const {json,bin}=parseGlb(simple()),data=new Uint8Array(bin.length+32);data.set(bin);new Float32Array(data.buffer,bin.length,8).set([0,1,5,0,0,6,0,0]);
 const times=json.bufferViews.push({buffer:0,byteOffset:bin.length,byteLength:8})-1,values=json.bufferViews.push({buffer:0,byteOffset:bin.length+8,byteLength:24})-1;
 const input=json.accessors.push({bufferView:times,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]})-1,output=json.accessors.push({bufferView:values,componentType:5126,count:2,type:'VEC3'})-1;
 json.nodes[0].translation=[5,0,0];json.nodes[0].name='AnimatedTriangle';json.animations=[{name:'Move',samplers:[{input,output,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}];json.buffers[0].byteLength=data.length;return writeGlb(json,data);
}
async function downloaded(page,format,mode='original'){
 await page.locator('#export-content').selectOption(mode);await page.locator('#format-select').selectOption(format);
 const event=page.waitForEvent('download');await page.locator('#download-btn').click();const download=await event;const path=await download.path();return {bytes:await readFile(path),name:download.suggestedFilename()};
}
test.beforeEach(async({context,page})=>{
 await context.route('https://unpkg.com/three@0.169.0/**',async route=>{
  const suffix=new URL(route.request().url()).pathname.split('/three@0.169.0/')[1];
  await route.fulfill({body:await readFile(resolve('node_modules/three',suffix)),contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/');await expect(page.locator('#status-text')).not.toContainText('WebGL could not start');
 await expect(page.locator('#viewport canvas')).toBeVisible();
});
test('wireframe and reset never alter original bytes or regenerated primitives and animation',async({page})=>{
 const buffer=animated();await page.locator('#picker').setInputFiles({name:'animated.glb',mimeType:'model/gltf-binary',buffer:Buffer.from(buffer)});
 await expect(page.locator('#model-info')).toContainText('animated.glb');await page.locator('#wireframe').click();await page.locator('#reset').click();
 const original=await downloaded(page,'glb');expect(original.bytes.equals(Buffer.from(buffer))).toBe(true);
 const gltf=JSON.parse((await downloaded(page,'gltf')).bytes.toString());expect(gltf.animations.length).toBe(1);expect(gltf.meshes[0].primitives[0].mode??4).toBe(4);expect(gltf.nodes.find(n=>n.name==='AnimatedTriangle').translation).toEqual([5,0,0]);
 const result=await validator.validateBytes(new Uint8Array(original.bytes));expect(result.issues.numErrors).toBe(0);
});
test('failed replacement retains current asset and export filename',async({page})=>{
 await page.locator('#picker').setInputFiles({name:'first.glb',mimeType:'model/gltf-binary',buffer:Buffer.from(simple())});await expect(page.locator('#model-info')).toContainText('first.glb');
 await page.locator('#picker').setInputFiles({name:'failed.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('bad')});await expect(page.locator('#status')).toHaveAttribute('data-kind','error');
 expect((await downloaded(page,'glb')).name).toBe('first.glb');
});
test('direct URL and public Meshy URL resolver load without credentials; blocked URL gives fallback',async({page,context})=>{
 await context.route('https://models.example.org/model.glb',r=>r.fulfill({body:Buffer.from(simple()),contentType:'model/gltf-binary',headers:{'access-control-allow-origin':'*'}}));
 await context.route('https://www.meshy.ai/meshyd-api/**',r=>r.fulfill({json:{code:'OK',result:{result:{texture:{modelUrl:'https://models.example.org/model.glb'}}}},headers:{'access-control-allow-origin':'*'}}));
 await page.locator('#model-url').fill('https://www.meshy.ai/3d-models/demo-12345678-1234-1234-1234-123456789abc');await page.locator('#url-btn').click();await expect(page.locator('#model-info')).toContainText('model.glb');
 await context.route('https://blocked.example.org/**',r=>r.abort());await page.locator('#model-url').fill('https://blocked.example.org/model.glb');await page.locator('#url-btn').click();await expect(page.locator('#status-text')).toContainText('Asset Lens');
});
test('textured sample paints, exports valid GLB and round-trips native paint metadata',async({page})=>{
 await page.locator('#sample-btn').click();await expect(page.locator('#model-info')).toContainText('paint-sample');await page.locator('#color-count').fill('2');await page.locator('#paint-btn').click();
 await expect(page.locator('#paint-report')).toContainText('triangles',{timeout:60000});await expect(page.locator('#palette input')).toHaveCount(2);
 const glb=await downloaded(page,'glb','painted');const report=await validator.validateBytes(new Uint8Array(glb.bytes));expect(report.issues.numErrors).toBe(0);expect(parseGlb(glb.bytes).json.meshes[0].primitives[0].attributes.COLOR_0).toBeDefined();
 const {readDocument}=await import('../../src/vendor/three-mf/index.js');
 for(const slicer of ['prusa','bambu','orca']){
  await page.locator('#format-select').selectOption('3mf');await page.locator('#slicer-target').selectOption(slicer);await page.locator('#print-scale').fill('100');
  const file=await downloaded(page,'3mf','painted'),doc=readDocument(new Uint8Array(file.bytes),'paint.3mf');expect(doc.sourceTriangles).toBeGreaterThan(12);expect(doc.palette.length).toBeGreaterThanOrEqual(2);expect(doc.paintedTriangles).toBeGreaterThan(0);
 }
 await page.screenshot({path:'test-results/painted-workflow.png',fullPage:true});
});
test('displayed geometry snapshot is a valid static GLB',async({page})=>{
 await page.locator('#sample-btn').click();await expect(page.locator('#model-info')).toContainText('paint-sample');const glb=await downloaded(page,'glb','geometry');const report=await validator.validateBytes(new Uint8Array(glb.bytes));expect(report.issues.numErrors).toBe(0);expect(parseGlb(glb.bytes).json.materials).toBeUndefined();
});
test('OBJ material conversion does not produce an empty USDZ',async({page})=>{
 await page.locator('#picker').setInputFiles({name:'triangle.obj',mimeType:'text/plain',buffer:Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')});await expect(page.locator('#model-info')).toContainText('triangle.obj');
 const file=await downloaded(page,'usdz');expect(file.bytes.subarray(0,2).toString()).toBe('PK');expect(file.bytes.toString()).toContain('Geometry_');
});
test('mobile controls remain usable and no asset fetch happens from a fragment alone',async({page,context})=>{
 let requests=0;await context.route('https://never.example.org/**',r=>{requests++;r.abort();});await page.setViewportSize({width:390,height:844});
 await page.goto('/#url='+encodeURIComponent('https://never.example.org/model.glb'));await expect(page.locator('#model-url')).toHaveValue('https://never.example.org/model.glb');expect(requests).toBe(0);expect(page.url()).toBe(origin+'/');
 await page.screenshot({path:'test-results/mobile-entry.png',fullPage:true});
});
