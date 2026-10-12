import { geometryGlb } from './glb.js';
const $ = id => document.getElementById(id); let tabId, candidates = [];
const status = text => $('status').textContent = text;
async function inPage(action, selection) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: (action, selection) => {
    try { const api = window[Symbol.for('meshy2glb.capture.v1')]; if (!api) throw new Error('Scan the tab again'); return { value: action === 'scan' ? api.scan() : api.export(selection) }; }
    catch (e) { return { error: e.message }; }
  }, args: [action, selection ?? null] });
  const result = results[0]?.result; if (result?.error || !result) throw new Error(result?.error || 'This page cannot be inspected'); return result.value;
}
$('scan').onclick = async () => {
  $('scan').disabled = true; $('export').disabled = true; $('choices').replaceChildren(); status('Looking for exposed Three.js scenes…');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); tabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId }, world: 'MAIN', files: ['page-bundle.js'] });
    const result = await inPage('scan'); candidates = result.meshes;
    for (const [index, mesh] of candidates.entries()) { const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span'); input.type = 'checkbox'; input.value = String(index); text.textContent = `${mesh.name} · ${mesh.triangles.toLocaleString()} triangles`; label.append(input, text); $('choices').append(label); }
    $('export').disabled = !candidates.length;
    status(candidates.length ? `Select only your model, excluding environment/helper meshes.${result.limited ? ' Search limit reached; some scenes may be missing.' : ''}` : 'No compatible scene exposed. Use Asset Lens to find an accessible asset file, or export from the original application.');
  } catch (e) { status(e.message); } finally { $('scan').disabled = false; }
};
$('export').onclick = async () => {
  const selected = [...$('choices').querySelectorAll('input:checked')].map(i => candidates[Number(i.value)]).map(({ scene, id }) => ({ scene, id }));
  if (!selected.length) { status('Select the model meshes first.'); return; }
  $('export').disabled = true;
  try {
    const meshes = await inPage('export', selected), buffer = geometryGlb(meshes), blob = new Blob([buffer], { type:'model/gltf-binary' });
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'viewer-geometry.glb'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    status('GLB generated. Open it in the converter to inspect. Scan again to export another snapshot.');
  } catch (e) { status(e.message); $('export').disabled = false; }
};
