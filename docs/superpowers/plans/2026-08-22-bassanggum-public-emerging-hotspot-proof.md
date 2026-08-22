# Bassanggum Public Emerging-Hotspot Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve an upstream-verified, non-identifying proof of community device diversity so public hotspot GeoJSON correctly represents emerging hotspots without publishing device tokens.

**Architecture:** The private/community-verification boundary supplies a boolean attestation only after it has confirmed the existing “three recent sightings from at least two distinct anonymous device tokens” rule. `data-core` uses that attestation only with the existing three-signal/time-window threshold; it never serializes a token, count, profile, private coordinate, or media reference. The no-key official-source demo remains unchanged because it has no community signals.

**Tech Stack:** TypeScript, Zod, H3, Vitest, existing public-bundle writer.

**Spec:** `docs/superpowers/specs/2026-08-22-bassanggum-design.md`

## Global Constraints

- Support fish and plant catalogue entries only in the hackathon MVP.
- Community evidence must already be `verified`; exact community coordinates, report media, profile identifiers, and device tokens never enter the MCP bundle.
- An emerging hotspot requires at least three verified sightings of one species in one 1 km H3 cell within 30 days and proof of at least two distinct anonymous devices.
- Never let events change biological hotspot scores.
- The credential-free three-NIE-source demo continues to emit no community signals, habitat geometry, waterbody geometry, restricted geometry, or verified events.
- Every code task follows test-first development and commits a focused, passing change.

---

### Task 1: Preserve safe emerging-hotspot diversity proof

**Files:**

- Modify: `packages/data-core/src/schema.ts`, `packages/data-core/src/hotspots.ts`, `packages/data-core/src/bundle.ts`
- Modify: `packages/data-core/test/hotspots.test.ts`, `packages/data-core/test/bundle.test.ts`
- Modify if needed for MCP status coverage: `packages/mcp-server/src/tools.ts`, `packages/mcp-server/test/tools.test.ts`

**Interfaces:**

- `VerifiedCommunitySignal` gains optional `emergingDeviceDiversityVerified?: boolean`, a trusted upstream group-level attestation that exposes no token/count/identity.
- `calculateHotspotCells` may label a community-only cell `emerging` only when it has the existing three recent sightings **and** an attestation that the two-device condition was verified upstream.
- `writePublicBundle` emits the correctly calculated `emerging` status without retaining `deviceTokenHash` or any forbidden private key/value.

- [ ] **Step 1: Write focused failing tests**

```ts
it('publishes a community-only emerging hotspot from three recent sightings with upstream diversity proof', async () => {
  const bundle = bundleWithVerifiedPublicSignals([
    signal('community:one', '2026-08-12T00:00:00.000Z', true),
    signal('community:two', '2026-08-13T00:00:00.000Z', true),
    signal('community:three', '2026-08-14T00:00:00.000Z', true),
  ]);
  await writePublicBundle(bundle, outputDirectory);
  expect(readHotspots(outputDirectory)).toEqual(expect.arrayContaining([
    expect.objectContaining({ properties: expect.objectContaining({ status: 'emerging' }) }),
  ]));
  expect(readFileSync(join(outputDirectory, 'hotspots.geojson'), 'utf8')).not.toContain('deviceTokenHash');
});

it('keeps three public signals a watch area when upstream diversity proof is absent', () => {
  expect(calculateHotspotCells(inputWithThreeRecentSignals(false))[0]?.status).toBe('watch');
});
```

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `CI=true pnpm --filter @bassanggum/data-core test hotspots.test.ts bundle.test.ts`

Expected: FAIL because the writer currently replaces every internal device hash with the same empty string, so an attested community-only cell cannot become `emerging`.

- [ ] **Step 3: Implement the smallest safe proof path**

Add the optional boolean to the strict community schema. Keep `deviceTokenHash` out of `VerifiedCommunitySignal` and every public file. In hotspot scoring, continue to count sightings/time window as now, but accept the device-diversity condition only when an upstream attestation is present. Do not synthesize uniqueness from public signal IDs. In the bundle writer, pass the safe attestation into hotspot calculation rather than fabricating equal device hashes.

- [ ] **Step 4: Verify GREEN and privacy invariants**

Run: `CI=true pnpm --filter @bassanggum/data-core test hotspots.test.ts bundle.test.ts && CI=true pnpm demo:data && CI=true pnpm lint && CI=true pnpm typecheck && CI=true pnpm test`

Expected: focused tests, no-key regeneration, lint, typecheck, and full suite pass. Confirm current generated no-key data still contains no community signals and no forbidden private-content strings.

- [ ] **Step 5: Commit**

```bash
git add packages/data-core/src packages/data-core/test packages/mcp-server/src packages/mcp-server/test
git commit -m "fix: preserve verified emerging hotspot status"
```
