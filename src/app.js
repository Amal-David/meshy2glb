import * as THREE from 'three';
import { Viewer, disposeObject } from './viewer.js';
import { FORMATS, extension, importUrl } from './input.js';
import { loadModel } from './model-loader.js';
import { workerJob } from './jobs.js';
import { makePaintInput, paintedScene } from './paint-adapter.js';
import { exportModel, download, formatNotes } from './export.js';

const $ = id => document.getElementById(id);
let viewer, asset = null, painted = null, paintRoot = null, generation = 0, controller = null, exportBusy = false, working = false;
function status(message, kind = '') { $('status-text').textContent = message; $('status').dataset.kind = kind; }
try { viewer = new Viewer({ container: $('viewport') }); }
catch { status('WebGL could not start. Try a browser with hardware acceleration enabled.', 'error'); }
function busy(value) {
  working = value; $('cancel-btn').hidden = !value; $('download-btn').disabled = value || exportBusy; $('paint-btn').disabled = value || exportBusy; $('repaint-btn').disabled = value || exportBusy;
}
async function job(action) {
  if (!viewer) return;
  if (exportBusy) { status('Finish the current export before opening or processing another model.', 'error'); return; }
  controller?.abort(); const token = ++generation, current = new AbortController(); controller = current; busy(true);
  try { await action(current.signal, () => token === generation); }
  catch (error) { if (token === generation) status(error.message || 'The operation failed', 'error'); }
  finally { if (token === generation) { busy(false); controller = null; } }
}
function cleanPaint() { if (paintRoot) disposeObject(paintRoot); painted = null; paintRoot = null; $('palette').replaceChildren(); $('paint-report').textContent = ''; $('repaint-btn').hidden = true; $('original-btn').disabled = true; $('export-content').options[1].disabled = true; }
function commit(next) {
  viewer.loadObject(next.object);
  if (asset) { asset.resources.dispose(); disposeObject(asset.object); }
  cleanPaint(); asset = next;
  $('empty').hidden = true;
  for (const id of ['view-tools', 'paint-tools', 'export-tools']) $(id).hidden = false;
  $('model-info').textContent = `${next.name} · ${next.type.toUpperCase()} · ${next.triangles.toLocaleString()} triangles`;
  $('animation').replaceChildren(new Option('Stopped', ''));
  (next.animations ?? []).forEach((c, i) => $('animation').add(new Option(`${c.name || `Clip ${i + 1}`} · ${c.duration.toFixed(1)} s`, String(i))));
  $('animation-row').hidden = !next.animations?.length;
  $('export-content').value = 'original'; $('format-select').value = 'glb'; updateExport();
  status('Model ready. Original source and preview are kept separate.', 'success');
}
async function openFiles(fileList) {
  const files = Array.from(fileList), models = files.filter(f => FORMATS.has(extension(f.name)));
  if (!models.length) { status('No supported model found. Include the model as well as its companion files.', 'error'); return; }
  const primary = models[0];
  await job(async (signal, current) => {
    status(`Opening ${primary.name}…`);
    const next = await loadModel({ buffer: await primary.arrayBuffer(), name: primary.name, primaryFile: primary, files, signal });
    if (!current()) { next.resources.dispose(); disposeObject(next.object); return; }
    commit(next);
    if (models.length > 1) status(`Opened ${primary.name}. This is a single-model tool; ${models.length - 1} other model files were not opened.`, 'success');
  });
}
$('open-btn').onclick = () => $('picker').click(); $('folder-btn').onclick = () => $('folder-picker').click();
for (const id of ['picker', 'folder-picker']) $(id).onchange = () => { openFiles($(id).files); $(id).value = ''; };
$('url-form').onsubmit = event => { event.preventDefault(); openUrl($('model-url').value); };
async function openUrl(text) {
  await job(async (signal, current) => {
    status('Resolving model URL…');
    const input = await importUrl(text, { signal, progress: bytes => { if (current()) status(`Downloading model: ${(bytes / 1048576).toFixed(1)} MiB…`); } });
    const next = await loadModel({ ...input, signal });
    if (!current()) { next.resources.dispose(); disposeObject(next.object); return; }
    commit(next);
  });
}
$('cancel-btn').onclick = () => { controller?.abort(); ++generation; controller = null; busy(false); status('Cancelled'); };
let dragDepth = 0;
addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; $('drop-overlay').hidden = false; });
addEventListener('dragover', event => event.preventDefault());
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('drop-overlay').hidden = true; } });
addEventListener('drop', event => {
  event.preventDefault(); dragDepth = 0; $('drop-overlay').hidden = true;
  if (event.dataTransfer.files.length) openFiles(event.dataTransfer.files);
  else { const text = (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')).split('\n').find(s => s.trim() && !s.startsWith('#'))?.trim(); if (text) { $('model-url').value = text; openUrl(text); } }
});
// A handoff URL may prefill the form, but never initiates network access itself.
try { const text = new URLSearchParams(location.hash.slice(1)).get('url'); if (text) { $('model-url').value = text; history.replaceState(null, '', location.pathname + location.search); status('Link received. Review the URL, then click Open URL.'); } } catch { /* An invalid fragment is not an import. */ }
for (const [id, method] of [['exposure','setExposure'], ['environment','setEnvIntensity'], ['direct','setDirectLight'], ['ambient','setAmbientLight']]) $(id).oninput = e => viewer?.[method](Number(e.target.value));
$('background').onchange = e => viewer?.setBackground(e.target.value);
for (const [id, method] of [['wireframe','setWireframe'], ['rotate','setAutoRotate']]) $(id).onclick = () => { const on = $(id).getAttribute('aria-pressed') !== 'true'; $(id).setAttribute('aria-pressed', String(on)); viewer?.[method](on); };
$('reset').onclick = () => viewer?.resetCamera();
$('animation').onchange = e => { if (asset) { viewer.loadObject(asset.object); viewer.play(e.target.value === '' ? null : asset.animations[Number(e.target.value)]); } };
function paletteInputs() { return [...$('palette').querySelectorAll('input')].map(i => [1,3,5].map(at => parseInt(i.value.slice(at, at + 2), 16) / 255)); }
async function generatePaint(usePalette = false) {
  if (!asset) return;
  const source = asset;
  await job(async (signal, current) => {
    status('Reading authored textures from the original pose…');
    await new Promise(resolve => requestAnimationFrame(resolve));
    const input = makePaintInput(source.object), customPalette = usePalette ? paletteInputs() : undefined;
    status('Tracing color boundaries and optimizing paint labels…');
    const result = await workerJob('./paint-worker.js', { ...input, options: { count: Number($('color-count').value), levels: Number($('paint-detail').value), strength: Number($('cleanup').value), palette: customPalette } }, { signal });
    if (!current() || asset !== source) return;
    const next = paintedScene(result); viewer.loadObject(next); cleanPaint(); painted = result; paintRoot = next;
    result.palette.forEach((color, i) => { const swatch = document.createElement('input'); swatch.type = 'color'; swatch.value = '#' + color.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join(''); swatch.setAttribute('aria-label', `Palette color ${i + 1}`); $('palette').append(swatch); });
    $('repaint-btn').hidden = false; $('original-btn').disabled = false; $('export-content').options[1].disabled = false; $('export-content').value = 'painted'; $('animation').value = ''; updateExport();
    const r = result.report;
    $('paint-report').textContent = `${result.palette.length} colors · ${r.inputTriangles.toLocaleString()} → ${r.outputTriangles.toLocaleString()} triangles. Cleanup applied ${r.changed} label updates (${r.solver}). ${r.trace?.tracedFaces ?? 0} source faces traced; ${r.trace?.fallbackFaces ?? 0} use sampled refinement. ${r.budgetReached || r.sampleBudgetReached ? 'A processing budget was reached; inspect detail carefully.' : ''}`;
    status('Paint snapshot ready. Preview it before exporting; original data is unchanged.', 'success');
  });
}
$('paint-btn').onclick = () => generatePaint(); $('repaint-btn').onclick = () => generatePaint(true);
$('original-btn').onclick = () => { if (asset) viewer.loadObject(asset.object); };
function updateExport() {
  const mode = $('export-content').value, format = $('format-select').value;
  $('scale-row').hidden = format !== '3mf';
  $('export-note').textContent = mode === 'geometry' ? 'Visible displayed geometry at the current pose, baked into world space. GLB only; textures, normals, rigs and animation are not retained.' : formatNotes[format];
  for (const option of $('format-select').options) option.disabled = (mode === 'geometry' && option.value !== 'glb') || (option.value === '3mf' && mode !== 'painted');
  if ($('format-select').selectedOptions[0]?.disabled) { $('format-select').value = 'glb'; updateExport(); }
}
$('export-content').onchange = () => { if ($('export-content').value === 'painted' && paintRoot) viewer.loadObject(paintRoot); if ($('export-content').value === 'original' && asset) viewer.loadObject(asset.object); updateExport(); };
$('format-select').onchange = updateExport;
$('download-btn').onclick = async () => {
  if (!asset || working || exportBusy) return;
  exportBusy = true; $('download-btn').disabled = true; $('paint-btn').disabled = true;
  const source = asset, format = $('format-select').value, mode = $('export-content').value;
  const name = source.name.replace(/\.[^.]*$/, '').split(/[\\/]/).pop().replace(/[\x00-\x1f<>:"|?*]/g, '_') || 'model';
  try {
    status(`Exporting ${mode} as ${format.toUpperCase()}…`);
    const payload = await exportModel(source, { format, mode, painted, paintedRoot: paintRoot, geometryRoot: viewer.currentModel, scale: Number($('print-scale').value), slicer: $('slicer-target').value });
    download(payload, `${name}${mode === 'original' ? '' : '-' + mode}.${format}`);
    status(`Export generated: ${name}.${format}. Review the stated format limitations.`, 'success');
  } catch (e) { status(e.message, 'error'); }
  finally { exportBusy = false; busy(false); }
};
$('sample-btn').onclick = () => job(async () => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const c = canvas.getContext('2d');
  c.fillStyle = '#eee8d7'; c.fillRect(0,0,128,128); c.fillStyle = '#22457b'; c.fillRect(8,8,112,20); c.fillStyle = '#ca653a'; c.fillRect(18,42,92,62); c.fillStyle = '#142436'; c.fillRect(38,56,12,12); c.fillRect(78,56,12,12); c.fillRect(48,86,32,6);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter;
  const object = new THREE.Group(); object.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({ map, roughness: 0.8 })));
  commit({ object, type:'sample', name:'paint-sample.glb', triangles:12, animations:[], resources:{dispose() {}} });
});
updateExport();
