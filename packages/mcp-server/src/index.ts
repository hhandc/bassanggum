import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { PublicDataBundle } from '@bassanggum/data-core';
import { loadPublicBundle } from './bundle-reader.js';
import { RESOURCE_URIS, createResources } from './resources.js';
import {
  GetAreaProfileInput,
  GetDataProvenanceInput,
  GetHotspotsInput,
  GetSpeciesGuidanceInput,
  ListSpeciesInput,
  McpFindRemovalEventsInputShape,
  McpSearchOccurrencesInputShape,
  findRemovalEvents,
  getAreaProfile,
  getDataProvenance,
  getHotspots,
  getSpeciesGuidance,
  listSpecies,
  searchOccurrences,
} from './tools.js';

export const packageName = '@bassanggum/mcp-server';
export const version = '0.1.0';

/** Creates a read-only MCP server backed exclusively by a validated public bundle. */
export function createMcpServer(bundle: PublicDataBundle): McpServer {
  const server = new McpServer({ name: 'bassanggum-mcp', version });

  server.tool('list_species', ListSpeciesInput.shape, async (input) => toMcpResult(listSpecies(bundle, input), 'species'));
  server.tool('search_occurrences', McpSearchOccurrencesInputShape, async (input) => toMcpResult(searchOccurrences(bundle, input), 'occurrences'));
  server.tool('get_hotspots', GetHotspotsInput.shape, async (input) => toMcpResult(getHotspots(bundle, input), 'hotspots'));
  server.tool('get_area_profile', GetAreaProfileInput.shape, async (input) => toMcpResult(getAreaProfile(bundle, input), 'area profile'));
  server.tool('find_removal_events', McpFindRemovalEventsInputShape, async (input) => toMcpResult(findRemovalEvents(bundle, input), 'verified removal events'));
  server.tool('get_species_guidance', GetSpeciesGuidanceInput.shape, async (input) => toMcpResult(getSpeciesGuidance(bundle, input), 'species guidance'));
  server.tool('get_data_provenance', GetDataProvenanceInput.shape, async (input) => toMcpResult(getDataProvenance(bundle, input), 'data provenance'));

  const resources = createResources(bundle);
  registerResource(server, 'species-catalog', RESOURCE_URIS.species, resources[RESOURCE_URIS.species]!);
  registerResource(server, 'dataset-catalog', RESOURCE_URIS.datasets, resources[RESOURCE_URIS.datasets]!);
  registerResource(server, 'hotspots', RESOURCE_URIS.hotspots, resources[RESOURCE_URIS.hotspots]!);
  registerResource(server, 'verified-events', RESOURCE_URIS.verifiedEvents, resources[RESOURCE_URIS.verifiedEvents]!);

  return server;
}

/** Loads and validates the generated public bundle once, then serves it over stdio. */
export async function startMcpServer(): Promise<void> {
  const { bundle } = loadPublicBundle();
  await createMcpServer(bundle).connect(new StdioServerTransport());
}

function registerResource(server: McpServer, name: string, uri: string, value: Record<string, unknown>): void {
  server.resource(name, uri, async () => ({
    contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(value, null, 2) }],
  }));
}

function toMcpResult(value: Record<string, unknown>, label: string): { content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown> } {
  const count = Array.isArray(value.items) ? value.items.length : value.found === false ? 0 : 1;
  return {
    content: [{ type: 'text', text: `${count} ${label}${count === 1 ? '' : ' returned'}.` }],
    structuredContent: value,
  };
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await startMcpServer();
}
