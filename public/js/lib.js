// Tiny helpers: safe HTML templating (escapes user text -> prevents XSS), modal, toast.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

function part(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}

// html`<p>${userText}</p>` -> userText is escaped automatically
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? part(vals[i]) : ''); });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const mount = (el, tpl) => { el.innerHTML = String(tpl); return el; };
export const on = (root, sel, evt, fn) => $$(sel, root).forEach((el) => el.addEventListener(evt, fn));

export function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'danger' ? 9000 : 4500);
}

export function modal(content, { cls = '', onClose } = {}) {
  const root = $('#modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${content}</div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', esc);
  root.append(overlay);
  const first = overlay.querySelector('button, input, select, textarea');
  if (first) first.focus();
  return { el: overlay.firstElementChild, close };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function fmtDate(d, lang = 'en', opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return new Date(d).toLocaleDateString(LOCALE[lang] || 'en-IN', opts);
}
export function fmtTime(d, lang = 'en') {
  return new Date(d).toLocaleTimeString(LOCALE[lang] || 'en-IN', { hour: 'numeric', minute: '2-digit' });
}
export const LOCALE = { en: 'en-IN', hi: 'hi-IN', as: 'as-IN', bn: 'bn-IN' };

// Show express-validator errors next to the matching form fields
export function showFormErrors(form, err) {
  $$('.field-error, .form-error', form).forEach((e) => e.remove());
  const box = document.createElement('div');
  box.className = 'form-error';
  box.textContent = err.message;
  form.prepend(box);
  (err.details || []).forEach((d) => {
    const input = form.elements[d.field];
    if (input && input.parentElement) {
      const p = document.createElement('div');
      p.className = 'field-error';
      p.textContent = d.message;
      input.parentElement.append(p);
    }
  });
}

// Browsers often ship no Assamese date names, so we supply them ourselves
const AS_DAYS = ['দেওবাৰ', 'সোমবাৰ', 'মঙ্গলবাৰ', 'বুধবাৰ', 'বৃহস্পতিবাৰ', 'শুকুৰবাৰ', 'শনিবাৰ'];
const AS_MONTHS = ['জানুৱাৰী', 'ফেব্ৰুৱাৰী', 'মাৰ্চ', 'এপ্ৰিল', 'মে', 'জুন', 'জুলাই', 'আগষ্ট', 'ছেপ্তেম্বৰ', 'অক্টোবৰ', 'নৱেম্বৰ', 'ডিচেম্বৰ'];
export function longDate(d, lang = 'en') {
  const date = new Date(d);
  const supported = Intl.DateTimeFormat.supportedLocalesOf([LOCALE[lang] || 'en-IN']).length > 0;
  if (lang === 'as' && !supported) {
    return `${AS_DAYS[date.getDay()]}, ${date.getDate()} ${AS_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
  }
  return date.toLocaleDateString(LOCALE[lang] || 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
