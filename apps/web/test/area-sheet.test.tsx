import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AreaSheet } from '../components/map/AreaSheet.js';

describe('AreaSheet', () => {
  it('shows a selected named bounty zone and its invasive species', () => {
    render(<AreaSheet area={{ id: 'action-zone:river:andong', name: 'Nakdong River', kind: 'river_segment', topSpecies: [
      { id: 'micropterus-salmoides', name: 'Largemouth bass', imageUrl: 'https://example.com/largemouth-bass.jpg' },
      { id: 'lepomis-macrochirus', name: 'Bluegill' },
    ], restricted: false }} locale="en" onClose={() => undefined} onJoin={() => undefined} />);

    expect(screen.getByRole('heading', { name: 'Nakdong River' })).toBeVisible();
    expect(screen.getByText('Largemouth bass')).toBeVisible();
    expect(screen.getByRole('img', { name: 'Largemouth bass' })).toHaveAttribute('src', 'https://example.com/largemouth-bass.jpg');
    expect(screen.getByRole('button', { name: 'Join bounty' })).toBeVisible();
  });

  it('does not offer bounty participation in a restricted area', () => {
    render(<AreaSheet area={{ id: 'restricted:area', name: 'Protected wetland', kind: 'protected area', topSpecies: [], restricted: true }} locale="en" onClose={() => undefined} onJoin={() => undefined} />);

    expect(screen.getByText('Removal is not allowed in this area. You may submit a sighting.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Join bounty' })).toBeNull();
  });

  it('can be dismissed without joining a bounty', () => {
    const onClose = vi.fn();
    render(<AreaSheet area={{ id: 'action-zone:river:andong', name: 'Nakdong River', kind: 'river_segment', topSpecies: [], restricted: false }} locale="en" onClose={onClose} onJoin={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close area details' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
