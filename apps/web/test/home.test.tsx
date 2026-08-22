import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from '../app/[locale]/page.js';

describe('HomePage', () => {
  it('renders the English product name', async () => {
    render(await HomePage({ params: Promise.resolve({ locale: 'en' }) }));

    expect(screen.getByRole('heading', { name: /Bassanggum/i })).toBeVisible();
  });

  it('opens the Korean map as the main screen', async () => {
    render(await HomePage({ params: Promise.resolve({ locale: 'ko' }) }));

    expect(screen.getByLabelText('경북 보상 구역 지도')).toBeVisible();
  });
});
