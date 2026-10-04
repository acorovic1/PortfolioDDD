import { describe, it, expect } from 'vitest';
import { isDbConnectionError } from '../config/db.ts';

describe('isDbConnectionError', () => {
  it('recognizes connection-level error codes', () => {
    expect(isDbConnectionError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isDbConnectionError({ code: 'ECONNRESET' })).toBe(true);
    expect(isDbConnectionError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isDbConnectionError({ code: 'ENOTFOUND' })).toBe(true);
    expect(isDbConnectionError({ code: '08006' })).toBe(true);
    expect(isDbConnectionError({ code: '57P01' })).toBe(true);
  });

  it('does not flag unrelated errors', () => {
    expect(isDbConnectionError({ code: '23505' })).toBe(false);
    expect(isDbConnectionError(new Error('plain error'))).toBe(false);
    expect(isDbConnectionError(null)).toBe(false);
    expect(isDbConnectionError(undefined)).toBe(false);
  });
});
