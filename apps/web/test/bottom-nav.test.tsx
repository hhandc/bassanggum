import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/en' }));

import { BottomNav } from '../components/BottomNav';

describe('BottomNav', () => {
  it('renders map, events, and my-page navigation', () => {
    render(<BottomNav locale="en" />);

    expect(screen.getByRole('navigation')).toHaveStyle({ background: '#0f5f46' });
    expect(screen.getByRole('link', { name: /map/i })).toHaveAttribute('href', '/en');
    expect(screen.getByRole('link', { name: /events/i })).toHaveAttribute('href', '/en/events');
    expect(screen.getByRole('link', { name: /my page/i })).toHaveAttribute('href', '/en/mypage');
  });
});
