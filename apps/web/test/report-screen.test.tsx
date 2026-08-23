import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReportScreen } from '../components/report/ReportScreen';

describe('ReportScreen', () => {
  it('offers photo evidence and deliberate location sharing', () => {
    render(<ReportScreen locale="en" />);

    expect(screen.getByRole('heading', { name: 'Report an invasive species' })).toBeVisible();
    expect(screen.getByLabelText('Photo evidence')).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp');
    expect(screen.getByRole('button', { name: 'Use my location' })).toBeVisible();
  });
});
