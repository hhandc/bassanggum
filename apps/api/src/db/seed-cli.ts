import { resolve } from 'node:path';

import { seedPostgis } from './seed.js';

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) throw new Error('DATABASE_URL is required.');

const summary = await seedPostgis(resolve(process.cwd(), '../../data/raw/demo'), connectionString);
console.log(JSON.stringify(summary));
