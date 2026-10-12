import { paintSurface } from './surface.js';
self.onmessage = ({ data }) => {
  try { const result = paintSurface(data.triangles, data.materials, data.options); self.postMessage({ result }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
