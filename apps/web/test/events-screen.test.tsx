import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EventsScreen } from '../components/events/EventsScreen';

describe('EventsScreen', () => {
  it('labels curated government news as a past event', () => {
    render(<EventsScreen locale="en" />);

    expect(screen.getByText('Past event')).toBeVisible();
    expect(screen.getByText(/Gyeongju City/)).toBeVisible();
  });
});
