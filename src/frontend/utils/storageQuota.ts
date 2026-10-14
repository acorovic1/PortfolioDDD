import { StorageQuotaError } from '@/frontend/utils/api';
import type { MessageKey } from '@/frontend/i18n/en';

export function formatStorageSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

// What to tell the user about a failed upload, in their language when it's
// the storage quota (other server messages are shown as they come).
export function uploadErrorText(error: unknown, t: (key: MessageKey, vars?: Record<string, string | number>) => string): string {
  if (error instanceof StorageQuotaError) {
    return t('upload.storageFull', { used: formatStorageSize(error.usedBytes), quota: formatStorageSize(error.quotaBytes) });
  }
  return error instanceof Error ? error.message : t('security.error');
}
