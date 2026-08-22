import { describe, expect, it } from 'vitest';

import { flattenKeys } from '../lib/i18n.js';
import enMessages from '../messages/en.json';
import koMessages from '../messages/ko.json';

describe('translation messages', () => {
  it('has identical English and Korean translation keys', () => {
    expect(flattenKeys(enMessages).sort()).toEqual(flattenKeys(koMessages).sort());
  });
});
