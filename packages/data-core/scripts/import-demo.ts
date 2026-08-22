import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { importDemoSnapshots } from '@bassanggum/data-core';

const inputDirectory = fileURLToPath(new URL('../../../../data/raw/demo/', import.meta.url));
const outputPath = fileURLToPath(new URL('../../../../data/normalized/public-bundle.json', import.meta.url));

const bundle = importDemoSnapshots(inputDirectory);
await mkdir(fileURLToPath(new URL('../../../../data/normalized/', import.meta.url)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
