import { fileURLToPath } from 'node:url';

import { loadApiEnvironment } from './env.js';
import { buildServer } from './server.js';

loadApiEnvironment(fileURLToPath(new URL('../.env', import.meta.url)));

const app = buildServer();

await app.listen({ host: '0.0.0.0', port: 3001 });
