import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MapLegend } from '../components/map/MapLegend.js';

describe('MapLegend', () => {
  it('distinguishes fish, plant, and protected activity areas', () => {
    render(<MapLegend locale="en" />);

    expect(screen.getByText('Fish activity area')).toBeVisible();
    expect(screen.getByText('Plant activity area')).toBeVisible();
    expect(screen.queryByText('Mixed fish + plant area')).not.toBeInTheDocument();
    expect(screen.getByText('Protected or restricted area')).toBeVisible();
    expect(screen.getByText('Evidence activity areas')).toBeVisible();
  });
});
