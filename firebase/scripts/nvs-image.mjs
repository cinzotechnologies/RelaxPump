// ESP32 NVS partition image (format version 2), the same bytes as Espressif's nvs_partition_gen.py
// for namespaces, strings and integers. Used by factory-flash.mjs so the factory PC needs no extra
// Python packages. Checked byte-for-byte against esp-idf-nvs-partition-gen (test/nvs.test.js).
//
//   rows: [{ ns: 'rpid', key: 'id', type: 'string', value: 'RP-3F2A9C' }, { ns: 'rp', key: 'board', type: 'i32', value: 2 }]
//   nvsImage(rows, 0x5000) → Buffer
import { readFileSync } from 'node:fs';

const PAGE = 4096;
const ENTRY = 32;
const ENTRIES_PER_PAGE = 126;
const FIRST_ENTRY = 64;
const TYPES = { u8: [0x01, 1], i8: [0x11, 1], u16: [0x02, 2], i16: [0x12, 2], u32: [0x04, 4], i32: [0x14, 4] };
const SZ = 0x21;

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/** zlib.crc32(data, 0xFFFFFFFF), as the ESP-IDF tool computes it. */
export function crc32(buf, seed = 0xffffffff) {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function entryCrc(e) {
  return crc32(Buffer.concat([e.subarray(0, 4), e.subarray(8, 32)]));
}

class Page {
  constructor(seq) {
    this.buf = Buffer.alloc(PAGE, 0xff);
    this.n = 0;
    const h = this.buf.subarray(0, 32);
    h.writeUInt32LE(0xfffffffe, 0); // ACTIVE
    h.writeUInt32LE(seq, 4);
    h[8] = 0xfe; // version 2
    h.writeUInt32LE(crc32(h.subarray(4, 28)), 28);
  }
  free() {
    return ENTRIES_PER_PAGE - this.n;
  }
  put(data) {
    data.copy(this.buf, FIRST_ENTRY + this.n * ENTRY);
    for (let i = 0; i < data.length / ENTRY; i++) {
      const bit = this.n * 2; // 0b11 empty → 0b10 written
      this.buf[32 + (bit >> 3)] &= ~(1 << (bit & 7));
      this.n++;
    }
  }
}

function header(nsIndex, type, span, key) {
  if (!key || Buffer.byteLength(key) > 15) throw new Error(`NVS key "${key}" must be 1–15 bytes`);
  const e = Buffer.alloc(ENTRY, 0xff);
  e[0] = nsIndex;
  e[1] = type;
  e[2] = span;
  e[3] = 0xff;
  e.fill(0, 8, 24);
  e.write(key, 8, 'utf8');
  return e;
}

function primitive(nsIndex, type, key, value) {
  const [code] = TYPES[type];
  const e = header(nsIndex, code, 1, key);
  const v = Number(value);
  if (!Number.isInteger(v)) throw new Error(`${key}: ${value} is not an integer`);
  const w = { u8: 'writeUInt8', i8: 'writeInt8', u16: 'writeUInt16LE', i16: 'writeInt16LE', u32: 'writeUInt32LE', i32: 'writeInt32LE' }[type];
  e[w](v, 24);
  e.writeUInt32LE(entryCrc(e), 4);
  return e;
}

function string(nsIndex, key, value) {
  const data = Buffer.concat([Buffer.from(String(value), 'utf8'), Buffer.from([0])]);
  if (data.length > 1984) throw new Error(`${key}: string too long for NVS`);
  const slots = Math.ceil(data.length / ENTRY);
  const e = header(nsIndex, SZ, slots + 1, key);
  e.writeUInt16LE(data.length, 24);
  e.writeUInt32LE(crc32(data), 28);
  e.writeUInt32LE(entryCrc(e), 4);
  const body = Buffer.alloc(slots * ENTRY, 0xff);
  data.copy(body);
  return Buffer.concat([e, body]);
}

/** Build the image. `size` = the nvs partition size (multiple of 4096, at least 3 pages). */
export function nvsImage(rows, size = 0x5000) {
  if (size % PAGE || size < 3 * PAGE) throw new Error('NVS size must be a multiple of 4096, at least 0x3000');
  const pages = [new Page(0)];
  const nsIndex = new Map();
  const add = (chunk) => {
    let p = pages[pages.length - 1];
    if (p.free() < chunk.length / ENTRY) {
      p.buf.writeUInt32LE(0xfffffffc, 0); // FULL (not covered by the header CRC)
      p = new Page(pages.length);
      pages.push(p);
    }
    p.put(chunk);
  };
  for (const r of rows) {
    if (!nsIndex.has(r.ns)) {
      const idx = nsIndex.size + 1;
      nsIndex.set(r.ns, idx);
      add(primitive(0, 'u8', r.ns, idx));
    }
    const ns = nsIndex.get(r.ns);
    if (r.type === 'string') add(string(ns, r.key, r.value));
    else if (TYPES[r.type]) add(primitive(ns, r.type, r.key, r.value));
    else throw new Error(`${r.key}: NVS type "${r.type}" not supported`);
  }
  // The last page stays empty (NVS needs a free page to work).
  if (pages.length > size / PAGE - 1) throw new Error('NVS data does not fit the partition');
  const out = Buffer.alloc(size, 0xff);
  pages.forEach((p, i) => p.buf.copy(out, i * PAGE));
  return out;
}

/** Parse the nvs_partition_gen CSV (key,type,encoding,value) written by new-device.mjs. */
export function parseNvsCsv(text) {
  const rows = [];
  let ns = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('key,')) continue;
    const [key, type, enc, ...rest] = line.split(',');
    const value = rest.join(',');
    if (type === 'namespace') ns = key;
    else if (type === 'data') {
      if (!ns) throw new Error('NVS CSV: data before the first namespace');
      rows.push({ ns, key, type: enc, value });
    } else throw new Error(`NVS CSV: unsupported row "${line}"`);
  }
  return rows;
}

export function nvsImageFromCsv(path, size) {
  return nvsImage(parseNvsCsv(readFileSync(path, 'utf8')), size);
}
