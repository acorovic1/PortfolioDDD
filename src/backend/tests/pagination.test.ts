import { describe, it, expect } from 'vitest';
import { parsePagination } from '../utils/pagination.util.ts';

describe('parsePagination', () => {
  it('applies sane defaults when nothing is provided', () => {
    expect(parsePagination({})).toEqual({ limit: 20, offset: 0 });
  });

  it('honors valid limit/offset within bounds', () => {
    expect(parsePagination({ limit: '10', offset: '5' })).toEqual({ limit: 10, offset: 5 });
  });

  it('caps limit at the maximum and ignores invalid values', () => {
    expect(parsePagination({ limit: '9999' })).toEqual({ limit: 50, offset: 0 });
    expect(parsePagination({ limit: '-5', offset: '-5' })).toEqual({ limit: 20, offset: 0 });
    expect(parsePagination({ limit: 'abc', offset: 'xyz' })).toEqual({ limit: 20, offset: 0 });
  });
});
