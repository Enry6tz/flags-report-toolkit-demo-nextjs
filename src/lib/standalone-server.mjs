import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const standalone = join(root, '.next', 'standalone');
const server = join(standalone, 'server.js');

if (!existsSync(server)) {
  throw new Error('Production output is missing. Run npm run build before npm start.');
}

// Next.js intentionally leaves these assets outside the traced server output.
cpSync(join(root, '.next', 'static'), join(standalone, '.next', 'static'), { recursive: true });
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
process.env.PORT ||= '5600';
process.env.HOSTNAME = process.env.NEXT_LISTEN_HOST || '0.0.0.0';
await import(pathToFileURL(server).href);
