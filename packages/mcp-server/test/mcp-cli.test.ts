import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const repositoryDirectory = fileURLToPath(new URL('../../../', import.meta.url));

it('serves MCP initialization through the documented pnpm mcp command', async () => {
  const transport = new StdioClientTransport({
    command: 'pnpm',
    args: ['--dir', repositoryDirectory, 'mcp'],
    cwd: repositoryDirectory,
    env: { ...getDefaultEnvironment(), CI: 'true' },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'bassanggum-cli-test-client', version: '0.1.0' });

  try {
    await client.connect(transport);
    expect((await client.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
      'find_removal_events',
      'get_area_profile',
      'get_data_provenance',
      'get_hotspots',
      'get_species_guidance',
      'list_species',
      'search_occurrences',
    ]);
  } finally {
    await client.close();
  }
}, 30_000);
