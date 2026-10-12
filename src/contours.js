// Raster-label rectangle clipping with a shared-edge registry.
// Unlike a handful of UV probes, this enumerates every cell at the chosen raster
// resolution, including enclosed one-cell features. No claim below that resolution.
import { nearest, rgbToLab, srgbToLinear, linearToSrgb } from './paint-core.js';
const eps = 1e-10;
const quant = x => Math.round(x * 1e10) / 1e10;
function transformed(v, tex) { const [u, w] = v.uv, m = tex.matrix; return [m[0]*u+m[3]*w+m[6], (tex.flipY ? 1 : 0) + (tex.flipY ? -1 : 1)*(m[1]*u+m[4]*w+m[7])]; }
function clip(poly, axis, bound, sign) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = sign*(a.q[axis]-bound), db = sign*(b.q[axis]-bound), insideA = da >= -1e-12, insideB = db >= -1e-12;
    if (insideA) out.push(a);
    if (insideA !== insideB) {
      const t = da/(da-db), q = a.q.map((x,j) => x+(b.q[j]-x)*t); q[axis] = bound;
      out.push({ q, bary: a.bary.map((x,j) => x+(b.bary[j]-x)*t) });
    }
  }
  return out.filter((p,i) => !i || Math.hypot(...p.q.map((v,j) => v-out[i-1].q[j])) > 1e-12);
}
function rectangles(labels, width, height) {
  const rects = [], rows = Array.from({ length: height }, () => []); let previous = new Map();
  for (let y=0; y<height; y++) {
    const current = new Map();
    for (let x=0; x<width;) {
      const start=x, color=labels[y*width+x]; while(x<width && labels[y*width+x]===color) x++;
      const key=`${start}:${x}:${color}`; let id=previous.get(key);
      if (id == null) { id=rects.length; rects.push({ x0:start, x1:x, y0:y, y1:y+1, color }); } else rects[id].y1=y+1;
      current.set(key,id); rows[y].push(id);
    }
    previous=current;
  }
  return { rects, rows };
}
export function traceTextureSurface(input, materials, palette, { resolution = 128, maxTriangles = 150000 } = {}) {
  if (!Number.isInteger(resolution) || resolution < 8 || resolution > 512) throw new Error('Trace resolution must be 8–512');
  const labPalette=palette.map(rgbToLab), caches=new Map(), groups=new Map(); let pixelBudget=0;
  for(const t of input) {
    const mat=materials[t.material], tex=mat?.texture;
    const qs=tex?t.v.map(v=>transformed(v,tex)):[];
    const uvArea=tex?Math.abs((qs[1][0]-qs[0][0])*(qs[2][1]-qs[0][1])-(qs[1][1]-qs[0][1])*(qs[2][0]-qs[0][0])):0;
    const eligible=!!tex && uvArea>1e-14 && t.v.every(v => v.linear.every((c,j)=>Math.abs(c-t.v[0].linear[j])<1e-12)) && t.v.every(v=>transformed(v,tex).every(c=>c>=-eps&&c<=1+eps));
    groups.set(t.group,(groups.get(t.group)??true)&&eligible);
  }
  const polys=[], fallback=[], registry=new Map(); let traced=0, regions=0, work=0;
  const pkey=(v,g)=>`${g}|${v.p.join(',')}`;
  const addMark=(key,value)=>{ const set=registry.get(key)??new Set(); set.add(quant(value)); registry.set(key,set); };
  function edge(t, face, a, b) {
    const zero=[0,1,2].find(j=>Math.abs(a.bary[j])<eps && Math.abs(b.bary[j])<eps);
    if(zero!==undefined) {
      const i=(zero+1)%3,j=(zero+2)%3, ka=pkey(t.v[i],t.group),kb=pkey(t.v[j],t.group), forward=ka<kb;
      return { key:forward?`${ka}/${kb}`:`${kb}/${ka}`, a:forward?a.bary[j]:a.bary[i], b:forward?b.bary[j]:b.bary[i] };
    }
    const axis=Math.abs(a.q[0]-b.q[0])<eps?0:1;
    return { key:`face:${face}:${axis}:${quant(a.q[axis])}`, a:a.q[1-axis], b:b.q[1-axis] };
  }
  input.forEach((t,face)=>{
    if(!groups.get(t.group)) { fallback.push(t); return; }
    const mat=materials[t.material],tex=mat.texture, q=t.v.map(v=>transformed(v,tex));
    const determinant=(q[1][0]-q[0][0])*(q[2][1]-q[0][1])-(q[1][1]-q[0][1])*(q[2][0]-q[0][0]);
    // Zero-area UVs carry a constant sample, not a drawable footprint.
    if(Math.abs(determinant)<1e-14) { fallback.push(t); return; }
    const key=`${t.material}|${t.v[0].linear.join(',')}`; let cache=caches.get(key);
    if(!cache) {
      const w=Math.min(resolution,tex.width),h=Math.max(1,Math.round(tex.height*w/tex.width));
      if((pixelBudget+=w*h)>1048576) throw new Error('Contour raster budget exceeded; lower detail');
      const labels=new Uint8Array(w*h);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const px=Math.min(tex.width-1,Math.floor((x+0.5)*tex.width/w)),py=Math.min(tex.height-1,Math.floor((y+0.5)*tex.height/h)),at=(py*tex.width+px)*4;
        if(tex.data[at+3]<253) throw new Error('Opaque paint tracing cannot process transparency');
        const rgb=[0,1,2].map(c=>linearToSrgb((tex.srgb?srgbToLinear(tex.data[at+c]/255):tex.data[at+c]/255)*mat.linear[c]*t.v[0].linear[c]));
        labels[y*w+x]=nearest(rgbToLab(rgb),labPalette);
      }
      cache={...rectangles(labels,w,h),w,h}; caches.set(key,cache); regions+=cache.rects.length;
    }
    const {w,h,rects,rows}=cache, minY=Math.max(0,Math.floor(Math.min(...q.map(p=>p[1]))*h)),maxY=Math.min(h-1,Math.floor(Math.max(...q.map(p=>p[1]))*h));
    const minX=Math.min(...q.map(p=>p[0]))*w,maxX=Math.max(...q.map(p=>p[0]))*w, ids=new Set();
    for(let y=minY;y<=maxY;y++) for(const id of rows[y]) { if(++work>5000000) throw new Error('Contour intersection budget exceeded; lower detail'); const r=rects[id]; if(r.x1>=minX&&r.x0<=maxX) ids.add(id); }
    for(const id of ids) {
      const r=rects[id]; let poly=q.map((p,i)=>({q:p,bary:[+(i===0),+(i===1),+(i===2)]}));
      for(const [a,b,s] of [[0,r.x0/w,1],[0,r.x1/w,-1],[1,r.y0/h,1],[1,r.y1/h,-1]]) { poly=clip(poly,a,b,s); if(poly.length<3) break; }
      if(poly.length<3) continue;
      if(Math.hypot(...poly[0].q.map((v,j)=>v-poly.at(-1).q[j]))<1e-12) poly.pop();
      const signed=poly.reduce((s,p,i)=>s+p.q[0]*poly[(i+1)%poly.length].q[1]-p.q[1]*poly[(i+1)%poly.length].q[0],0);
      if(Math.abs(signed)<1e-16) continue;
      if(polys.length>=maxTriangles) throw new Error('Contour output budget exceeded; lower detail');
      for(let i=0;i<poly.length;i++) { const e=edge(t,face,poly[i],poly[(i+1)%poly.length]); addMark(e.key,e.a); addMark(e.key,e.b); }
      polys.push({t,face,poly,label:r.color});
    }
    traced++;
  });
  const sorted=new Map([...registry].map(([key,values])=>[key,[...values].sort((a,b)=>a-b)]));
  // Position snapping is relative to model extent, only for numerical edge equality.
  const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(const t of input) for(const v of t.v) v.p.forEach((p,j)=>{lo[j]=Math.min(lo[j],p);hi[j]=Math.max(hi[j],p);});
  const step=Math.max(...hi.map((p,j)=>p-lo[j]),1e-6)*1e-12, snap=(x,j)=>Math.round((x-lo[j])/step)*step+lo[j];
  const output=[];
  for(const {t,face,poly,label} of polys) {
    const ring=[];
    for(let i=0;i<poly.length;i++) {
      const a=poly[i],b=poly[(i+1)%poly.length],e=edge(t,face,a,b); ring.push(a);
      if(Math.abs(e.b-e.a)<1e-12) continue;
      let marks=sorted.get(e.key).filter(v=>v>Math.min(e.a,e.b)+eps&&v<Math.max(e.a,e.b)-eps); if(e.b<e.a) marks=marks.reverse();
      for(const mark of marks) { const f=(mark-e.a)/(e.b-e.a); ring.push({q:a.q.map((v,j)=>v+(b.q[j]-v)*f),bary:a.bary.map((v,j)=>v+(b.bary[j]-v)*f)}); }
    }
    const vertex=p=>({p:[0,1,2].map(j=>snap(p.bary.reduce((s,v,i)=>s+v*t.v[i].p[j],0),j)),uv:[0,1].map(j=>p.bary.reduce((s,v,i)=>s+v*t.v[i].uv[j],0)),linear:[0,1,2].map(j=>p.bary.reduce((s,v,i)=>s+v*t.v[i].linear[j],0))});
    if(ring.length===3) output.push({...t,v:ring.map(vertex),paintLabel:label});
    else { const center={bary:[0,1,2].map(j=>ring.reduce((s,p)=>s+p.bary[j]/ring.length,0))},c=vertex(center); for(let i=0;i<ring.length;i++) output.push({...t,v:[c,vertex(ring[i]),vertex(ring[(i+1)%ring.length])],paintLabel:label}); }
    if(output.length+fallback.length>maxTriangles) throw new Error('Conforming paint mesh exceeds 150k triangles; lower detail');
  }
  return { triangles:output, fallback, report:{tracedFaces:traced,fallbackFaces:fallback.length,rectangles:regions,resolution,positionSnap:step} };
}
