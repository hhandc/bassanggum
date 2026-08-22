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

    const provenance = await client.callTool({ name: 'get_data_provenance', arguments: {} });
    expect(provenance.structuredContent).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025', sourceUrl: 'https://www.kdpa.kr/' }),
      ]),
    });
    const datasets = await client.readResource({ uri: 'bassanggum://catalog/datasets' });
    const datasetPayload = JSON.parse((datasets.contents[0] as { text: string }).text) as { datasets: Array<{ datasetId: string; sourceUrl: string }> };
    expect(datasetPayload.datasets).toEqual(expect.arrayContaining([
      expect.objectContaining({ datasetId: 'KDPA-PROTECTED-AREAS-OECM-KR-2025', sourceUrl: 'https://www.kdpa.kr/' }),
    ]));
  } finally {
    await client.close();
  }
}, 30_000);
