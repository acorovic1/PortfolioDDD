import { describe, it, expect } from 'vitest';
import { isDbConnectionError } from '../config/db.ts';

describe('isDbConnectionError', () => {
  it('recognizes connection-level error codes', () => {
    expect(isDbConnectionError({ code: 'ECONNREFUSED' })).toBe(true);
    expect(isDbConnectionError({ code: 'PROTOCOL_CONNECTION_LOST' })).toBe(true);
    expect(isDbConnectionError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isDbConnectionError({ code: 'ENOTFOUND' })).toBe(true);
  });

  it('does not flag unrelated errors', () => {
    expect(isDbConnectionError({ code: 'ER_DUP_ENTRY' })).toBe(false);
    expect(isDbConnectionError(new Error('plain error'))).toBe(false);
    expect(isDbConnectionError(null)).toBe(false);
    expect(isDbConnectionError(undefined)).toBe(false);
  });
});
