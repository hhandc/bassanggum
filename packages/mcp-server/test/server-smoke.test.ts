import { importDemoSnapshots } from '@bassanggum/data-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/index.js';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));

describe('MCP server', () => {
  it('makes every documented tool and resource callable through an in-memory MCP client', async () => {
    const completeBundle = importDemoSnapshots(demoDirectory);
    const zone = completeBundle.actionZones[0]!;
    const bundle = {
      ...completeBundle,
      species: completeBundle.species.filter((species) => species.id === zone.speciesId),
      officialOccurrences: completeBundle.officialOccurrences.slice(0, 1),
      habitatAreas: completeBundle.habitatAreas.slice(0, 1),
      waterbodies: [],
      restrictedAreas: [],
      verifiedCommunitySignals: [],
      verifiedEvents: [],
      actionZones: [zone],
    };
    const server = createMcpServer(bundle);
    const client = new Client({ name: 'bassanggum-mcp-test-client', version: '0.1.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    const resources = await client.listResources();
    const calls = [];
    for (const [name, arguments_] of [
      ['list_species', {}],
      ['search_occurrences', {}],
      ['get_hotspots', {}],
      ['get_area_profile', { areaId: zone.id }],
      ['find_removal_events', {}],
      ['get_species_guidance', { speciesId: zone.speciesId }],
      ['get_data_provenance', {}],
    ] as const) {
      calls.push(await client.callTool({ name, arguments: arguments_ }));
    }

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'find_removal_events',
      'get_area_profile',
      'get_data_provenance',
      'get_hotspots',
      'get_species_guidance',
      'list_species',
      'search_occurrences',
    ]);
    expect(resources.resources.map((resource) => resource.uri).sort()).toEqual([
      'bassanggum://catalog/datasets',
      'bassanggum://catalog/species',
      'bassanggum://events/verified',
      'bassanggum://geo/hotspots',
    ]);
    for (const result of calls) {
      expect(result).not.toHaveProperty('isError', true);
      expect(result.content[0]).toMatchObject({ type: 'text', text: expect.any(String) });
    }
    for (const resource of resources.resources) {
      expect((await client.readResource({ uri: resource.uri })).contents[0]).toMatchObject({ mimeType: 'application/json' });
    }

    await Promise.all([client.close(), server.close()]);
  });
});
