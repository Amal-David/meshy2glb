import { meshyToGlb } from './decrypt.js';
import { decompressGlb } from './decompress.js';
import { MeshoptDecoder } from 'https://unpkg.com/three@0.169.0/examples/jsm/libs/meshopt_decoder.module.js';
self.onmessage = async ({ data }) => {
  try { const result = await decompressGlb(await meshyToGlb(data.buffer), MeshoptDecoder); self.postMessage({ result }, [result]); }
  catch (error) { self.postMessage({ error: error.message }); }
};
