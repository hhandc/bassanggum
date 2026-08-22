import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MapLegend } from '../components/map/MapLegend.js';

describe('MapLegend', () => {
  it('explains bounty zones and protected areas', () => {
    render(<MapLegend locale="en" />);

    expect(screen.getByText('Active bounty zone')).toBeVisible();
    expect(screen.getByText('Protected or restricted area')).toBeVisible();
    expect(screen.getByText('Official evidence')).toBeVisible();
  });
});
