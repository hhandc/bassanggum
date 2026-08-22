import type { PublicDataBundle } from '@bassanggum/data-core';
import { sourceProvenance, getHotspots, listSpecies, findRemovalEvents } from './tools.js';

export const RESOURCE_URIS = {
  datasets: 'bassanggum://catalog/datasets',
  species: 'bassanggum://catalog/species',
  hotspots: 'bassanggum://geo/hotspots',
  verifiedEvents: 'bassanggum://events/verified',
} as const;

/** Returns only generated public catalog, hotspot, and event data for fixed MCP resources. */
export function createResources(bundle: PublicDataBundle): Record<string, Record<string, unknown>> {
  const provenance = sourceProvenance(bundle);
  const species = listSpecies(bundle, {});
  const hotspots = getHotspots(bundle, {});
  const events = findRemovalEvents(bundle, {});
  return {
    [RESOURCE_URIS.datasets]: { datasets: provenance, evidenceType: 'official', provenance },
    [RESOURCE_URIS.species]: { species: species.items, evidenceType: species.evidenceType, provenance: species.provenance, nextCursor: species.nextCursor },
    [RESOURCE_URIS.hotspots]: { hotspots: hotspots.items, evidenceType: hotspots.evidenceType, provenance: hotspots.provenance, nextCursor: hotspots.nextCursor },
    [RESOURCE_URIS.verifiedEvents]: { events: events.items, evidenceType: events.evidenceType, provenance: events.provenance, nextCursor: events.nextCursor },
  };
}
