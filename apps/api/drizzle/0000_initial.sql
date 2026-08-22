CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS data_sources (dataset_id text PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS species (id text PRIMARY KEY, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS official_occurrences (id text PRIMARY KEY, source_record_id text NOT NULL UNIQUE, location geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS habitat_areas (id text PRIMARY KEY, geometry geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS waterbodies (id text PRIMARY KEY, geometry geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS restricted_areas (id text PRIMARY KEY, geometry geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS areas (id text PRIMARY KEY, geometry geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS hotspot_scores (id text PRIMARY KEY, area_id text NOT NULL, score integer NOT NULL, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS verified_events (id text PRIMARY KEY, geometry geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (id text PRIMARY KEY, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS anonymous_profiles (id text PRIMARY KEY, created_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id text PRIMARY KEY, public_location geometry(Geometry, 4326), private_location geometry(Geometry, 4326), payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS report_media (id text PRIMARY KEY, report_id text NOT NULL, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS verification_results (id text PRIMARY KEY, report_id text NOT NULL, payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS leaderboard_entries (id text PRIMARY KEY, challenge_id text NOT NULL, points integer NOT NULL);

CREATE INDEX IF NOT EXISTS areas_geometry_gist ON areas USING gist (geometry);
CREATE INDEX IF NOT EXISTS official_occurrences_location_gist ON official_occurrences USING gist (location);
