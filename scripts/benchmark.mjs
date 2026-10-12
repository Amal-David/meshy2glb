import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto'; import vm from 'node:vm';
import { optimizeLabels, rgbToLab, nearest, gridEdges } from '../src/paint-core.js';
const source = readFileSync(new URL('../tests/reference/texture-processing-worker.js', import.meta.url));
const hash = createHash('sha1').update(`blob ${source.length}\0`).update(source).digest('hex');
if (hash !== '1cfbb248c33ece62c06a717a9d03e745868099bd') throw new Error('Reference worker differs from the reviewed upstream blob');
let received; const self = { postMessage: data => received = new Uint8Array(data.labels) };
vm.runInNewContext(source.toString(), { self, Uint8Array, Int32Array });
const width = 64, height = 64, edges = gridEdges(width,height), rows = [];
function random(seed) { return () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296; }; }
const cases = ['small-authored-details','near-threshold-noise','impulse-noise-control'];
const methods = [ ['upstream-off',0,0], ['upstream-smooth-1',0,1], ['upstream-despeckle-8-smooth-1',8,1], ['contrast-aware',0,0] ];
for (const family of cases) for (let seed = 1; seed <= 20; seed++) {
  const rand = random(seed), palette = family === 'near-threshold-noise' ? [[.45,.45,.45],[.55,.55,.55]] : [[0,0,0],[1,1,1]];
  const truth = new Uint8Array(width*height).fill(1), detail = new Set(), colors = [];
  if (family === 'small-authored-details') {
    for (let i=0;i<32;i++) { const at=(3+Math.floor(rand()*58))*width+3+Math.floor(rand()*58); truth[at]=0;detail.add(at); }
    // A narrow authored line is also a real feature, not noise.
    for(let y=12;y<48;y++){const at=y*width+24;truth[at]=0;detail.add(at);}
  }
  if (family === 'near-threshold-noise') for(let y=0;y<height;y++)for(let x=0;x<width;x++) truth[y*width+x]=x<32?0:1;
  for(let i=0;i<truth.length;i++) {
    if(family === 'near-threshold-noise') {const v=(truth[i]===0?.47:.53)+(rand()-.5)*.09;colors.push([v,v,v]);}
    else if(family === 'impulse-noise-control') colors.push(rand()<.03?[0,0,0]:[1,1,1]);
    else colors.push(palette[truth[i]].slice());
  }
  const labs = palette.map(rgbToLab), input = Uint8Array.from(colors, c=>nearest(rgbToLab(c), labs));
  for(const [method,despeckleSize,smoothLevel] of methods) {
    let labels, energies;const start=performance.now();
    if(method==='contrast-aware'){const out=optimizeLabels(colors,palette,edges,{strength:.35,sigma:.075,passes:6});labels=out.labels;energies=out.energies;}
    else{self.onmessage({data:{id:1,width,height,numColors:palette.length,labels:input.slice().buffer,despeckleSize,smoothLevel}});labels=received;}
    const ms=performance.now()-start;let errors=0,hits=0;for(let i=0;i<labels.length;i++){if(labels[i]!==truth[i])errors++;if(detail.has(i)&&labels[i]===truth[i])hits++;}
    rows.push({family,seed,method,errorRate:errors/truth.length,detailRecall:detail.size?hits/detail.size:null,ms,energyNonIncreasing:energies?energies.every((e,i)=>i===0||e<=energies[i-1]+1e-8):null});
  }
}
const summary=cases.flatMap(family=>methods.map(([method])=>{const r=rows.filter(r=>r.family===family&&r.method===method);return {family,method,labelErrorPercent:100*r.reduce((s,r)=>s+r.errorRate,0)/r.length,detailRecallPercent:r[0].detailRecall==null?null:100*r.reduce((s,r)=>s+r.detailRecall,0)/r.length,meanMs:r.reduce((s,r)=>s+r.ms,0)/r.length};}));
const report={reference:{repository:'EllsworOpan/Texture2Paint',commit:'1adffeba84982dc14bb9ca0a9e194669cd976714',workerBlob:hash},scope:'Cleanup-stage synthetic benchmark, 20 deterministic seeds per family, 64×64 labels, identical fixed palettes and initial labels. Not a full product, palette-fitting, slicer or print-quality benchmark.',limitations:['Upstream cleanup disabled is a baseline, not an error.','Our method sees source colors; the upstream cleanup stage only accepts quantized labels. That is the tested design difference.','High-contrast semantic features and high-contrast impulse noise are indistinguishable without additional information.','CPU runtimes are host-dependent and include their distinct cleanup work.'],summary,rows};
mkdirSync(new URL('../docs/',import.meta.url),{recursive:true});writeFileSync(new URL('../docs/benchmark.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.table(summary);if(rows.some(r=>r.energyNonIncreasing===false))throw new Error('Energy increased');
