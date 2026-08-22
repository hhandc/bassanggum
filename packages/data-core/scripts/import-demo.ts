import { fileURLToPath } from 'node:url';
import { importDemoSnapshots, writePublicBundle } from '@bassanggum/data-core';

const inputDirectory = fileURLToPath(new URL('../../../../data/raw/demo/', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../../../../data/normalized/', import.meta.url));

const bundle = importDemoSnapshots(inputDirectory);
await writePublicBundle(bundle, outputDirectory);
