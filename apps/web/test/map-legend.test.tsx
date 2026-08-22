import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MapLegend } from '../components/map/MapLegend.js';

describe('MapLegend', () => {
  it('distinguishes fish, plant, mixed, and protected activity areas', () => {
    render(<MapLegend locale="en" />);

    expect(screen.getByText('Fish activity area')).toBeVisible();
    expect(screen.getByText('Plant activity area')).toBeVisible();
    expect(screen.getByText('Mixed fish + plant area')).toBeVisible();
    expect(screen.getByText('Protected or restricted area')).toBeVisible();
    expect(screen.getByText('Evidence activity areas')).toBeVisible();
  });
});
