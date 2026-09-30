import { LOCAL_GAMES, validRecord, type LocalKind, type LocalRecord } from "./local-sessions";

export type CloudRow = { kind: LocalKind; revision: number; writer_device: string; record: LocalRecord; updated_at: string };
export type CloudCommand = { kind: LocalKind; expected: number; device: string; command: string; action: "ENABLE" | "SAVE" | "CLAIM"; record: LocalRecord | null };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const isKind = (v: unknown): v is LocalKind => typeof v === "string" && Object.hasOwn(LOCAL_GAMES, v);
export function validCloudRow(value: unknown): value is CloudRow {
  return object(value) && isKind(value.kind) && Number.isSafeInteger(value.revision) && (value.revision as number) > 0 &&
    uuid(value.writer_device) && typeof value.updated_at === "string" && Number.isFinite(Date.parse(value.updated_at)) &&
    validRecord(value.kind, value.record) && value.record.revision === value.revision;
}
export function validCommand(value: unknown): value is CloudCommand {
  return object(value) && isKind(value.kind) && uuid(value.device) && uuid(value.command) &&
    Number.isSafeInteger(value.expected) && (value.expected as number) >= 0 &&
    (value.action === "CLAIM" ? value.record === null : (value.action === "ENABLE" || value.action === "SAVE") && validRecord(value.kind, value.record));
}
export async function cloudRequest(kind?: LocalKind, command?: CloudCommand, signal?: AbortSignal): Promise<{ row: CloudRow | null; rows: CloudRow[]; conflict: boolean }> {
  const response = await fetch("/api/play/sync" + (kind ? "?kind=" + kind : ""), {
    method: command ? "POST" : "GET", cache: "no-store", signal: signal ?? AbortSignal.timeout(12000),
    ...(command ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) } : {}),
  });
  const value = await response.json();
  if (!response.ok && response.status !== 409) throw new Error(value.error || "Synchronisation indisponible.");
  if (!Array.isArray(value.rows) || !value.rows.every(validCloudRow) || (value.row !== null && !validCloudRow(value.row)))
    throw new Error("Sauvegarde distante incompatible. La copie locale est conservée.");
  return { row: value.row, rows: value.rows, conflict: response.status === 409 };
}
