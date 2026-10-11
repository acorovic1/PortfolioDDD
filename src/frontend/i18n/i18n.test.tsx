import { describe, it, expect } from 'vitest';
import { detectLocale, translator } from './i18n-context';

describe('detectLocale', () => {
  it('picks the first supported browser language', () => {
    expect(detectLocale(['fr-FR', 'de-AT', 'en'])).toBe('de');
  });

  it('gives Croatian and Serbian readers Bosnian', () => {
    expect(detectLocale(['hr-HR'])).toBe('bs');
    expect(detectLocale(['sr-Latn-RS'])).toBe('bs');
  });

  it('falls back to English', () => {
    expect(detectLocale(['ja-JP'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});

describe('translator', () => {
  it('fills in variables', () => {
    expect(translator('en').t('search.by', { username: 'ana' })).toBe('by @ana');
  });

  it('uses the Bosnian one/few/other plural forms', () => {
    const { tp } = translator('bs');
    expect(tp('security.codesLeft', 1)).toBe('Preostao je 1 rezervni kod.');
    expect(tp('security.codesLeft', 3)).toBe('Preostala su 3 rezervna koda.');
    expect(tp('security.codesLeft', 7)).toBe('Preostalo je 7 rezervnih kodova.');
  });

  it('uses the English singular and plural', () => {
    const { tp } = translator('en');
    expect(tp('security.codesLeft', 1)).toBe('1 recovery code left.');
    expect(tp('security.codesLeft', 2)).toBe('2 recovery codes left.');
  });

  it('formats relative times in the locale', () => {
    const now = Date.parse('2026-01-01T12:00:00Z');
    expect(translator('en').timeAgo('2026-01-01T11:59:30Z', now)).toBe('Just now');
    expect(translator('en').timeAgo('2026-01-01T09:00:00Z', now)).toBe('3 hours ago');
    expect(translator('de').timeAgo('2026-01-01T09:00:00Z', now)).toBe('vor 3 Stunden');
  });
});
