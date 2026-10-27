'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Inbox, Flag, Clapperboard, BookOpen, HardDrive, Download, RefreshCw } from 'lucide-react';
import { createWorkspaceStore, STORAGE_KEY, type WorkspaceData, type WorkspaceStore } from '@/lib/storage';
const Toolkit = dynamic(()=>import('./workspace-toolkit').then(m=>m.WorkspaceToolkit),{ssr:false});
interface HostContext { store:WorkspaceStore|null; data:WorkspaceData|null; refresh:()=>void; }
const Context=createContext<HostContext>({store:null,data:null,refresh:()=>{}});
export const useWorkspace=()=>useContext(Context);
export function downloadText(text:string,name:string,type='application/json'){ const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export const errorMessage=(error:unknown)=>error instanceof Error?error.message:'The operation could not be completed.';
export function WorkspaceShell({children}:{children:ReactNode}) {
 const pathname=usePathname();const [store,setStore]=useState<WorkspaceStore|null>(null),[data,setData]=useState<WorkspaceData|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const hydrate=useCallback(()=>{try {const s=createWorkspaceStore(window.localStorage);setStore(s);setData(s.read());setError('');}catch(e){setError(errorMessage(e));setData(null);}},[]);
 useEffect(()=>{hydrate();},[hydrate]);
 const refresh=useCallback(()=>{if(!store)return;try{setData(store.read());setError('');}catch(e){setError(errorMessage(e));setData(null);}},[store]);
 useEffect(()=>{const changed=(e:StorageEvent)=>{if(e.key===STORAGE_KEY||e.key===null){refresh();setNotice('Workspace data changed in another tab. Refresh the Flags provider separately if it is loaded.');}};window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);},[refresh]);
 const backup=()=>{try{const text=window.localStorage.getItem(STORAGE_KEY);downloadText(text??'null','e6tz-workspace-backup.json');}catch(e){setError(errorMessage(e));}};
 const navigation=[{href:'/reports',label:'Reports',icon:Inbox},{href:'/recordings',label:'QA recordings',icon:Clapperboard},{href:'/flags',label:'Flags',icon:Flag},{href:'/integration',label:'Integration guide',icon:BookOpen}];
 return <Context.Provider value={{store,data,refresh}}><a className="skip-link" href="#workspace-content">Skip to content</a><div className="workspace"><aside className="sidebar"><Link href="/reports" className="brand" aria-label="e6tz workspace home">e6tz<span>workspace</span></Link><nav aria-label="Workspace">{navigation.map(({href,label,icon:Icon})=><Link key={href} href={href} aria-current={pathname===href?'page':undefined}><Icon size={19} strokeWidth={1.7}/>{label}</Link>)}</nav><div className="sidebar-bottom"><div className="local-badge"><HardDrive size={15}/>Browser-local</div><p>One browser. Your records.<br/>No remote backend connected.</p><button className="text-button" onClick={backup}><Download size={15}/>Export raw backup</button><span className="package-versions">Reports 0.1.1 · Flags 0.1.1<br/>Toolkit 0.9.4</span></div></aside><div className="main-column"><div className="workspace-bar"><span>Integration reference</span><span className="connection"><span/>Local storage only</span></div><main id="workspace-content" tabIndex={-1}>{error?<div className="storage-error" role="alert"><h1>Your saved workspace needs attention</h1><p>{error}</p><p>We will not replace damaged data or silently switch to temporary storage.</p><div className="button-row"><button className="button" onClick={hydrate}><RefreshCw size={16}/>Retry storage</button><button className="button secondary" onClick={backup}>Export raw backup</button></div></div>:!data?<div className="loading" role="status">Opening your local workspace…</div>:<>{notice&&<div className="cross-tab" role="status">{notice}<button className="text-button" onClick={()=>setNotice('')}>Dismiss</button></div>}{children}</>}</main><footer className="workspace-footer">A reference host for three independent libraries.<Link href="/integration">Understand the backend seam</Link></footer></div></div><Toolkit/></Context.Provider>;
}
