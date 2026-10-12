import test from 'node:test';
import assert from 'node:assert/strict';
import { writeGlb, parseGlb, geometryGlb, asBuffer } from '../../src/glb.js';
import { meshyToGlb, isMeshyFile, isGlbFile } from '../../src/decrypt.js';
import { decompressGlb } from '../../src/decompress.js';
import { safeUrl, classifyUrl, chooseMeshyAsset, fetchBytes, importUrl, resourceIndex } from '../../src/input.js';
const json = { asset: { version: '2.0' }, buffers: [{ byteLength: 3 }] };
for (const length of [1,2,3,4,5,17,100]) test(`GLB bin alignment ${length}`, () => {
  const bytes = new Uint8Array(length).fill(13), output = writeGlb({ ...json, buffers: [{ byteLength: length }] }, bytes);
  assert.equal(output.byteLength % 4,0); assert.equal(new DataView(output).getUint32(8,true),output.byteLength); assert.deepEqual(parseGlb(output).bin.slice(0,length),bytes);
});
test('GLB input rejects truncation, wrong version and length',()=>{
  const buffer=writeGlb(json,new Uint8Array(3)); assert.throws(()=>parseGlb(buffer.slice(0,-1)));
  const wrong=buffer.slice(0);new DataView(wrong).setUint32(4,3,true);assert.throws(()=>parseGlb(wrong));
});
test('offset typed arrays do not expose unrelated bytes',()=>{
  const a=new Uint8Array([99,1,2,3,99]);assert.deepEqual([...new Uint8Array(asBuffer(a.subarray(1,4)))],[1,2,3]);
});
test('geometry export validates finite coordinates and indices',()=>{
  const mesh={positions:[0,0,0,1,0,0,0,1,0],indices:[0,1,2]};const doc=parseGlb(geometryGlb([mesh])).json;assert.equal(doc.meshes[0].primitives[0].mode,4);
  assert.throws(()=>geometryGlb([{...mesh,indices:[0,1,3]}]));assert.throws(()=>geometryGlb([{positions:[NaN,0,0]}]));
});
test('meshopt default offset, metadata and trailing padding are retained',async()=>{
  const doc={asset:{version:'2.0'},buffers:[{byteLength:3},{byteLength:3}],bufferViews:[{buffer:1,byteOffset:0,byteLength:3,name:'keep',extras:{hello:1},extensions:{EXT_meshopt_compression:{buffer:0,count:3,byteStride:1,byteLength:3,mode:'ATTRIBUTES'},MY_extra:{keep:true}}}],extensionsRequired:['EXT_meshopt_compression'],extensionsUsed:['EXT_meshopt_compression','MY_extra']};
  const decoder={ready:Promise.resolve(),decodeGltfBuffer:(target,count,stride,src)=>target.set(src)};
  const out=await decompressGlb(writeGlb(doc,new Uint8Array([1,2,3])),decoder), parsed=parseGlb(out);
  assert.deepEqual([...parsed.bin.slice(0,3)],[1,2,3]);assert.equal(out.byteLength%4,0);assert.equal(parsed.json.bufferViews[0].name,'keep');assert.deepEqual(parsed.json.bufferViews[0].extras,{hello:1});assert.ok(parsed.json.bufferViews[0].extensions.MY_extra);assert.equal(parsed.json.extensionsRequired,undefined);
});
test('meshopt rejects unsafe allocations and external source buffers',async()=>{
  const d={asset:{version:'2.0'},buffers:[{byteLength:4}],bufferViews:[{buffer:0,byteLength:1,extensions:{EXT_meshopt_compression:{buffer:0,count:1e12,byteStride:4,byteLength:4,mode:'ATTRIBUTES'}}}]};
  const decoder={ready:Promise.resolve(),decodeGltfBuffer:()=>assert.fail('decoder must not be called')}; await assert.rejects(()=>decompressGlb(writeGlb(d,new Uint8Array(4)),decoder));
  d.buffers[0].uri='https://example.com/model.bin';await assert.rejects(()=>decompressGlb(writeGlb(d,new Uint8Array(4)),decoder),/external/);
});
test('real WebCrypto synthetic Meshy v1 round trip',async()=>{
  const plain=writeGlb({asset:{version:'2.0'},buffers:[{byteLength:9000}]},new Uint8Array(9000).fill(7)), raw=new Uint8Array(plain);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('JSON{"accessors":[{"bufferView":'),'AES-CTR',false,['encrypt']);
  const nonce=crypto.getRandomValues(new Uint8Array(12)), counter=new Uint8Array(16);counter.set(nonce);counter[15]=2;
  const ciphertext=await crypto.subtle.encrypt({name:'AES-CTR',counter,length:32},key,raw.subarray(0,8192));
  const wrapped=new Uint8Array(raw.length+48);wrapped.set(new TextEncoder().encode('MESHY.AI'));new DataView(wrapped.buffer).setUint16(8,1,true);wrapped.set(nonce,10);wrapped.set(new Uint8Array(ciphertext),32);wrapped.set(raw.subarray(8192),8240);
  assert.ok(isMeshyFile(wrapped));assert.deepEqual(new Uint8Array(await meshyToGlb(wrapped)),raw);wrapped[8]=2;await assert.rejects(()=>meshyToGlb(wrapped),/version/);
});
test('bad magic detection is safe',()=>{assert.equal(isMeshyFile(null),false);assert.equal(isGlbFile(new Uint8Array([1])),false);});
for(const url of ['javascript:alert(1)','http://example.com/a.glb','https://u:p@example.com/a.glb','https://127.0.0.1/a','https://[::1]/a','https://localhost/a','https://server.local/a']) test(`reject URL ${url}`,()=>assert.throws(()=>safeUrl(url)));
test('Meshy URL classification is host/path constrained',()=>{
  assert.equal(classifyUrl('https://www.meshy.ai/3d-models/model-01a07364-c97c-73b8-9225-95a0b97f4ccc').kind,'meshy-page');
  assert.equal(classifyUrl('https://meshy.ai.evil.example/3d-models/model-01a07364-c97c-73b8-9225-95a0b97f4ccc').kind,'asset');
  assert.throws(()=>classifyUrl('https://www.meshy.ai/workspace'));assert.throws(()=>classifyUrl('https://www.meshy.ai/3d-models/no-id'));
});
test('Meshy metadata chooses textured source without adding credentials',()=>{
  const data={code:'OK',result:{result:{texture:{modelUrl:'https://assets.example/model.meshy'},generate:{modelUrl:'https://assets.example/raw.meshy'}}}};assert.equal(chooseMeshyAsset(data),'https://assets.example/model.meshy');assert.throws(()=>chooseMeshyAsset({code:'DENIED'}));
});
test('bounded fetch omits credentials and rejects streamed overflow',async()=>{
  let options;const fetchImpl=async(u,o)=>{options=o;return new Response(new Uint8Array([1,2,3,4]));};
  const result=await fetchBytes('https://example.com/model.glb',{fetchImpl});assert.equal(result.buffer.byteLength,4);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
  await assert.rejects(()=>fetchBytes('https://example.com/model.glb',{fetchImpl,limit:3}),/budget/);
});
test('network/CORS errors are actionable; aborted imports stop',async()=>{
  await assert.rejects(()=>fetchBytes('https://example.com/a.glb',{fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),/Asset Lens/);
  const c=new AbortController();c.abort();await assert.rejects(()=>fetchBytes('https://example.com/a.glb',{signal:c.signal,fetchImpl:async(u,o)=>{if(o.signal.aborted)throw new Error('aborted');return new Response('');}}),/cancelled/);
});
test('Meshy URL import uses metadata then asset, and never a proxy',async()=>{
  const calls=[];const fetchImpl=async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');return calls.length===1?Response.json({code:'OK',result:{result:{texture:{modelUrl:'https://assets.example/model.meshy'}}}}):new Response(new Uint8Array([1,2]));};
  const result=await importUrl('https://www.meshy.ai/3d-models/model-01a07364-c97c-73b8-9225-95a0b97f4ccc',{fetchImpl});assert.equal(calls.length,2);assert.match(calls[0],/^https:\/\/www\.meshy\.ai\/meshyd-api\/web\/public/);assert.equal(result.name,'model.meshy');
});
test('companion resolver preserves folders and refuses basename collisions',()=>{
  const a={name:'base.png',webkitRelativePath:'pack/a/base.png'},b={name:'base.png',webkitRelativePath:'pack/b/base.png'}, get=resourceIndex([a,b]);
  assert.equal(get('a/base.png','pack/'),a);assert.equal(get('b/base.png','pack/'),b);assert.throws(()=>get('base.png'),/Ambiguous/);assert.throws(()=>get('../secret'),/escapes/);assert.throws(()=>get('missing.png'),/Missing/);
});
