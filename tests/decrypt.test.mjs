// Automated tests for src/decrypt.js.
//
// Uses node:test (built into Node 19+) and node:crypto.subtle.
// Tests are skipped when no .meshy fixtures are available.
//
// Fixture lookup order:
//   1. $MESHY_FIXTURES   – directory of *.meshy files (env var)
//   2. ./tests/fixtures  – local fixtures dir (gitignored)
//   3. a couple of well-known paths on the maintainer's machine
//
// Run:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { meshyToGlb, isMeshyFile, isGlbFile } from '../src/decrypt.js';
import { MeshoptDecoder } from './meshopt_decoder.module.js';

const here = dirname(fileURLToPath(import.meta.url));
await MeshoptDecoder.ready;

function locateFixtures() {
  const candidates = [
    process.env.MESHY_FIXTURES,
    resolve(here, 'fixtures'),
    '/Users/amal/Downloads',
    '/Users/amal/listenowl/experiments/meshy-viewer',
  ].filter(Boolean);
  const seen = new Set();
  const found = [];
  for (const dir of candidates) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.meshy')) continue;
      const path = join(dir, f);
      if (seen.has(path)) continue;
      seen.add(path);
      found.push(path);
    }
  }
  return found;
}

const fixtures = locateFixtures();

test('isMeshyFile recognises the MESHY.AI magic', () => {
  const hdr = new Uint8Array([0x4d, 0x45, 0x53, 0x48, 0x59, 0x2e, 0x41, 0x49, ...new Array(24).fill(0)]);
  assert.equal(isMeshyFile(hdr.buffer), true);
  assert.equal(isMeshyFile(new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer), false);
  assert.equal(isMeshyFile(new Uint8Array([0]).buffer), false);
  assert.equal(isMeshyFile(null), false);
});

test('isGlbFile recognises the glTF magic', () => {
  const hdr = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]);
  assert.equal(isGlbFile(hdr.buffer), true);
  assert.equal(isGlbFile(new Uint8Array([0x4d, 0x45, 0x53, 0x48]).buffer), false);
});

test('meshyToGlb rejects garbage input', async () => {
  await assert.rejects(
    () => meshyToGlb(new Uint8Array([1, 2, 3, 4]).buffer),
    /neither \.meshy nor \.glb/,
  );
});

test('meshyToGlb passes through a GLB unchanged', async () => {
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]).buffer;
  const out = await meshyToGlb(glb);
  assert.equal(out, glb);
});

if (fixtures.length === 0) {
  test('fixture-driven tests (skipped: no .meshy fixtures found)', { skip: true }, () => {});
} else {
  for (const path of fixtures) {
    const name = path.split('/').pop();
    test(`decode: ${name}`, async () => {
      const meshyBuf = readFileSync(path).buffer;
      const glb = await meshyToGlb(meshyBuf);
      assert.ok(glb instanceof ArrayBuffer, 'returns ArrayBuffer');
      const u = new Uint8Array(glb);
      assert.equal(u[0], 0x67, 'glTF magic byte 0');
      assert.equal(u[1], 0x6c, 'glTF magic byte 1');
      assert.equal(u[2], 0x54, 'glTF magic byte 2');
      assert.equal(u[3], 0x46, 'glTF magic byte 3');

      // GLB version 2
      const dv = new DataView(glb);
      assert.equal(dv.getUint32(4, true), 2, 'GLB version is 2');

      // JSON chunk is parseable and declares EXT_meshopt_compression
      const jlen = dv.getUint32(12, true);
      const jtype = String.fromCharCode(...u.slice(16, 20));
      assert.equal(jtype, 'JSON', 'first chunk is JSON');
      const json = JSON.parse(new TextDecoder().decode(u.slice(20, 20 + jlen)));
      assert.ok(
        json.extensionsRequired?.includes('EXT_meshopt_compression'),
        'output uses EXT_meshopt_compression',
      );
      assert.ok(json.bufferViews?.length > 0, 'has bufferViews');

      // BIN chunk header looks right
      const binHeaderAt = 20 + ((jlen + 3) & ~3);
      const btype = String.fromCharCode(...u.slice(binHeaderAt + 4, binHeaderAt + 8));
      assert.equal(btype, 'BIN\0', 'second chunk is BIN');

      // Actually decode every meshopt-compressed bufferView in buffer 0.
      // This is the real test — if any decode fails, the assembled GLB is
      // broken and won't render.
      const binDataStart = binHeaderAt + 8;
      const binLen = dv.getUint32(binHeaderAt, true);
      for (const [i, bv] of json.bufferViews.entries()) {
        const ext = bv.extensions?.EXT_meshopt_compression;
        if (!ext || (ext.buffer ?? 0) !== 0) continue;
        assert.ok(
          ext.byteOffset + ext.byteLength <= binLen,
          `bv[${i}] mode=${ext.mode}: span exceeds BIN chunk length`,
        );
        const src = u.slice(binDataStart + ext.byteOffset, binDataStart + ext.byteOffset + ext.byteLength);
        const target = new Uint8Array(ext.count * ext.byteStride);
        assert.doesNotThrow(
          () => MeshoptDecoder.decodeGltfBuffer(target, ext.count, ext.byteStride, src, ext.mode, ext.filter || ''),
          `bv[${i}] mode=${ext.mode} count=${ext.count} stride=${ext.byteStride}: meshopt decode failed`,
        );
      }
    });
  }
}
