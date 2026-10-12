import test from 'node:test';import assert from 'node:assert/strict';
import { rgbToLab,labToRgb,fitPalette,optimizeLabels,gridEdges } from '../../src/paint-core.js';
import { refineSurface,area,surfaceGraph,paintSurface,sampleMaterial } from '../../src/surface.js';
import { traceTextureSurface } from '../../src/contours.js';
const vertex=(x,y,u=x,v=y)=>({p:[x,y,0],uv:[u,v],linear:[1,1,1]});
const square=()=>[{v:[vertex(0,0),vertex(1,0),vertex(0,1)],group:'a',material:0},{v:[vertex(1,0),vertex(1,1),vertex(0,1)],group:'a',material:0}];
const texture=(n=16)=>({width:n,height:n,data:new Uint8ClampedArray(n*n*4).fill(255),matrix:[1,0,0,0,1,0,0,0,1],wrapS:1001,wrapT:1001,flipY:false,srgb:true,nearest:true});
test('Oklab round-trips representative RGB colors',()=>{for(const c of [[0,0,0],[1,1,1],[1,0,0],[0.2,0.6,0.8]]){const out=labToRgb(rgbToLab(c));out.forEach((v,i)=>assert.ok(Math.abs(v-c[i])<2e-6));}});
test('palette fitting is deterministic and area-sensitive',()=>{
 const colors=[[1,0,0],[0,0,1],[0,1,0]],weights=[100,10,0.01];assert.deepEqual(fitPalette(colors,weights,2),fitPalette(colors,weights,2));assert.throws(()=>fitPalette(colors,[1],2));
});
test('cleanup energy is non-increasing at every sweep',()=>{
 const colors=Array.from({length:64},(_,i)=>[0.5+(i%5-2)*0.015,0.5,0.5]),r=optimizeLabels(colors,[[.35,.35,.35],[.65,.65,.65]],gridEdges(8,8));
 r.energies.forEach((e,i)=>{if(i)assert.ok(e<=r.energies[i-1]+1e-9);});
});
test('cleanup preserves a high-contrast one-pixel feature',()=>{
 const colors=Array.from({length:25},(_,i)=>i===12?[0,0,0]:[1,1,1]),r=optimizeLabels(colors,[[0,0,0],[1,1,1]],gridEdges(5,5),{strength:1});assert.equal(r.labels[12],0);assert.equal(r.labels.filter(v=>v===0).length,1);
});
test('no cleanup crosses disconnected graph components',()=>{
 const r=optimizeLabels([[.1,.1,.1],[.9,.9,.9]],[[0,0,0],[1,1,1]],[]);assert.deepEqual([...r.labels],[0,1]);
});
test('red-green refinement preserves area and shared-edge conformity',()=>{
 const input=square(),r=refineSurface(input,v=>v.uv[0]<.35?[0,0,0]:[1,1,1],[[0,0,0],[1,1,1]],{levels:2});assert.ok(r.triangles.length>2);assert.ok(Math.abs(r.triangles.reduce((s,t)=>s+area(t),0)-1)<1e-10);assert.equal(surfaceGraph(r.triangles).nonManifoldEdges,0);
});
test('refinement budget does not leave a half-split surface',()=>{
 const r=refineSurface(square(),v=>v.uv[0]<.4?[0,0,0]:[1,1,1],[[0,0,0],[1,1,1]],{levels:3,maxTriangles:3});assert.equal(r.budgetReached,true);assert.equal(r.triangles.length,2);
});
test('material sampling applies linear material/vertex factors, texture transforms and flip',()=>{
 const tex=texture(2);tex.data.set([255,0,0,255],0);tex.data.set([0,0,255,255],8);const m={linear:[1,1,1],texture:tex};assert.deepEqual(sampleMaterial(vertex(0,0),m).map(v=>Math.round(v)),[1,0,0]);tex.flipY=true;assert.deepEqual(sampleMaterial(vertex(0,0),m).map(v=>Math.round(v)),[0,0,1]);
});
test('contour tracing preserves enclosed feature missed by seven UV probes',()=>{
 const tex=texture(16);tex.data.set([0,0,0,255],(5*16+6)*4);const out=traceTextureSurface(square(),[{linear:[1,1,1],texture:tex}],[[1,1,1],[0,0,0]],{resolution:16});
 assert.ok(out.triangles.some(t=>t.paintLabel===1));assert.ok(Math.abs(out.triangles.reduce((s,t)=>s+area(t),0)-1)<1e-8);assert.equal(out.fallback.length,0);
 const black=out.triangles.filter(t=>t.paintLabel===1).reduce((s,t)=>s+area(t),0);assert.ok(Math.abs(black-1/256)<1e-8);
});
test('contour mesh has no hanging interior edges on an opaque texture island',()=>{
 const tex=texture(16);for(let y=5;y<8;y++)for(let x=6;x<9;x++)tex.data.set([0,0,0,255],(y*16+x)*4);
 const r=traceTextureSurface(square(),[{linear:[1,1,1],texture:tex}],[[1,1,1],[0,0,0]],{resolution:16});
 const edges=new Map();for(const t of r.triangles)for(let e=0;e<3;e++){const a=t.v[e].p,b=t.v[(e+1)%3].p,k=[a.join(','),b.join(',')].sort().join('|');const record=edges.get(k)??{n:0,a,b};record.n++;edges.set(k,record);}
 for(const {n,a,b} of edges.values()){assert.ok(n<=2);if(n===1)assert.ok((a[0]===0&&b[0]===0)||(a[0]===1&&b[0]===1)||(a[1]===0&&b[1]===0)||(a[1]===1&&b[1]===1),`hanging edge ${a} to ${b}`);}
});
test('paint pipeline finds sub-face colors when building a palette',()=>{
 const tex=texture(16);tex.data.set([0,0,0,255],(5*16+6)*4);const r=paintSurface(square(),[{linear:[1,1,1],texture:tex}],{count:2,levels:1,strength:.35});assert.equal(r.palette.length,2);assert.ok(r.labels.includes(0)&&r.labels.includes(1));assert.ok(r.report.trace.tracedFaces>0);
});
test('negative/invalid cleanup settings are rejected',()=>{assert.throws(()=>optimizeLabels([[0,0,0]],[[0,0,0]],[],{sigma:0}));assert.throws(()=>optimizeLabels([[0,0,0]],[[0,0,0]],[[0,2]]));});
import { binaryCut } from '../../src/binary-cut.js';
test('binary cut matches exhaustive enumeration on small graphs',()=>{
 for(let seed=1;seed<=30;seed++){
  const unary=Array.from({length:5},(_,i)=>[((i+3)*seed%11)/9,((i+8)*seed%13)/8]),pairs=[[0,1,.4],[1,2,.8],[2,3,.2],[3,4,1],[0,4,.7]];
  const energy=labels=>unary.reduce((s,c,i)=>s+c[labels[i]],0)+pairs.reduce((s,[a,b,w])=>s+(labels[a]===labels[b]?0:w),0);
  let best=Infinity;for(let mask=0;mask<32;mask++)best=Math.min(best,energy(Array.from({length:5},(_,i)=>(mask>>i)&1)));
  const result=binaryCut(unary,pairs);assert.ok(Math.abs(energy(result.labels)-best)<1e-9);assert.ok(Math.abs(result.flow-best)<1e-9);
 }
});
test('operation-limited cut throws rather than certifying a partial optimum',()=>assert.throws(()=>binaryCut([[1,2],[2,1]],[[0,1,1]],{maxSteps:1}),/operation budget/));
