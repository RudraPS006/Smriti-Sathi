// Caregiver: full activity report of the patient — summary, daily chart, timeline, CSV, print.
// Updates live when the patient does something (Socket.IO "activity:new").
import { html, mount, $, $$, fmtDate, fmtTime } from '../lib.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { pager } from './patient.js';

export const ACT = {
  login: { icon: '🔑', color: '#90A4AE' },
  game: { icon: '🧩', color: '#0F5C5C' },
  reminder_done: { icon: '💊', color: '#2E7D32' },
  journal: { icon: '📔', color: '#8E24AA' },
  companion_chat: { icon: '💬', color: '#1565C0' },
  quiz: { icon: '❓', color: '#F4A300' },
  memory_viewed: { icon: '📸', color: '#D84315' },
  family_viewed: { icon: '👪', color: '#6D4C41' },
  sos: { icon: '🆘', color: '#B3261E' },
};
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);

export function ago(d) {
  if (!d) return t('never');
  const min = Math.round((Date.now() - new Date(d)) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 1440) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}

export const activityRow = (a, withPatient = '') => html`
  <li style="justify-content:flex-start;flex-wrap:nowrap">
    <span style="font-size:1.4rem;width:2rem;text-align:center">${ACT[a.type]?.icon || '•'}</span>
    <span style="flex:1">${withPatient ? html`<strong>${withPatient}</strong> · ` : ''}${a.summary}</span>
    <span class="muted small" style="white-space:nowrap">${fmtDate(a.createdAt, 'en', { day: 'numeric', month: 'short' })} ${fmtTime(a.createdAt)}</span>
  </li>`;

export async function reportTab(box, pid, ctx) {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const days = [1, 7, 30].includes(Number(q.get('days'))) ? Number(q.get('days')) : 7;
  const type = q.get('type') || '';
  const page = Number(q.get('page')) || 1;
  const { report: r, timeline } = await api(`/reports/${pid}/activity?days=${days}&page=${page}&limit=15${type ? `&type=${type}` : ''}`);
  const link = (o) => {
    const p = new URLSearchParams({ days, ...(type ? { type } : {}), ...o });
    return `#/patient/${pid}/report?${p}`;
  };

  mount(box, html`
    <div class="row spread no-print" style="margin-bottom:14px">
      <div class="row">${[1, 7, 30].map((d) => html`<a class="btn small ${d === days ? '' : 'secondary'}" href="${link({ days: d, page: 1 })}">${d === 1 ? t('today') : `${d} days`}</a>`)}</div>
      <div class="row">
        <a class="btn small secondary" href="/api/v1/reports/${pid}/activity.csv?days=${days}">⬇ ${t('download_activity')}</a>
        <a class="btn small secondary" href="/api/v1/reports/${pid}/games.csv">⬇ ${t('download_report')}</a>
        <button class="btn small secondary" id="print">🖨 ${t('print_report')}</button>
      </div>
    </div>

    <div class="print-only"><h2>${ctx.patient.name} — ${t('report')} (${days === 1 ? t('today') : `last ${days} days`})</h2><p>Printed ${new Date().toLocaleString('en-IN')}</p></div>

    <div class="grid three">
      <div class="card"><div class="muted">${t('last_active')}</div><div class="stat" style="font-size:1.5rem">${ago(r.lastActive)}</div><div class="small muted">${r.lastActivity || ''}</div></div>
      <div class="card"><div class="muted">${t('activities')}</div><div class="stat">${r.totals.activities}</div><div class="small muted">${r.totals.activeDays} ${t('active_days').toLowerCase()} of ${days}</div></div>
      <div class="card"><div class="muted">${t('reminder_adherence')}</div><div class="stat">${pct(r.reminders.adherence)}</div><div class="small muted">${r.reminders.done} of ~${r.reminders.expected} (${r.reminders.active} daily reminders)</div></div>
      <div class="card"><div class="muted">${t('sessions')}</div><div class="stat">${r.games.sessions}</div><div class="small muted">${t('accuracy')} ${pct(r.games.avgAccuracy)} · ${r.games.minutes} min</div></div>
      <div class="card"><div class="muted">Mood (voice diary)</div><div style="font-size:1.3rem;margin-top:6px">${Object.keys(r.moods).length ? Object.entries(r.moods).map(([m, n]) => html`<span style="margin-right:12px">${{ happy: '😊', okay: '🙂', sad: '😢', confused: '😕' }[m]} ${n}</span>`) : html`<span class="muted small">no diary entries</span>`}</div></div>
      <div class="card"><div class="muted">${t('alerts')}</div><div style="margin-top:6px">${Object.keys(r.alerts).length ? Object.entries(r.alerts).map(([k, n]) => html`<span class="badge ${k === 'sos' ? 'high' : 'medium'}" style="margin:2px">${k.replace('_', ' ')}: ${n}</span>`) : html`<span class="badge">none ✔</span>`}</div></div>
    </div>

    <div class="grid two" style="margin-top:16px">
      <div class="card"><h3>What they did</h3>
        ${Object.keys(r.byType).length ? html`<ul class="list">${Object.entries(r.byType).map(([k, n]) => html`
          <li><a href="${link({ type: k, page: 1 })}" style="text-decoration:none;color:inherit">${ACT[k]?.icon} ${t('act_' + k)}</a>
            <span style="flex:1;margin:0 12px"><span class="bar" style="display:block"><i style="width:${Math.round((n / Math.max(...Object.values(r.byType))) * 100)}%;background:${ACT[k]?.color}"></i></span></span><strong>${n}</strong></li>`)}</ul>` : html`<p class="muted">${t('no_data')}</p>`}
      </div>
      <div class="card chart"><h3>Activity per day</h3>${dailyChart(r.daily, days)}</div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="row spread"><h3 style="margin:0">${type ? html`${ACT[type]?.icon} ${t('act_' + type)}` : t('all_types')} (${timeline.total})</h3>
        ${type ? html`<a class="btn small secondary no-print" href="${link({ type: '', page: 1 })}">✕ ${t('all_types')}</a>` : ''}</div>
      <ul class="list" id="timeline">${timeline.items.map((a) => activityRow(a))}</ul>
      ${timeline.items.length ? '' : html`<p class="muted">${t('no_data')}</p>`}
      <div class="no-print">${pager(timeline, (p) => link({ page: p }))}</div>
    </div>`);

  $('#print', box).addEventListener('click', () => window.print());

  // Live: when the patient does something, re-render (only on page 1 of this view)
  const onActivity = (e) => {
    if (e.detail.patientId === pid && box.isConnected && page === 1) reportTab(box, pid, ctx);
  };
  window.addEventListener('smriti:activity', onActivity);
  window.addEventListener('hashchange', () => window.removeEventListener('smriti:activity', onActivity), { once: true });
}

// Stacked bar chart: one bar per day, one colour per activity type
function dailyChart(daily, days) {
  if (!daily.length) return html`<p class="muted">${t('no_data')}</p>`;
  const W = 640, H = 220, P = 30;
  const max = Math.max(...daily.map((d) => d.total));
  const bw = Math.max(4, Math.min(40, (W - 2 * P) / daily.length - 4));
  const x = (i) => P + i * ((W - 2 * P) / daily.length) + 2;
  const every = Math.ceil(daily.length / 8);
  return html`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Activities per day">
    <line class="axis" x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}"/>
    <text x="2" y="${P}">${max}</text><text x="10" y="${H - P}">0</text>
    ${daily.map((d, i) => {
      let y = H - P;
      return html`<g><title>${d.date}: ${d.total} activities</title>${Object.entries(d.byType).map(([k, n]) => {
        const h = (n / max) * (H - 2 * P);
        y -= h;
        return html`<rect x="${x(i)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" fill="${ACT[k]?.color || '#999'}"/>`;
      })}</g>${i % every === 0 ? html`<text x="${x(i)}" y="${H - 10}">${d.date.slice(5)}</text>` : ''}`;
    })}
  </svg>
  <div class="small row" style="gap:8px;margin-top:6px">${Object.entries(ACT).map(([k, v]) => html`<span><span style="display:inline-block;width:10px;height:10px;background:${v.color};border-radius:2px"></span> ${t('act_' + k)}</span>`)}</div>`;
}
