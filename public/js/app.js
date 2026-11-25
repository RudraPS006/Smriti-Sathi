// App shell: hash router, top bar, role-based navigation, live events.
import { html, mount, $, toast, modal } from './lib.js';
import { api } from './api.js';
import { t, loadLanguage, savedLanguage, currentLang, LANGS } from './i18n.js';
import { speak } from './voice.js';
import { connectSocket, disconnectSocket, startHeartbeat } from './realtime.js';
import * as auth from './views/auth.js';
import * as patient from './views/patient.js';
import * as carer from './views/carer.js';
import * as admin from './views/admin.js';
import { connect } from './views/connect.js';

const store = { user: null, online: false };
const app = $('#app');

const ROUTES = {
  login: { view: auth.login, public: true },
  signup: { view: auth.signup, public: true },
  // patient
  home: { view: patient.home, roles: ['patient'] },
  games: { view: patient.games, roles: ['patient'] },
  play: { view: patient.play, roles: ['patient'] },
  memories: { view: patient.memories, roles: ['patient'] },
  reminders: { view: patient.reminders, roles: ['patient'] },
  companion: { view: patient.companion, roles: ['patient'] },
  journal: { view: patient.journal, roles: ['patient'] },
  quiz: { view: patient.quiz, roles: ['patient'] },
  family: { view: patient.family, roles: ['patient'] },
  // caregiver
  dashboard: { view: carer.dashboard, roles: ['caregiver', 'admin'] },
  patient: { view: carer.patientDetail, roles: ['caregiver', 'admin'] },
  connect: { view: connect, roles: ['caregiver'] },
  // admin
  admin: { view: admin.panel, roles: ['admin'] },
};

const HOME = { patient: 'home', caregiver: 'dashboard', admin: 'admin' };

export const go = (path) => { location.hash = `#/${path}`; };

const ctx = {
  store,
  go,
  lang: currentLang,
  onLogin: async (user) => {
    store.user = user;
    if (user.language && user.language !== currentLang()) await loadLanguage(user.language);
    startRealtime();
    if (location.hash === `#/${HOME[user.role]}`) route(); else go(HOME[user.role]);
  },
  sos: () => sosFlow(),
};

function renderTopbar() {
  const u = store.user;
  const links = !u ? [] : u.role === 'patient' ? [] : u.role === 'admin'
    ? [['admin', 'Admin'], ['dashboard', t('my_patients')]]
    : [['dashboard', t('dashboard')], ['connect', t('connect_patient')]];
  mount($('#topbar'), html`
    <a class="brand" href="#/${u ? HOME[u.role] : 'login'}">
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#fff"/><path d="M20 34c0-8 6-14 12-14s12 6 12 14" stroke="#F4B860" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="32" cy="42" r="5" fill="#0F5C5C"/></svg>
      ${t('app_name')}
    </a>
    ${links.map(([p, label]) => html`<a class="btn ghost small" href="#/${p}">${label}</a>`)}
    <span class="status-dot ${store.online ? 'on' : ''}">${store.online ? t('online') : t('offline')}</span>
    <select id="lang" aria-label="${t('language')}" style="width:auto">
      ${Object.entries(LANGS).map(([k, v]) => html`<option value="${k}" ${k === currentLang() ? 'selected' : ''}>${v}</option>`)}
    </select>
    ${u ? html`<span class="who">${u.name} · ${t('role_' + u.role)}</span><button class="btn ghost small" id="logout">${t('sign_out')}</button>` : ''}
  `);
  $('#lang').addEventListener('change', async (e) => {
    await loadLanguage(e.target.value);
    if (store.user) api('/auth/me', { method: 'PATCH', body: { language: e.target.value } }).catch(() => {});
    route();
  });
  const lo = $('#logout');
  if (lo) lo.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    store.user = null;
    disconnectSocket();
    go('login');
  });
}

// Patient screens always show a big Help button and a Speak button
// Lives outside #app, so views can re-render themselves without losing it
function patientChrome(show) {
  const root = $('#patient-chrome');
  if (!show) { root.innerHTML = ''; return; }
  mount(root, html`
    <div class="voice-bar"><button class="mic" id="mic" aria-label="${t('speak')}"><span>🎤</span>${t('speak')}</button></div>
    <button class="sos" id="sos" aria-label="${t('help')}"><span>🆘</span>${t('help')}</button>`);
  $('#sos').addEventListener('click', sosFlow);
  $('#mic').addEventListener('click', () => patient.voiceCommand($('#mic'), ctx));
}

function sosFlow() {
  speak(t('help_confirm'));
  const m = modal(String(html`
    <div class="center stack">
      <div style="font-size:4rem">🆘</div>
      <h2>${t('help_confirm')}</h2>
      <button class="btn big danger block" id="yes">${t('yes_help')}</button>
      <button class="btn big secondary block" id="no">${t('no_cancel')}</button>
    </div>`), { cls: 'alarm' });
  m.el.querySelector('#no').addEventListener('click', m.close);
  m.el.querySelector('#yes').addEventListener('click', async () => {
    try {
      await api('/alerts/sos', { method: 'POST', body: {} });
      m.close();
      toast(t('help_sent'), 'ok');
      speak(t('help_sent'));
    } catch (e) { toast(e.message, 'danger'); }
  });
}

function startRealtime() {
  const socket = connectSocket();
  socket.off('alert:new').on('alert:new', (a) => {
    toast(`${t('new_alert')}: ${a.patient?.name || ''} — ${a.message}`, a.severity === 'high' ? 'danger' : '');
    beep();
    window.dispatchEvent(new CustomEvent('smriti:alert', { detail: a }));
  });
  socket.off('reminder:due').on('reminder:due', (r) => patient.reminderAlarm(r, ctx));
  socket.off('activity:new').on('activity:new', (a) => window.dispatchEvent(new CustomEvent('smriti:activity', { detail: a })));
}

function beep() {
  try {
    const ac = new AudioContext();
    const o = ac.createOscillator();
    o.frequency.value = 880; o.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.25);
  } catch { /* audio blocked */ }
}

async function route() {
  // "#/patient/3/report?days=7" -> name "patient", params ["3", "report"] (query read by the view)
  const [name, ...params] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  const r = ROUTES[name];
  if (!store.user && !(r && r.public)) return go('login');
  if (store.user && (!r || r.public || (r.roles && !r.roles.includes(store.user.role)))) return go(HOME[store.user.role]);

  document.body.classList.toggle('patient-mode', store.user?.role === 'patient');
  renderTopbar();
  app.innerHTML = '';
  try {
    await r.view(app, params.map(decodeURIComponent), ctx);
  } catch (e) {
    if (e.status === 401) { store.user = null; return go('login'); }
    mount(app, html`<div class="page"><div class="card form-error">${e.message}</div></div>`);
  }
  patientChrome(store.user?.role === 'patient');
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function boot() {
  await loadLanguage(savedLanguage());
  try {
    const { user } = await api('/auth/me');
    store.user = user;
    if (user.language && user.language !== currentLang()) await loadLanguage(user.language);
    startRealtime();
  } catch { /* not signed in */ }
  startHeartbeat((on) => {
    store.online = on;
    const dot = document.querySelector('.status-dot');
    if (dot) { dot.classList.toggle('on', on); dot.textContent = on ? t('online') : t('offline'); }
  });
  window.addEventListener('hashchange', route);
  route();
}

boot();
