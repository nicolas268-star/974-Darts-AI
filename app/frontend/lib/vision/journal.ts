import { createStoredZip, type ZipEntry } from './journal-zip';

export const MAX_JOURNAL_ENTRIES = 100;
export const MAX_JOURNAL_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_JOURNAL_BYTES = 512 * 1024 * 1024;
export type JournalAnnotation = 'UNANNOTATED' | 'LABELLED' | 'FALSE_POSITIVE' | 'UNRESOLVED';
export type JournalSummary = {
  id: string; capturedAt: string; source: 'camera' | 'images'; annotation: JournalAnnotation;
  truth: string | null; state: string; hasImages: boolean; bytes: number; revision: number;
};
export type JournalSummaryInput = Omit<JournalSummary, 'bytes' | 'revision'>;
export type JournalEntry = { summary: JournalSummary; payload: Blob };
type JsonObject = Record<string, unknown>;
const DATABASE = '974darts-vision-journal', SUMMARIES = 'summaries', PAYLOADS = 'payloads';

export class JournalError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'QUOTA' | 'FULL' | 'TOO_LARGE' | 'MISSING' | 'CHANGED' | 'INVALID' | 'STORAGE', message: string) {
    super(message); this.name = 'JournalError';
  }
}

function storageError(error: unknown): JournalError {
  if (error instanceof JournalError) return error;
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  if (name === 'QuotaExceededError') return new JournalError('QUOTA', 'Espace de stockage du navigateur insuffisant. Exportez puis supprimez des captures, ou libérez de l’espace sur le téléphone. Cette capture n’a pas été enregistrée.');
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotAllowedError') return new JournalError('UNAVAILABLE', 'Le stockage local est indisponible dans ce navigateur. Autorisez les données du site ou utilisez Safari/Chrome hors navigation privée.');
  return new JournalError('STORAGE', 'Le journal local n’a pas pu être enregistré ou lu. Réessayez sans fermer cette page.');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new JournalError('UNAVAILABLE', 'Ce navigateur ne permet pas de conserver le journal local. Utilisez une version récente de Safari ou Chrome.')); return; }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(DATABASE, 1); } catch (error) { reject(storageError(error)); return; }
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PAYLOADS)) db.createObjectStore(PAYLOADS);
    };
    request.onblocked = () => { blocked = true; reject(new JournalError('UNAVAILABLE', 'Fermez les autres onglets 974Darts puis réessayez d’ouvrir le journal.')); };
    request.onerror = () => reject(storageError(request.error));
    request.onsuccess = () => { if (blocked) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}

async function transaction<T>(mode: IDBTransactionMode, operation: (tx: IDBTransaction, finish: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([SUMMARIES, PAYLOADS], mode);
      let value: T, failure: unknown;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(storageError(failure ?? tx.error));
      tx.onerror = event => {
        // QuotaExceededError can originate on the failed request before the transaction aborts.
        const request = event.target as IDBRequest | null;
        if (!failure && request?.error) failure = request.error;
      };
      const fail = (error: unknown) => { failure = error; try { tx.abort(); } catch { reject(storageError(error)); } };
      try { operation(tx, result => { value = result; }, fail); } catch (error) { fail(error); }
    });
  } catch (error) { throw storageError(error); }
  finally { db.close(); }
}

function object(value: unknown): value is JsonObject { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function payloadForCapture(value: unknown, id: string): JsonObject {
  if (!object(value) || value.schemaVersion !== 2 || !Array.isArray(value.samples)) throw new JournalError('INVALID', 'Format du diagnostic incompatible avec le journal.');
  for (const field of ['currentAnalysis', 'currentPair']) {
    const pair = value[field];
    if (object(pair) && pair.captureId !== undefined && pair.captureId !== id) throw new JournalError('INVALID', 'Le diagnostic ne correspond pas à cette capture.');
  }
  const nativeAfter = object(value.nativePair) ? value.nativePair.after : null;
  if (object(nativeAfter) && nativeAfter.captureId !== undefined && nativeAfter.captureId !== id) throw new JournalError('INVALID', 'L’image native ne correspond pas à cette capture.');
  // Each archive file contains only this capture's annotation, never the full React journal.
  return { ...value, samples: value.samples.filter(sample => object(sample) && sample.id === id) };
}
function payloadBlob(value: unknown): Blob {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
  if (blob.size > MAX_JOURNAL_ENTRY_BYTES) throw new JournalError('TOO_LARGE', 'Cette capture dépasse 64 Mo. Réduisez la résolution ou exportez-la individuellement.');
  return blob;
}

export function assertJournalCapacity(summaries: Pick<JournalSummary, 'id' | 'bytes'>[], id: string, bytes: number): void {
  const existing = summaries.find(item => item.id === id);
  if (!existing && summaries.length >= MAX_JOURNAL_ENTRIES) throw new JournalError('FULL', 'Journal plein : 100 captures conservées. Exportez puis supprimez des captures pour poursuivre. Aucune capture ancienne n’a été effacée.');
  if (bytes > MAX_JOURNAL_ENTRY_BYTES) throw new JournalError('TOO_LARGE', 'Cette capture dépasse la limite de 64 Mo.');
  if (summaries.reduce((total, item) => total + item.bytes, 0) - (existing?.bytes ?? 0) + bytes > MAX_JOURNAL_BYTES) throw new JournalError('QUOTA', 'Le journal atteint sa limite de 512 Mo. Exportez puis supprimez des captures pour poursuivre.');
}

export async function putJournalEntry(summary: JournalSummaryInput, payload: unknown): Promise<JournalSummary> {
  if (!summary.id || !Number.isFinite(Date.parse(summary.capturedAt))) throw new JournalError('INVALID', 'Identifiant ou date de capture invalide.');
  const blob = payloadBlob(payloadForCapture(payload, summary.id));
  const stored: JournalSummary = { ...summary, bytes: blob.size, revision: 1 };
  return transaction('readwrite', (tx, finish, fail) => {
    const store = tx.objectStore(SUMMARIES), request = store.getAll();
    request.onsuccess = () => {
      try {
        const current = request.result as JournalSummary[];
        if (current.some(entry => entry.id === summary.id)) throw new JournalError('CHANGED', 'Cette capture est déjà conservée dans le journal. Rechargez la liste avant de réessayer.');
        assertJournalCapacity(current, summary.id, blob.size);
        store.add(stored); tx.objectStore(PAYLOADS).add(blob, summary.id); finish(stored);
      } catch (error) { fail(error); }
    };
  });
}

export async function listJournalEntries(): Promise<JournalSummary[]> {
  return transaction('readonly', (tx, finish) => {
    const request = tx.objectStore(SUMMARIES).getAll();
    request.onsuccess = () => finish((request.result as JournalSummary[]).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.id.localeCompare(b.id)));
  });
}

export async function getJournalEntry(id: string): Promise<JournalEntry | null> {
  return transaction('readonly', (tx, finish, fail) => {
    const summary = tx.objectStore(SUMMARIES).get(id), payload = tx.objectStore(PAYLOADS).get(id);
    let gotSummary = false, gotPayload = false;
    const done = () => {
      if (!gotSummary || !gotPayload) return;
      if (!summary.result) { finish(null); return; }
      if (!(payload.result instanceof Blob)) { fail(new JournalError('STORAGE', 'Les images de cette capture sont indisponibles. Le journal ne sera pas exporté partiellement.')); return; }
      finish({ summary: summary.result as JournalSummary, payload: payload.result as Blob });
    };
    summary.onsuccess = () => { gotSummary = true; done(); }; payload.onsuccess = () => { gotPayload = true; done(); };
  });
}

export async function annotateJournalEntry(id: string, sample: unknown, annotation: JournalAnnotation, truth: string | null): Promise<JournalSummary> {
  if (!object(sample) || sample.id !== id) throw new JournalError('INVALID', 'Cette annotation ne correspond pas à la capture.');
  const original = await getJournalEntry(id);
  if (!original) throw new JournalError('MISSING', 'Cette capture a été supprimée du journal.');
  const payload = payloadForCapture(JSON.parse(await original.payload.text()), id);
  const blob = payloadBlob({ ...payload, samples: [sample] });
  const updated: JournalSummary = { ...original.summary, annotation, truth, bytes: blob.size, revision: original.summary.revision + 1 };
  return transaction('readwrite', (tx, finish, fail) => {
    const store = tx.objectStore(SUMMARIES), request = store.getAll();
    request.onsuccess = () => {
      try {
        const entries = request.result as JournalSummary[], current = entries.find(entry => entry.id === id);
        if (!current) throw new JournalError('MISSING', 'Cette capture a été supprimée du journal.');
        if (current.revision !== original.summary.revision) throw new JournalError('CHANGED', 'Cette annotation a changé dans un autre onglet. Rechargez le journal avant de réessayer.');
        assertJournalCapacity(entries, id, blob.size);
        store.put(updated); tx.objectStore(PAYLOADS).put(blob, id); finish(updated);
      } catch (error) { fail(error); }
    };
  });
}

export async function deleteJournalEntries(ids: string[]): Promise<void> {
  return transaction('readwrite', (tx, finish) => {
    for (const id of new Set(ids)) { tx.objectStore(SUMMARIES).delete(id); tx.objectStore(PAYLOADS).delete(id); }
    finish(undefined);
  });
}
export async function clearJournalEntries(): Promise<void> {
  return transaction('readwrite', (tx, finish) => { tx.objectStore(SUMMARIES).clear(); tx.objectStore(PAYLOADS).clear(); finish(undefined); });
}

export async function buildJournalZip(ids: string[], options: { includeImages: boolean; onProgress?: (completed: number, total: number) => void }): Promise<Blob> {
  const selected = [...new Set(ids)];
  if (!selected.length) throw new JournalError('INVALID', 'Sélectionnez au moins une capture à télécharger.');
  if (selected.length > MAX_JOURNAL_ENTRIES) throw new JournalError('INVALID', 'Une archive peut contenir au maximum 100 captures.');
  const manifest: { id: string; file: string; capturedAt: string; annotation: JournalAnnotation; truth: string | null; hasImages: boolean; bytes: number }[] = [];
  async function* entries(): AsyncGenerator<ZipEntry> {
    for (let index = 0; index < selected.length; index++) {
      const entry = await getJournalEntry(selected[index]);
      if (!entry) throw new JournalError('MISSING', 'Une capture sélectionnée a été supprimée. Actualisez le journal puis recommencez. Aucune archive incomplète n’a été téléchargée.');
      let data = entry.payload;
      if (!options.includeImages) {
        const payload = payloadForCapture(JSON.parse(await data.text()), entry.summary.id);
        data = payloadBlob({ ...payload, nativePair: null, currentPair: null });
      }
      // The sequence makes names unique even if two captures share the same timestamp.
      const stamp = entry.summary.capturedAt.replace(/[^0-9A-Za-z-]/g, '-');
      const file = `${String(index + 1).padStart(3, '0')}-974darts-vision-${stamp}.json`;
      manifest.push({ id: entry.summary.id, file, capturedAt: entry.summary.capturedAt, annotation: entry.summary.annotation, truth: entry.summary.truth,
        hasImages: options.includeImages && entry.summary.hasImages, bytes: data.size });
      yield { name: file, data, lastModified: entry.summary.capturedAt };
      options.onProgress?.(index + 1, selected.length);
    }
    yield { name: 'manifest.json', data: new Blob([JSON.stringify({ schemaVersion: 1, kind: '974darts-vision-journal-archive', exportedAt: new Date().toISOString(), includeImages: options.includeImages, count: manifest.length, entries: manifest }, null, 2)], { type: 'application/json' }) };
  }
  return createStoredZip(entries());
}
