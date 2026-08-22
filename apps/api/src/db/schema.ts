import { customType, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const geometry = customType<{ data: string; driverData: string }>({
  dataType: () => 'geometry',
});

const id = () => text('id').primaryKey();
const publicGeometry = () => geometry('public_geometry', { type: 'geometry', srid: 4326 });

export const species = pgTable('species', { id: id(), payload: jsonb('payload').notNull() });
export const dataSources = pgTable('data_sources', { datasetId: text('dataset_id').primaryKey(), payload: jsonb('payload').notNull() });
export const officialOccurrences = pgTable('official_occurrences', { id: id(), sourceRecordId: text('source_record_id').notNull(), location: publicGeometry(), payload: jsonb('payload').notNull() }, (table) => [uniqueIndex('official_occurrences_source_record_id').on(table.sourceRecordId)]);
export const habitatAreas = pgTable('habitat_areas', { id: id(), geometry: publicGeometry(), payload: jsonb('payload').notNull() });
export const waterbodies = pgTable('waterbodies', { id: id(), geometry: publicGeometry(), payload: jsonb('payload').notNull() });
export const restrictedAreas = pgTable('restricted_areas', { id: id(), geometry: publicGeometry(), payload: jsonb('payload').notNull() });
export const areas = pgTable('areas', { id: id(), geometry: publicGeometry(), payload: jsonb('payload').notNull() });
export const hotspotScores = pgTable('hotspot_scores', { id: id(), areaId: text('area_id').notNull(), score: integer('score').notNull(), payload: jsonb('payload').notNull() });
export const verifiedEvents = pgTable('verified_events', { id: id(), geometry: publicGeometry(), payload: jsonb('payload').notNull() });
export const challenges = pgTable('challenges', { id: id(), startsAt: timestamp('starts_at', { withTimezone: true }).notNull(), endsAt: timestamp('ends_at', { withTimezone: true }).notNull(), payload: jsonb('payload').notNull() });
export const anonymousProfiles = pgTable('anonymous_profiles', { id: id(), createdAt: timestamp('created_at', { withTimezone: true }).notNull() });
export const reports = pgTable('reports', { id: id(), publicLocation: publicGeometry(), privateLocation: geometry('private_location', { type: 'geometry', srid: 4326 }), payload: jsonb('payload').notNull() });
export const reportMedia = pgTable('report_media', { id: id(), reportId: text('report_id').notNull(), payload: jsonb('payload').notNull() });
export const verificationResults = pgTable('verification_results', { id: id(), reportId: text('report_id').notNull(), payload: jsonb('payload').notNull() });
export const leaderboardEntries = pgTable('leaderboard_entries', { id: id(), challengeId: text('challenge_id').notNull(), points: integer('points').notNull() });

export const postgisTables = { anonymousProfiles, areas, challenges, dataSources, habitatAreas, hotspotScores, leaderboardEntries, officialOccurrences, reportMedia, reports, restrictedAreas, species, verificationResults, verifiedEvents, waterbodies };
