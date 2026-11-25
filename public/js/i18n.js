// Loads translation strings from /api/v1/i18n/:lang (which talks to the i18n microservice).
import { api } from './api.js';

const state = { lang: 'en', strings: {}, en: {} };
export const LANGS = { en: 'English', hi: 'हिन्दी', as: 'অসমীয়া', bn: 'বাংলা' };

export async function loadLanguage(lang) {
  if (!LANGS[lang]) lang = 'en';
  if (!Object.keys(state.en).length) state.en = await api('/i18n/en');
  state.strings = lang === 'en' ? state.en : await api(`/i18n/${lang}`);
  state.lang = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem('lang', lang); } catch { /* private mode */ }
}

export function savedLanguage() {
  try { return localStorage.getItem('lang') || 'en'; } catch { return 'en'; }
}

// t('who_is_your', { relation: 'daughter' }) — falls back to English for missing keys
export function t(key, vars = {}) {
  const s = state.strings[key] ?? state.en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

export const currentLang = () => state.lang;
