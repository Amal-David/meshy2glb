export function workerJob(script, value, { signal, transfer = [] } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(script, import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new Error('Operation cancelled')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => { cleanup(); data.error ? reject(new Error(data.error)) : resolve(data.result); };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Worker failed to load. Check connectivity to the pinned decoder.')); };
    try { worker.postMessage(value, transfer); } catch (error) { cleanup(); reject(error); }
  });
}
