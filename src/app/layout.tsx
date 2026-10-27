import type { Metadata } from 'next';
import { WorkspaceShell } from '@/components/workspace-shell';
import './globals.css';
export const metadata: Metadata = { title: { default: 'e6tz workspace', template: '%s · e6tz' }, description: 'A browser-local integration reference for Reports, Toolkit and Flags.' };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body><WorkspaceShell>{children}</WorkspaceShell></body></html>; }
