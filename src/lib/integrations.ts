import { ReportsTransportError, type ReportReceipt, type ReportSubmission, type ReportsTransport } from '@e6tz/reports';
import type { FlagsProvider } from '@e6tz/flags';
import { importRecordingJson, recordingMarkdown, type AgentContextV2 } from '@e6tz/toolkit/review';
import { validFlagKey, type SavedFlag, type SavedRecording, type WorkspaceStore } from './storage';
const fingerprint=(s:ReportSubmission)=>JSON.stringify({message:s.message,image:s.image??null,context:s.context});
export function createLocalReportsTransport(store:WorkspaceStore):ReportsTransport {
  return async (submission,{signal}) => {
    signal.throwIfAborted();
    return store.update(data=>{
      const existing=data.reports.find(row=>row.submission.submissionId===submission.submissionId);
      if(existing) { if(fingerprint(existing.submission)!==fingerprint(submission))throw new ReportsTransportError('SUBMISSION_CONFLICT',409);return {...existing.receipt,status:'duplicate'}; }
      if(data.reports.length>=500)throw new Error('The local inbox reached its 500-report reference limit.');
      const documentId=data.nextDocumentId++;
      const receipt:ReportReceipt={submissionId:submission.submissionId,reportId:`REP-${documentId}`,documentId,receivedAt:new Date().toISOString(),status:'accepted'};
      data.reports.unshift({submission:structuredClone(submission),receipt,read:false,archived:false});
      return receipt;
    });
  };
}
export function createLocalFlagsProvider(store:WorkspaceStore):FlagsProvider {
  return async ({signal})=>{signal.throwIfAborted();const state=store.read();return {revision:`local-${state.revision}`,validUntil:new Date(Date.now()+30_000).toISOString(),flags:state.flags.map(({key,value})=>({key,value}))};};
}
export function addFlag(store:WorkspaceStore,key:string,value:boolean,description:string) {
  const normalized=key.trim();
  if(!validFlagKey(normalized))throw new Error('Use a letter first, then letters, numbers, dots, dashes or underscores (up to 64 characters).');
  if(description.length>240)throw new Error('Keep the description within 240 characters.');
  store.update(data=>{if(data.flags.length>=64)throw new Error('The SDK projection supports up to 64 flags.');if(data.flags.some(f=>f.key===normalized))throw new Error('A flag with this key already exists.');data.flags.push({key:normalized,value,description:description.trim()});});
}
export function updateFlag(store:WorkspaceStore,key:string,patch:Partial<Pick<SavedFlag,'value'|'description'>>) {
  store.update(data=>{const f=data.flags.find(f=>f.key===key);if(!f)throw new Error('This flag no longer exists. Refresh the list.');if(patch.value!==undefined)f.value=patch.value;if(patch.description!==undefined){if(patch.description.length>240)throw new Error('Keep the description within 240 characters.');f.description=patch.description.trim();}});
}
export function removeFlag(store:WorkspaceStore,key:string){store.update(data=>{data.flags=data.flags.filter(f=>f.key!==key);});}
// The SDK requires positive limits even though recording JSON contains no image artifacts.
const limits={maxEvents:10000,maxImages:1,maxBytes:2*1024*1024};
export async function inspectQaRecording(json:string) {
  if(json.length>2*1024*1024)throw new Error('Use a recording JSON smaller than 2 MiB for this browser-local reference.');
  const imported=await importRecordingJson(json,{origin:typeof window==='undefined'?'http://localhost:5600':window.location.origin,pathname:'/recordings',id:()=>crypto.randomUUID(),limits,locale:'en'});
  const parsed=JSON.parse(json) as {session:{scope:{origin:string};objective:string}};
  return { ...imported, sourceOrigin:parsed.session.scope.origin, sourceTitle:parsed.session.objective };
}
export async function importQaRecording(store:WorkspaceStore,json:string,title:string):Promise<SavedRecording> {
  const inspected=await inspectQaRecording(json);
  const row:SavedRecording={id:crypto.randomUUID(),title:(title.trim()||inspected.sourceTitle||'Untitled recording').slice(0,200),json,importedAt:new Date().toISOString(),sourceOrigin:inspected.sourceOrigin,stepCount:inspected.draft.snapshot.steps.filter(s=>!s.recordingBoundary).length};
  store.update(data=>{if(data.recordings.length>=100)throw new Error('The local library reached its 100-recording reference limit.');data.recordings.unshift(row);});return row;
}
export async function recordingDetails(record:SavedRecording) {
  const inspected=await inspectQaRecording(record.json),snapshot=inspected.draft.snapshot;
  const context:AgentContextV2['context']={schemaVersion:'1.0',capturedAt:record.importedAt,page:{url:record.sourceOrigin+'/',pathname:'/',title:record.title,viewport:{width:0,height:0}},build:{environment:'preview'},rules:[],target:null,annotations:inspected.annotations,privacy:{redactions:[]}};
  // The public formatter reads review + context only; retain the SDK-validated imported view.
  const input={review:snapshot,context} as AgentContextV2;
  return {snapshot,annotations:inspected.annotations,markdown:recordingMarkdown(input,{locale:'en'})};
}
export function removeRecording(store:WorkspaceStore,id:string){store.update(data=>{data.recordings=data.recordings.filter(r=>r.id!==id);});}
