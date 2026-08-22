import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from '../middleware.js';

describe('locale middleware', () => {
  it('redirects root to English', () => {
    const response = middleware(new NextRequest('http://localhost:3000/'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/en');
  });
});
