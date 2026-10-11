import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nContext, translator, detectLocale, isLocale, type Locale } from './i18n-context';
import { useAuth } from '@/frontend/hooks/useAuth';

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem('locale');
    if (isLocale(stored)) return stored;
  } catch {
    // storage unavailable
  }
  return detectLocale(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]);
}

// The UI language: remembered in this browser and, when signed in, on the
// account (so it follows the person to other devices).
export function I18nProvider({ children }: { children: ReactNode }) {
  const { user, updateProfile } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  // Signing in adopts the account's language.
  const accountLocale = user?.locale;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from the loaded account
    if (isLocale(accountLocale)) setLocaleState(accountLocale);
  }, [accountLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    try {
      localStorage.setItem('locale', locale);
    } catch {
      // storage unavailable
    }
  }, [locale]);

  const value = useMemo(() => ({
    ...translator(locale),
    locale,
    setLocale: (next: Locale) => {
      setLocaleState(next);
      if (user && user.locale !== next) {
        updateProfile({ locale: next }).catch(err => console.error('Failed to save language:', err));
      }
    },
  }), [locale, user, updateProfile]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
