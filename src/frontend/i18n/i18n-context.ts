import { createContext } from 'react';
import { en, type MessageKey, type Messages } from './en';
import { bs } from './bs';
import { de } from './de';

export const LOCALES = [
  { code: 'en', name: 'English' },
  { code: 'bs', name: 'Bosanski' },
  { code: 'de', name: 'Deutsch' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];

const DICTIONARIES: Record<Locale, Messages> = { en, bs, de };

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some(l => l.code === value);
}

// The browser's preferred language we support. Croatian, Serbian and
// Montenegrin readers get Bosnian, the closest one available.
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
    if (['hr', 'sr', 'sh', 'cnr'].includes(base)) return 'bs';
  }
  return 'en';
}

// Keys with plural forms ("x.one", "x.other", ...), by their base name.
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}.other` ? Base : never }[MessageKey];

type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match)) : text;
}

export function translator(locale: Locale) {
  const messages = DICTIONARIES[locale];
  const plurals = new Intl.PluralRules(locale);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const t = (key: MessageKey, vars?: Vars): string => fill(messages[key] ?? en[key], vars);

  // Picks the plural form for `count` (Bosnian has one/few/other).
  const tp = (key: PluralKey, count: number, vars?: Vars): string => {
    const form = `${key}.${plurals.select(count)}` as MessageKey;
    const text = messages[form] ?? messages[`${key}.other` as MessageKey];
    return fill(text, { count, ...vars });
  };

  // "3 hours ago", "vor 3 Stunden", "prije 3 sata"
  const timeAgo = (iso: string, now = Date.now()): string => {
    const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
    if (Math.abs(seconds) < 60) return t('time.justNow');
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
    return relative.format(Math.round(hours / 24), 'day');
  };

  const formatDateTime = (iso: string): string =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return { t, tp, timeAgo, formatDateTime };
}

export type I18nContextType = ReturnType<typeof translator> & {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

// Outside a provider (e.g. a component rendered on its own in a test),
// English.
export const I18nContext = createContext<I18nContextType>({
  ...translator('en'),
  locale: 'en',
  setLocale: () => {},
});
