import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual<typeof import('react-leaflet')>('react-leaflet');
  return {
    ...actual,
    CircleMarker: ({ pathOptions }: { pathOptions?: { className?: string } }) => <div className={pathOptions?.className} data-testid="user-location-marker" />,
  };
});

import { LeafletEvidenceMap, UserLocationMarker } from '../components/map/LeafletEvidenceMap';

describe('LeafletEvidenceMap', () => {
  it('renders an OpenStreetMap base map container', () => {
    render(<LeafletEvidenceMap actionZones={{ type: 'FeatureCollection', features: [] }} onActionZoneClick={() => undefined} onMapClick={() => undefined} onRestrictedAreaClick={() => undefined} onViewportChange={() => undefined} restrictedAreas={{ type: 'FeatureCollection', features: [] }} userLocation={null} />);

    expect(screen.getByLabelText('OpenStreetMap base map')).toBeVisible();
  });

  it('renders a visible marker for an available user location', () => {
    render(<UserLocationMarker location={[36.35, 128.85]} />);

    expect(screen.getByTestId('user-location-marker')).toHaveClass('user-location-marker');
  });
});
