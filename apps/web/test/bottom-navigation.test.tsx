import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BottomNavigation } from '../components/navigation/BottomNavigation';

describe('BottomNavigation', () => {
  it('links the three main sections', () => {
    render(<BottomNavigation locale="en" />);

    expect(screen.getByRole('link', { name: 'Map' })).toHaveAttribute('href', '/en');
    expect(screen.getByRole('link', { name: 'My page' })).toHaveAttribute('href', '/en/me');
    expect(screen.getByRole('link', { name: 'Events' })).toHaveAttribute('href', '/en/events');
  });
});
