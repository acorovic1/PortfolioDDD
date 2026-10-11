import { useContext } from 'react';
import { I18nContext } from '@/frontend/i18n/i18n-context';

export function useI18n() {
  return useContext(I18nContext);
}
