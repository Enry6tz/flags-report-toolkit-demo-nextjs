import type { ReportReceipt, ReportSubmission } from '@e6tz/reports';
export const STORAGE_KEY = 'e6tz.workspace.v1';
export const MAX_WORKSPACE_BYTES = 4 * 1024 * 1024;
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export interface SavedReport { submission: ReportSubmission; receipt: ReportReceipt; read: boolean; archived: boolean; }
export interface SavedFlag { key: string; value: boolean; description: string; }
export interface SavedRecording { id: string; title: string; json: string; importedAt: string; sourceOrigin: string; stepCount: number; }
export interface WorkspaceData { version: 1; revision: number; nextDocumentId: number; reports: SavedReport[]; flags: SavedFlag[]; recordings: SavedRecording[]; }
export class StorageFailure extends Error { constructor(message: string) { super(message); this.name = 'StorageFailure'; } }
export const emptyWorkspace = (): WorkspaceData => ({ version: 1, revision: 0, nextDocumentId: 1, reports: [], flags: [], recordings: [] });
const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const date = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const boundedText = (value: unknown, bytes: number) => typeof value === 'string' && new TextEncoder().encode(value).byteLength <= bytes;
function validReportContext(value: Record<string, unknown>) {
  if (!date(value.capturedAt)) return false;
  if (value.pathname !== undefined && !boundedText(value.pathname, 1024)) return false;
  if (value.browser !== undefined && !boundedText(value.browser, 512)) return false;
  if (value.appVersion !== undefined && !boundedText(value.appVersion, 128)) return false;
  if (value.viewport !== undefined) {
    if (!object(value.viewport)) return false;
    const { width, height } = value.viewport;
    if (!positive(width) || !positive(height) || width > 32768 || height > 32768) return false;
  }
  return true;
}
export const validFlagKey = (key: string) => /^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(key);
function validate(input: unknown): WorkspaceData {
  const bad = () => { throw new StorageFailure('Saved workspace data is invalid or from an unsupported version. Nothing was overwritten. Export the raw backup before repairing it.'); };
  if (!object(input) || input.version !== 1 || !Number.isSafeInteger(input.revision) || Number(input.revision)<0 || !positive(input.nextDocumentId) || !Array.isArray(input.reports) || input.reports.length>500 || !Array.isArray(input.flags) || input.flags.length>64 || !Array.isArray(input.recordings) || input.recordings.length>100) return bad();
  const ids = new Set<string>(), numbers = new Set<number>();
  for (const row of input.reports) {
    if (!object(row) || !object(row.submission) || !object(row.receipt) || typeof row.read!=='boolean' || typeof row.archived!=='boolean') return bad();
    const s=row.submission,r=row.receipt;
    if (!text(s.submissionId,128) || !s.submissionId || !boundedText(s.message,4096) || !object(s.context) || !validReportContext(s.context) || r.submissionId!==s.submissionId || !positive(r.documentId) || r.reportId!==`REP-${r.documentId}` || !date(r.receivedAt) || !['accepted','duplicate'].includes(String(r.status)) || ids.has(s.submissionId) || numbers.has(r.documentId) || r.documentId>=Number(input.nextDocumentId)) return bad();
    if (s.image!==undefined && (!object(s.image) || !['image/png','image/jpeg','image/webp'].includes(String(s.image.mediaType)) || !text(s.image.data,3*1024*1024))) return bad();
    ids.add(s.submissionId);numbers.add(r.documentId);
  }
  ids.clear();
  for (const f of input.flags) { if (!object(f)||!text(f.key,64)||!validFlagKey(f.key)||ids.has(f.key)||typeof f.value!=='boolean'||!text(f.description,240)) return bad();ids.add(f.key); }
  ids.clear();
  for (const r of input.recordings) { if(!object(r)||!text(r.id,128)||!r.id||ids.has(r.id)||!text(r.title,200)||!text(r.json,2*1024*1024)||!date(r.importedAt)||!text(r.sourceOrigin,2000)||!Number.isSafeInteger(r.stepCount)||Number(r.stepCount)<0) return bad();ids.add(r.id); }
  return input as unknown as WorkspaceData;
}
export function createWorkspaceStore(storage: StorageLike) {
  function raw(): string | null { try { return storage.getItem(STORAGE_KEY); } catch { throw new StorageFailure('Browser storage cannot be read. Allow site storage or use another browser profile.'); } }
  function read(): WorkspaceData { const value=raw(); if(value===null)return emptyWorkspace(); let parsed:unknown;try { parsed=JSON.parse(value); } catch { throw new StorageFailure('Saved workspace JSON is damaged. Nothing was overwritten. Export the raw backup before repairing it.'); } return validate(parsed); }
  function update<T>(change:(data:WorkspaceData)=>T):T {
    const current=read(),result=change(current);current.revision+=1;validate(current);
    const serialized=JSON.stringify(current);
    if(new TextEncoder().encode(serialized).byteLength>MAX_WORKSPACE_BYTES)throw new StorageFailure('The local workspace reached its 4 MiB reference limit. Export and remove recordings or use a real backend.');
    try { storage.setItem(STORAGE_KEY,serialized); } catch { throw new StorageFailure('The browser could not save this change. Storage may be full or blocked. Existing saved data was not replaced.'); }
    return result;
  }
  return { read, update, raw };
}
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
