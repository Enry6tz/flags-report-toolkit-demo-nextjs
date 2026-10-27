import { describe, expect, it } from 'vitest';
import { createReportsClient } from '@e6tz/reports';
import { createFlagsClient } from '@e6tz/flags';
import { createReviewEngine, recordingJson, type AgentContextV2 } from '@e6tz/toolkit/review';
import { createWorkspaceStore, STORAGE_KEY, StorageFailure } from '../src/lib/storage';
import { createLocalReportsTransport, createLocalFlagsProvider, addFlag, updateFlag, importQaRecording, recordingDetails } from '../src/lib/integrations';
class MemoryStorage { value = new Map<string,string>(); fail = false; getItem(k:string){return this.value.get(k) ?? null;} setItem(k:string,v:string){if(this.fail)throw new Error('quota'); this.value.set(k,v);} }
const setup = () => { const storage = new MemoryStorage(); return {storage,store:createWorkspaceStore(storage)}; };
describe('browser storage contract',()=>{
 it('starts empty without reseeding and persists through new store instances',()=>{const {storage,store}=setup(); expect(store.read().reports).toEqual([]); addFlag(store,'new-checkout',false,'Checkout'); expect(createWorkspaceStore(storage).read().flags[0].key).toBe('new-checkout');});
 it('preserves corrupt bytes and refuses silent overwrite',()=>{const {storage,store}=setup();storage.setItem(STORAGE_KEY,'{broken');expect(()=>store.read()).toThrow(StorageFailure); expect(()=>addFlag(store,'test',true,'')).toThrow();expect(storage.getItem(STORAGE_KEY)).toBe('{broken');});
 it('does not report success or mutate previous bytes on failed writes',()=>{const {storage,store}=setup();addFlag(store,'test',true,'');const before=storage.getItem(STORAGE_KEY);storage.fail=true;expect(()=>updateFlag(store,'test',{value:false})).toThrow(StorageFailure);expect(storage.getItem(STORAGE_KEY)).toBe(before);});
 it('reports browser storage read denial without falling back to an empty store',()=>{
   const store=createWorkspaceStore({getItem(){throw new Error('access denied');},setItem(){throw new Error('must not write');}});
   expect(()=>store.read()).toThrow(StorageFailure);
   expect(()=>addFlag(store,'checkout',false,'')).toThrow(StorageFailure);
 });
});
describe('real Reports SDK',()=>{
 it('validates, persists before ACK and deduplicates the same submission',async()=>{const {store}=setup();const client=createReportsClient({transport:createLocalReportsTransport(store),createId:()=> '11111111-1111-4111-8111-111111111111'});client.prepare({message:'The checkout confirmation remains blank.'});expect((await client.send()).status).toBe('accepted');expect(store.read().reports).toHaveLength(1);const sub=store.read().reports[0].submission;const duplicate=await createLocalReportsTransport(store)(sub,{signal:new AbortController().signal});expect(duplicate).toMatchObject({status:'duplicate',submissionId:'11111111-1111-4111-8111-111111111111',reportId:'REP-1',documentId:1});expect(store.read().reports).toHaveLength(1);await expect(createLocalReportsTransport(store)({...sub,message:'different'},{signal:new AbortController().signal})).rejects.toMatchObject({status:409});client.dispose();});
 it('never acknowledges a failed storage write',async()=>{const {storage,store}=setup();storage.fail=true;const c=createReportsClient({transport:createLocalReportsTransport(store)});c.prepare({message:'A valid report that must not be falsely accepted.'});expect((await c.send()).status).not.toBe('accepted');expect(store.read().reports).toHaveLength(0);c.dispose();});
 it('rejects malformed persisted page context without overwriting its bytes',async()=>{
   const {storage,store}=setup();const client=createReportsClient({transport:createLocalReportsTransport(store)});
   client.prepare({message:'A valid report before storage corruption.'});await client.send();client.dispose();
   const damaged=JSON.parse(storage.getItem(STORAGE_KEY)!);
   damaged.reports[0].submission.context.pathname={unexpected:'object'};
   storage.setItem(STORAGE_KEY,JSON.stringify(damaged));const before=storage.getItem(STORAGE_KEY);
   expect(()=>store.read()).toThrow(StorageFailure);
   expect(storage.getItem(STORAGE_KEY)).toBe(before);
 });
});
describe('real Flags SDK',()=>{
 it('keeps fallback until explicit load and refreshes saved values',async()=>{const {store}=setup();addFlag(store,'new-checkout',true,'Checkout');const c=createFlagsClient({provider:createLocalFlagsProvider(store)});expect(c.getBooleanDetails('new-checkout',false).source).toBe('fallback');await c.load();expect(c.getBooleanValue('new-checkout',false)).toBe(true);updateFlag(store,'new-checkout',{value:false});expect(c.getBooleanValue('new-checkout',true)).toBe(true);await c.refresh();expect(c.getBooleanValue('new-checkout',true)).toBe(false);expect(c.getBooleanValue('missing',true)).toBe(true);c.dispose();});
 it('rejects duplicate/invalid keys without altering persistence',()=>{const {store}=setup();addFlag(store,'checkout',true,'');expect(()=>addFlag(store,'checkout',false,'')).toThrow();expect(()=>addFlag(store,'bad key',false,'')).toThrow();expect(store.read().flags).toHaveLength(1);});
});
describe('real Toolkit importer',()=>{
 it('rejects invented recording objects without writing data',async()=>{const {store}=setup();await expect(importQaRecording(store,'{"steps":[]}','Test')).rejects.toThrow();expect(store.read().recordings).toHaveLength(0);});
 it('saves a real SDK export and preserves it across a new store instance',async()=>{
   const {storage,store}=setup();
   const json=exportedRecording();
   const saved=await importQaRecording(store,json,'Checkout QA');
   expect(saved.sourceOrigin).toBe('https://source.example');
   expect(createWorkspaceStore(storage).read().recordings[0].json).toBe(json);
   const view=await recordingDetails(saved);
   expect(view.snapshot.session?.recording).toBe('stopped');
   expect(view.markdown).toContain('Read the confirmation');
   expect(view.markdown).toContain('The confirmation stays visible.');
 });
 it('preserves saved recordings after invalid imports or failed writes',async()=>{
   const {storage,store}=setup();
   await importQaRecording(store,exportedRecording(),'First');
   const before=storage.getItem(STORAGE_KEY);
   await expect(importQaRecording(store,'{broken','Invalid')).rejects.toThrow();
   expect(storage.getItem(STORAGE_KEY)).toBe(before);
   storage.fail=true;
   await expect(importQaRecording(store,exportedRecording(),'Second')).rejects.toThrow(StorageFailure);
   expect(storage.getItem(STORAGE_KEY)).toBe(before);
 });
});

function exportedRecording(){
 const engine=createReviewEngine();
 const scope={origin:'https://source.example',pathname:'/checkout'};
 engine.startSession({requestId:'session',objective:'Check the confirmation',scope,actor:'user'});
 engine.startRecording({requestId:'start',authorized:true});
 engine.checkpoint({requestId:'step',label:'Read the confirmation',pathname:'/checkout',notes:'The confirmation stays visible.'});
 engine.stopRecording({requestId:'stop'});
 const context:AgentContextV2['context']={schemaVersion:'1.0',capturedAt:new Date().toISOString(),page:{url:scope.origin+scope.pathname,pathname:scope.pathname,title:'Checkout',viewport:{width:1280,height:800}},build:{environment:'preview'},rules:[],target:null,annotations:[],privacy:{redactions:[]}};
 return recordingJson({review:engine.getSnapshot(),context} as AgentContextV2);
}
