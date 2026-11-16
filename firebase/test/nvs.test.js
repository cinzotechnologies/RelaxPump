// NVS image generator (scripts/nvs-image.mjs) against images made by Espressif's own
// esp-idf-nvs-partition-gen 0.3.0 (fixtures/*.bin, dummy values only). Run: npm run test:nvs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { crc32, nvsImage, nvsImageFromCsv, parseNvsCsv } from '../scripts/nvs-image.mjs';

const fx = (f) => new URL(`./fixtures/${f}`, import.meta.url);

test('identity image is byte-identical to nvs_partition_gen (strings, two namespaces, i32)', () => {
  assert.deepEqual(nvsImageFromCsv(fx('nvs-sample.csv'), 0x5000), readFileSync(fx('nvs-sample.bin')));
});

test('a second page is started when the first is full (byte-identical)', () => {
  assert.deepEqual(nvsImageFromCsv(fx('nvs-big.csv'), 0x6000), readFileSync(fx('nvs-big.bin')));
});

test('crc32 matches zlib.crc32(data, 0xFFFFFFFF)', () => {
  // zlib.crc32(b'123456789', 0xFFFFFFFF) in Python
  assert.equal(crc32(Buffer.from('123456789')), 0xd202d277);
});

test('every entry CRC and the page header CRC are valid; the bitmap marks the written entries', () => {
  const img = nvsImageFromCsv(fx('nvs-sample.csv'), 0x5000);
  assert.equal(img.readUInt32LE(0), 0xfffffffe);
  assert.equal(img[8], 0xfe);
  assert.equal(img.readUInt32LE(28), crc32(img.subarray(4, 28)));
  let slot = 0;
  const keys = [];
  while (img[64 + slot * 32] !== 0xff || img[64 + slot * 32 + 1] !== 0xff) {
    const e = img.subarray(64 + slot * 32, 96 + slot * 32);
    assert.equal(e.readUInt32LE(4), crc32(Buffer.concat([e.subarray(0, 4), e.subarray(8, 32)])), `entry ${slot}`);
    keys.push(e.subarray(8, 24).toString('utf8').replace(/\0+$/, ''));
    slot += e[2];
  }
  assert.deepEqual(keys, ['rpid', 'id', 'email', 'pass', 'claim', 'pop', 'type', 'rp', 'board', 'neg']);
  for (let i = 0; i < 126; i++) {
    const state = (img[32 + (i >> 2)] >> ((i & 3) * 2)) & 3;
    assert.equal(state, i < slot ? 0b10 : 0b11, `bitmap ${i}`);
  }
  // pages after the data stay erased
  assert.ok(img.subarray(4096).every((b) => b === 0xff));
});

test('parseNvsCsv keeps the namespace of each row', () => {
  const rows = parseNvsCsv('key,type,encoding,value\nrpid,namespace,,\nid,data,string,RP-1\nrp,namespace,,\nboard,data,i32,2\n');
  assert.deepEqual(rows, [
    { ns: 'rpid', key: 'id', type: 'string', value: 'RP-1' },
    { ns: 'rp', key: 'board', type: 'i32', value: '2' },
  ]);
});

test('refuses bad input', () => {
  assert.throws(() => nvsImage([{ ns: 'rpid', key: 'a_key_that_is_too_long', type: 'string', value: 'x' }]), /1–15/);
  assert.throws(() => nvsImage([], 0x2000), /at least/);
  assert.throws(() => nvsImage([{ ns: 'rp', key: 'b', type: 'float', value: 1 }]), /not supported/);
  const many = Array.from({ length: 200 }, (_, i) => ({ ns: 'n', key: `k${i}`, type: 'string', value: 'x'.repeat(40) }));
  assert.throws(() => nvsImage(many, 0x3000), /does not fit/);
});
