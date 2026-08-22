import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LeafletEvidenceMap } from '../components/map/LeafletEvidenceMap';

describe('LeafletEvidenceMap', () => {
  it('renders an OpenStreetMap base map container', () => {
    render(<LeafletEvidenceMap actionZones={{ type: 'FeatureCollection', features: [] }} onActionZoneClick={() => undefined} onRestrictedAreaClick={() => undefined} onViewportChange={() => undefined} restrictedAreas={{ type: 'FeatureCollection', features: [] }} userLocation={null} />);

    expect(screen.getByLabelText('OpenStreetMap base map')).toBeVisible();
  });
});
