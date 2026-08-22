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
    const species = await client.callTool({ name: 'list_species', arguments: {} });
    expect(species).not.toHaveProperty('isError', true);
    expect(species).not.toHaveProperty('toolResult');
    if ('toolResult' in species) {
      throw new Error('Expected list_species to return a direct result.');
    }
    expect(species.content[0]).toMatchObject({ type: 'text', text: expect.any(String) });

    const resource = await client.readResource({ uri: 'bassanggum://catalog/species' });
    expect(resource.contents[0]).toMatchObject({ mimeType: 'application/json', text: expect.any(String) });
  } finally {
    await client.close();
  }
}, 30_000);
