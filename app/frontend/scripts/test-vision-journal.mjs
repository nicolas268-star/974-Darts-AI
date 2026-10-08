import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(name, imports = {}) {
  const source = readFileSync(new URL(`../lib/vision/${name}.ts`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, require: dependency => {
    assert.ok(dependency in imports, `Unexpected import ${dependency}`); return imports[dependency];
  }, Blob, TextEncoder, Uint8Array, Uint32Array, DataView, Date, JSON, Set, Error });
  return loaded.exports;
}
const zip = load('journal-zip');
const journal = load('journal', { './journal-zip': zip });
assert.equal(await zip.blobCrc32(new Blob(['123456789'])), 0xcbf43926, 'CRC32 must match the published check vector');
assert.equal(await zip.blobCrc32(new Blob([])), 0);

const fixtures = [{ name: '001-capture.json', data: new Blob(['{"schemaVersion":2,"samples":[{"id":"a"}]}']) },
  { name: 'deuxième.json', data: new Blob(['pointes: éà🌋']) }, { name: 'manifest.json', data: new Blob(['{"count":2}']) }];
async function* entries(values) { yield* values; }
const archive = await zip.createStoredZip(entries(fixtures));
assert.equal(archive.type, 'application/zip');
const bytes = new Uint8Array(await archive.arrayBuffer()), view = new DataView(bytes.buffer), text = new TextDecoder();
let localOffset = 0;
for (const expected of fixtures) {
  assert.equal(view.getUint32(localOffset, true), 0x04034b50);
  assert.equal(view.getUint16(localOffset + 6, true), 0x0800, 'UTF-8 filename flag');
  assert.equal(view.getUint16(localOffset + 8, true), 0, 'Stored entries only');
  const size = view.getUint32(localOffset + 18, true), nameLength = view.getUint16(localOffset + 26, true);
  assert.equal(text.decode(bytes.slice(localOffset + 30, localOffset + 30 + nameLength)), expected.name);
  const contentStart = localOffset + 30 + nameLength;
  assert.equal(text.decode(bytes.slice(contentStart, contentStart + size)), await expected.data.text());
  assert.equal(view.getUint32(localOffset + 14, true), await zip.blobCrc32(expected.data));
  localOffset = contentStart + size;
}
const centralStart = localOffset;
let reconstructedOffset = 0;
for (const expected of fixtures) {
  assert.equal(view.getUint32(localOffset, true), 0x02014b50);
  assert.equal(view.getUint32(localOffset + 42, true), reconstructedOffset, 'Central directory must point at the corresponding local header');
  const nameLength = view.getUint16(localOffset + 28, true);
  assert.equal(text.decode(bytes.slice(localOffset + 46, localOffset + 46 + nameLength)), expected.name);
  reconstructedOffset += 30 + nameLength + expected.data.size;
  localOffset += 46 + nameLength;
}
assert.equal(view.getUint32(localOffset, true), 0x06054b50);
assert.equal(view.getUint16(localOffset + 10, true), fixtures.length);
assert.equal(view.getUint32(localOffset + 16, true), centralStart);
assert.equal(view.getUint32(localOffset + 12, true), localOffset - centralStart);
assert.equal(localOffset + 22, bytes.length);
await assert.rejects(() => zip.createStoredZip(entries([fixtures[0], fixtures[0]])), /dupliqué/);
await assert.rejects(() => zip.createStoredZip(entries([{ name: '../secret.json', data: new Blob([]) }])), /invalide/);
const chunked = new Blob([new Uint8Array(700_000)]);
assert.equal(await zip.blobCrc32(chunked), 0xb3222c9d, 'CRC must work across multiple bounded reads (independent zlib CRC32 fixture)');

const full = Array.from({ length: 100 }, (_, index) => ({ id: String(index), bytes: 20 }));
assert.throws(() => journal.assertJournalCapacity(full, 'new', 20), error => error.code === 'FULL');
assert.doesNotThrow(() => journal.assertJournalCapacity(full, '0', 21), 'Annotating an existing capture remains possible at the cap');
assert.throws(() => journal.assertJournalCapacity([], 'new', journal.MAX_JOURNAL_ENTRY_BYTES + 1), error => error.code === 'TOO_LARGE');
assert.throws(() => journal.assertJournalCapacity([{ id: 'a', bytes: journal.MAX_JOURNAL_BYTES }], 'b', 1), error => error.code === 'QUOTA');
await assert.rejects(() => journal.listJournalEntries(), error => error.code === 'UNAVAILABLE');
await assert.rejects(() => journal.buildJournalZip([], { includeImages: true }), error => error.code === 'INVALID');
await assert.rejects(() => journal.buildJournalZip(Array.from({ length: 101 }, (_, index) => String(index)), { includeImages: true }), error => error.code === 'INVALID');
console.log('PASS vision journal: bounded CRC32, UTF-8 ZIP local/central directory, exact entry contents, duplicate/path rejection, capacity/quota, unavailable storage, invalid selection.');
