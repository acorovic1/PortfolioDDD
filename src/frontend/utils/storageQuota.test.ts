import { describe, it, expect } from 'vitest';
import { translator } from '@/frontend/i18n/i18n-context';
import { storageQuotaErrorFrom, ApiError } from './api';
import { uploadErrorText, formatStorageSize } from './storageQuota';

const MB = 1024 * 1024;
const refusal = { error: 'Storage full (English)', storageQuotaExceeded: true, usedBytes: 248 * MB, quotaBytes: 250 * MB };

describe('storage quota errors', () => {
  it('recognizes a refusal for storage, and nothing else', () => {
    const error = storageQuotaErrorFrom(refusal);
    expect(error).toBeInstanceOf(ApiError);
    expect(error?.status).toBe(413);
    expect(storageQuotaErrorFrom({ error: 'File too large' })).toBeNull();
    expect(storageQuotaErrorFrom(null)).toBeNull();
  });

  it("explains a full storage in the user's language", () => {
    const error = storageQuotaErrorFrom(refusal);
    expect(uploadErrorText(error, translator('en').t)).toContain('248 MB of your 250 MB');
    expect(uploadErrorText(error, translator('de').t)).toContain('248 MB von 250 MB');
    expect(uploadErrorText(error, translator('bs').t)).toContain('248 MB od 250 MB');
  });

  it('shows other errors as they come', () => {
    expect(uploadErrorText(new Error('Unsupported model format'), translator('de').t)).toBe('Unsupported model format');
  });

  it('formats sizes', () => {
    expect(formatStorageSize(0)).toBe('0.0 MB');
    expect(formatStorageSize(2.25 * MB)).toBe('2.3 MB');
    expect(formatStorageSize(250 * MB)).toBe('250 MB');
  });
});
