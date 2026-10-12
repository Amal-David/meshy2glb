// Exact s-t cut for a binary Potts energy, up to floating-point tolerance.
// Iterative Dinic avoids recursion on large/long scene graphs. Bounded runtime
// falls back to ICM at the caller; a partial flow is never called an optimum.
export function binaryCut(unary, pairs, { maxSteps = 8000000 } = {}) {
  const n = unary.length;
  if (!n || n > 12000 || pairs.length > n * 8) throw new Error('Binary cut budget exceeded');
  const source = n, sink = n + 1, graph = Array.from({ length:n+2 }, () => []), arcs = [];
  const add = (from, to, cap, reverse = 0) => {
    const id = arcs.length; arcs.push({ to, cap }, { to:from, cap:reverse }); graph[from].push(id); graph[to].push(id+1);
  };
  unary.forEach(([zero, one], i) => { if (![zero,one].every(x=>Number.isFinite(x)&&x>=0)) throw new Error('Invalid cut cost'); add(source,i,one); add(i,sink,zero); });
  for (const [a,b,w] of pairs) { if (![a,b].every(x=>Number.isInteger(x)&&x>=0&&x<n)||a===b||!Number.isFinite(w)||w<0) throw new Error('Invalid cut edge'); add(a,b,w,w); }
  const level = new Int32Array(n+2), ptr = new Int32Array(n+2), queue = new Int32Array(n+2), epsilon = 1e-12;
  let steps = 0, flow = 0;
  const tick = () => { if (++steps > maxSteps) throw new Error('Binary cut operation budget reached'); };
  function bfs() {
    level.fill(-1);level[source]=0;let head=0,tail=1;queue[0]=source;
    while(head<tail){const v=queue[head++];for(const id of graph[v]){tick();const edge=arcs[id];if(edge.cap>epsilon&&level[edge.to]===-1){level[edge.to]=level[v]+1;queue[tail++]=edge.to;}}}
    return level[sink]!==-1;
  }
  while(bfs()) {
    ptr.fill(0);const nodes=[source],path=[];
    while(nodes.length) {
      tick();const v=nodes.at(-1);
      if(v===sink) {
        let delta=Infinity;for(const id of path)delta=Math.min(delta,arcs[id].cap);
        for(const id of path){arcs[id].cap-=delta;arcs[id^1].cap+=delta;}
        flow+=delta;nodes.length=1;path.length=0;continue;
      }
      let advanced=false;
      while(ptr[v]<graph[v].length){tick();const id=graph[v][ptr[v]],edge=arcs[id];if(edge.cap>epsilon&&level[edge.to]===level[v]+1){nodes.push(edge.to);path.push(id);advanced=true;break;}ptr[v]++;}
      if(!advanced){level[v]=-1;nodes.pop();path.pop();if(nodes.length)ptr[nodes.at(-1)]++;}
    }
  }
  // Residual source side is label 0; sink side label 1.
  const labels=new Uint8Array(n).fill(1);for(let i=0;i<n;i++)if(level[i]>=0)labels[i]=0;
  return {labels,flow,steps};
}
