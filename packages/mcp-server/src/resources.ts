import type { PublicDataBundle } from '@bassanggum/data-core';
import { getDataProvenance, getHotspots, listSpecies, findRemovalEvents } from './tools.js';

export const RESOURCE_URIS = {
  datasets: 'bassanggum://catalog/datasets',
  species: 'bassanggum://catalog/species',
  hotspots: 'bassanggum://geo/hotspots',
  verifiedEvents: 'bassanggum://events/verified',
} as const;

/** Returns only generated public catalog, hotspot, and event data for fixed MCP resources. */
export function createResources(bundle: PublicDataBundle): Record<string, Record<string, unknown>> {
  const provenance = getDataProvenance(bundle, {});
  return {
    [RESOURCE_URIS.datasets]: { datasets: provenance, evidenceType: 'official', provenance },
    [RESOURCE_URIS.species]: { species: listSpecies(bundle, {}), evidenceType: 'official', provenance },
    [RESOURCE_URIS.hotspots]: { hotspots: getHotspots(bundle, {}), evidenceType: 'official', provenance },
    [RESOURCE_URIS.verifiedEvents]: { events: findRemovalEvents(bundle, {}), evidenceType: 'official', provenance },
  };
}
