import { buildServer } from './server.js';

const app = buildServer();

await app.listen({ host: '0.0.0.0', port: 3001 });
