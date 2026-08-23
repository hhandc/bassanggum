import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MapCategoryFilter } from '../components/map/BassanggumMap';

describe('MapCategoryFilter', () => {
  it('lets the user select the fish or plant map layer', () => {
    const onChange = vi.fn();
    render(<MapCategoryFilter filter="all" locale="en" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Plants' }));

    expect(onChange).toHaveBeenNthCalledWith(1, 'fish');
    expect(onChange).toHaveBeenNthCalledWith(2, 'plant');
  });
});
