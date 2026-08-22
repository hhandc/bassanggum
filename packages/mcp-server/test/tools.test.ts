import { importDemoSnapshots } from '@bassanggum/data-core';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findRemovalEvents,
  getAreaProfile,
  getDataProvenance,
  getHotspots,
  getSpeciesGuidance,
  listSpecies,
  searchOccurrences,
} from '../src/tools.js';

const demoDirectory = fileURLToPath(new URL('../../../data/raw/demo/', import.meta.url));
const bundle = importDemoSnapshots(demoDirectory);

describe('MCP data queries', () => {
  it('filters species by category with source-attributed results', () => {
    const result = listSpecies(bundle, { category: 'fish' });
    const species = result.items;

    expect(species).not.toHaveLength(0);
    expect(species.every((item) => item.category === 'fish')).toBe(true);
    expect(result.provenance).toHaveLength(3);
    expect(result.provenance.every((record) => record.sourceRecordId === undefined)).toBe(true);
    expect(species[0]).toMatchObject({
      evidenceType: 'official',
      provenance: expect.arrayContaining([expect.objectContaining({ datasetId: expect.any(String), sourceUrl: expect.any(String) })]),
    });
  });

  it('returns official-source provenance with a hotspot result', () => {
    expect(getHotspots(bundle, { speciesId: 'lepomis-macrochirus' }).items[0]).toMatchObject({
      evidenceType: 'official',
      provenance: expect.arrayContaining([expect.objectContaining({ datasetId: expect.any(String), sourceUrl: expect.any(String) })]),
    });
  });

  it('keeps public community hotspot contributors and emerging status distinct from official evidence', () => {
    const zone = bundle.actionZones[0]!;
    const signals = ['one', 'two', 'three'].map((suffix) => ({
      id: `community:verified:${suffix}`,
      speciesId: zone.speciesId,
      evidenceSource: 'community_verified' as const,
      signalType: 'sighting' as const,
      publicGeometry: { type: 'Point' as const, coordinates: [128.6, 36.57] as [number, number] },
      verifiedAt: '2026-08-22T00:00:00.000Z',
    }));
    const communityZone = {
      ...zone,
      score: 12,
      evidence: {
        cells: [{
          ...zone.evidence.cells[0]!,
          score: 12,
          status: 'emerging',
          contributingIds: signals.map((signal) => signal.id),
          officialOccurrences: [],
          habitatAreas: [],
          verifiedCommunitySignals: signals.map((signal) => ({ id: signal.id, weight: 4 })),
          adjacentCells: [],
        }],
      },
    };

    const result = getHotspots({
      ...bundle,
      officialOccurrences: [],
      habitatAreas: [],
      verifiedCommunitySignals: signals,
      actionZones: [communityZone] as typeof bundle.actionZones,
    }, { speciesId: zone.speciesId });

    expect(result).toMatchObject({
      evidenceType: 'community_verified',
      provenance: [],
      items: [expect.objectContaining({ evidenceType: 'community_verified', provenance: [], status: 'emerging' })],
    });
  });

  it('never returns an exact community location from occurrence search', () => {
    const result = searchOccurrences({
      ...bundle,
      verifiedCommunitySignals: [{
        id: 'community:verified:one',
        speciesId: 'lepomis-macrochirus',
        evidenceSource: 'community_verified',
        signalType: 'sighting',
        publicGeometry: { type: 'Point', coordinates: [128.599312345, 36.571598765] },
        verifiedAt: '2026-08-22T00:00:00.000Z',
      }],
    }, { source: 'community_verified' });

    expect(JSON.stringify(result)).not.toContain('exactLocation');
    expect(JSON.stringify(result)).not.toContain('publicGeometry');
    expect(JSON.stringify(result)).not.toContain('128.599312345');
  });

  it('paginates occurrence results using an opaque next cursor', () => {
    const firstPage = searchOccurrences(bundle, { source: 'official', limit: 1 });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(searchOccurrences(bundle, { source: 'official', limit: 1, cursor: firstPage.nextCursor }).items).not.toEqual(firstPage.items);
  });

  it('preserves every contributing official source record in a hotspot provenance chain', () => {
    const zone = bundle.actionZones[0]!;
    const first = bundle.officialOccurrences[0]!;
    const second = { ...first, id: 'official:fixture:second', sourceRecordId: 'fixture-second' };
    const result = getHotspots({
      ...bundle,
      officialOccurrences: [first, second],
      actionZones: [{
        ...zone,
        evidence: {
          cells: [{
            ...zone.evidence.cells[0]!,
            contributingIds: [first.id, second.id],
            officialOccurrences: [{ id: first.id, weight: 1 }],
            adjacentCells: [{ id: second.id, weight: 1 }],
          }],
        },
      }],
    }, {});

    expect(result.items[0]?.provenance).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRecordId: first.sourceRecordId }),
      expect.objectContaining({ sourceRecordId: 'fixture-second' }),
    ]));
  });

  it('retains distinct records from the same dataset in data provenance', () => {
    const first = bundle.officialOccurrences[0]!;
    const second = { ...first, id: 'official:fixture:second', sourceRecordId: 'fixture-second' };
    const result = getDataProvenance({ ...bundle, officialOccurrences: [first, second] }, { datasetId: first.datasetId });

    expect(result.items.map((record) => record.sourceRecordId)).toEqual(expect.arrayContaining([first.sourceRecordId, 'fixture-second']));
  });

  it('provides area restrictions, score explanations, species, and matching events', () => {
    const zone = bundle.actionZones[0]!;

    expect(getAreaProfile(bundle, { areaId: zone.id })).toMatchObject({
      id: zone.id,
      topSpecies: expect.any(Array),
      scoreExplanation: expect.any(String),
      restrictions: expect.any(Array),
      matchingEvents: expect.any(Array),
      evidenceType: expect.any(String),
      provenance: expect.any(Array),
    });
  });

  it('matches public waterbodies, restrictions, and events by their geometry', () => {
    const zone = bundle.actionZones[0]!;
    const source = bundle.officialOccurrences[0]!;
    const profile = getAreaProfile({
      ...bundle,
      waterbodies: [{ ...source, id: 'waterbody:fixture', name: 'Fixture Lake', kind: 'lake', geometry: zone.geometry }],
      restrictedAreas: [{ ...source, id: 'restricted:fixture', name: 'Fixture Restriction', restriction: 'No collection.', geometry: zone.geometry }],
      verifiedEvents: [{
        ...source,
        id: 'event:fixture',
        organizer: 'Fixture Organizer',
        title: 'Fixture Removal Event',
        eventUrl: 'https://example.com/events/fixture',
        startsAt: '2026-08-23T00:00:00.000Z',
        endsAt: '2026-08-23T01:00:00.000Z',
        eligibleSpeciesIds: [zone.speciesId],
        rewardWording: 'Fixture reward.',
        eligibilityNotes: 'Fixture eligibility.',
        validatedAt: '2026-08-22T00:00:00.000Z',
        geometry: zone.geometry,
      }],
    }, { areaId: zone.id });

    expect(profile).toMatchObject({
      matchingWaterbodies: [expect.objectContaining({ id: 'waterbody:fixture' })],
      restrictions: [expect.objectContaining({ id: 'restricted:fixture' })],
      matchingEvents: [expect.objectContaining({ id: 'event:fixture' })],
    });
  });

  it('returns guidance and provenance with public source metadata', () => {
    expect(getSpeciesGuidance(bundle, { speciesId: 'lepomis-macrochirus' })).toMatchObject({
      evidenceType: 'official',
      provenance: expect.any(Array),
    });
    expect(getDataProvenance(bundle, {}).items).not.toHaveLength(0);
    expect(findRemovalEvents(bundle, {}).items).toEqual(expect.any(Array));
  });

  it('returns source-attributed not-found objects instead of undefined', () => {
    expect(getAreaProfile(bundle, { areaId: 'missing-area' })).toMatchObject({
      found: false,
      evidenceType: 'official',
      provenance: [],
    });
    expect(getSpeciesGuidance(bundle, { speciesId: 'missing-species' })).toMatchObject({
      found: false,
      evidenceType: 'official',
      provenance: [],
    });
  });
});
