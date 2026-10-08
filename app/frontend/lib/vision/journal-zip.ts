/** A stored (uncompressed) ZIP, assembled from Blob references without a full archive ArrayBuffer. */
export type ZipEntry = { name: string; data: Blob; lastModified?: string };
const MAX_ZIP_BYTES = 0xffffffff;
const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crcTable[n] = value >>> 0;
}

export async function blobCrc32(blob: Blob): Promise<number> {
  let crc = 0xffffffff;
  // Small sequential reads also work in Safari versions without Blob.stream().
  for (let offset = 0; offset < blob.size; offset += 256 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 256 * 1024).arrayBuffer());
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function dosDate(value?: string): { date: number; time: number } {
  const parsed = new Date(value ?? '1980-01-01T00:00:00Z');
  const date = Number.isFinite(parsed.getTime()) ? parsed : new Date('1980-01-01T00:00:00Z');
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()));
  return { date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >>> 1) };
}

export async function createStoredZip(entries: AsyncIterable<ZipEntry>): Promise<Blob> {
  const parts: BlobPart[] = [], central: BlobPart[] = [], names = new Set<string>();
  let offset = 0, centralSize = 0;
  for await (const entry of entries) {
    if (!entry.name || entry.name.startsWith('/') || entry.name.includes('\\') || entry.name.split('/').some(part => part === '..' || part === '') || names.has(entry.name)) {
      throw new Error('Nom de fichier ZIP invalide ou dupliqué.');
    }
    const name = encoder.encode(entry.name);
    if (name.length > 65535 || names.size >= 65535 || entry.data.size > MAX_ZIP_BYTES || offset + entry.data.size + name.length + 30 > MAX_ZIP_BYTES) {
      throw new Error('Archive trop volumineuse. Exportez une sélection plus petite.');
    }
    names.add(entry.name);
    const crc = await blobCrc32(entry.data), stamp = dosDate(entry.lastModified);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x0800, true);
    local.view.setUint16(10, stamp.time, true); local.view.setUint16(12, stamp.date, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, entry.data.size, true); local.view.setUint32(22, entry.data.size, true);
    local.view.setUint16(26, name.length, true);
    const directory = header(46);
    directory.view.setUint32(0, 0x02014b50, true); directory.view.setUint16(4, 20, true); directory.view.setUint16(6, 20, true);
    directory.view.setUint16(8, 0x0800, true); directory.view.setUint16(12, stamp.time, true); directory.view.setUint16(14, stamp.date, true);
    directory.view.setUint32(16, crc, true); directory.view.setUint32(20, entry.data.size, true); directory.view.setUint32(24, entry.data.size, true);
    directory.view.setUint16(28, name.length, true); directory.view.setUint32(42, offset, true);
    parts.push(local.bytes, name, entry.data); central.push(directory.bytes, name);
    offset += 30 + name.length + entry.data.size; centralSize += 46 + name.length;
  }
  if (offset + centralSize + 22 > MAX_ZIP_BYTES) throw new Error('Archive trop volumineuse. Exportez une sélection plus petite.');
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, names.size, true); end.view.setUint16(10, names.size, true);
  end.view.setUint32(12, centralSize, true); end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.bytes], { type: 'application/zip' });
}
