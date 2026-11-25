// Caregiver screens: dashboard, activity report, family, alerts, memories, reminders, chat, care team.
import { html, mount, $, $$, toast, modal, fmtDate, fmtTime, showFormErrors } from '../lib.js';
import { api } from '../api.js';
import { t } from '../i18n.js';
import { getSocket, connectSocket } from '../realtime.js';
import { pager } from './patient.js';
import { GAMES, gameKey } from '../games/index.js';
import { familyTab } from './family.js';
import { reportTab, activityRow, ago } from './report.js';

const SEV_ICON = { high: '🔴', medium: '🟠', low: '⚪' };
const TYPE_LABEL = { sos: 'SOS / Help', cognitive_decline: 'Score decline', missed_reminder: 'Missed reminder', inactivity: 'Inactivity' };
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

/* ------------------------------ Dashboard ------------------------------ */
export async function dashboard(el, params, ctx) {
  const [{ patients }, alerts] = await Promise.all([api('/patients'), api('/alerts?limit=10')]);
  // Today's report for every patient (one request each, in parallel)
  const today = await Promise.all(patients.map((p) => api(`/reports/${p.id}/activity?days=1&limit=6`).catch(() => null)));
  const feed = today
    .flatMap((r, i) => (r ? r.timeline.items.map((a) => ({ ...a, who: patients[i].name })) : []))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 12);
  const todayLine = (r) => {
    if (!r) return '';
    const b = r.report.today;
    const parts = [b.game && `🧩 ${b.game} games`, b.reminder_done && `💊 ${b.reminder_done} reminders`, b.journal && `📔 diary`, b.companion_chat && `💬 ${b.companion_chat} chats`, b.quiz && `❓ quiz`, b.sos && `🆘 help pressed`].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'No activity yet today';
  };

  mount(el, html`
    <div class="page">
      <div class="row spread"><h1 style="margin:0">${t('my_patients')}</h1><a class="btn" href="#/connect">🔗 ${t('connect_patient')}</a></div>
      ${patients.length ? '' : html`<div class="card" style="margin-top:16px"><p>You are not connected to any patient yet.</p><a class="btn" href="#/connect">🔗 ${t('connect_patient')}</a></div>`}
      <div class="grid two" style="margin-top:16px">
        ${patients.map((p, i) => html`
          <a class="card" href="#/patient/${p.id}/report" style="text-decoration:none;color:inherit">
            <div class="row spread"><h2 style="margin:0">${p.name}</h2>
              ${p.openAlerts ? html`<span class="badge high">${p.openAlerts} ${t('open_alerts')}</span>` : html`<span class="badge">✔ OK</span>`}</div>
            <p class="muted" style="margin:.3em 0">${[p.relation && `you are their ${p.relation}`, p.profile?.age && `${p.profile.age} yrs`, p.profile?.hometown, p.profile?.dementiaStage && `${p.profile.dementiaStage} stage`].filter(Boolean).join(' · ')}</p>
            <div class="small"><strong>${t('today')}:</strong> ${todayLine(today[i])}</div>
            <div class="small muted">${t('last_active')}: ${ago(today[i]?.report.lastActive)}</div>
          </a>`)}
      </div>
      <div class="grid two" style="margin-top:24px;align-items:start">
        <div><h2>${t('open_alerts')}</h2>
          <div class="card"><ul class="list" id="alerts">${alerts.items.length ? alerts.items.map(alertRow) : html`<li class="muted">No open alerts 🎉</li>`}</ul></div></div>
        <div><h2>📡 ${t('live_activity')}</h2>
          <div class="card"><ul class="list" id="feed">${feed.length ? feed.map((a) => activityRow(a, a.who)) : html`<li class="muted">Nothing in the last 24 hours</li>`}</ul></div></div>
      </div>
    </div>`);
  bindAck(el, () => dashboard(el, params, ctx));
  liveRefresh(el, () => dashboard(el, params, ctx));

  // New activity arrives over Socket.IO -> put it at the top of the feed
  const names = Object.fromEntries(patients.map((p) => [p.id, p.name]));
  const onActivity = (e) => {
    const list = $('#feed', el);
    if (!list) return;
    if (list.querySelector('.muted')) list.innerHTML = '';
    list.insertAdjacentHTML('afterbegin', String(activityRow(e.detail, names[e.detail.patientId] || '')));
  };
  window.addEventListener('smriti:activity', onActivity);
  window.addEventListener('hashchange', () => window.removeEventListener('smriti:activity', onActivity), { once: true });
}

const alertRow = (a) => html`
  <li><div><div>${SEV_ICON[a.severity]} <strong>${TYPE_LABEL[a.type] || a.type}</strong> ${a.patient ? html`· ${a.patient.name}` : ''}</div>
    <div>${a.message}</div><div class="muted small">${fmtDate(a.createdAt)} ${fmtTime(a.createdAt)}</div></div>
    ${a.acknowledged ? html`<span class="badge low">seen</span>` : html`<button class="btn small" data-ack="${a.id}">${t('acknowledge')}</button>`}</li>`;

function bindAck(el, refresh) {
  $$('[data-ack]', el).forEach((b) => b.addEventListener('click', async () => {
    await api(`/alerts/${b.dataset.ack}/ack`, { method: 'PATCH' });
    refresh();
  }));
}

// Re-render when a live alert arrives, but only while this view is on screen
function liveRefresh(el, refresh) {
  const handler = () => { if (el.isConnected) refresh(); };
  window.addEventListener('smriti:alert', handler, { once: true });
  window.addEventListener('hashchange', () => window.removeEventListener('smriti:alert', handler), { once: true });
}

/* --------------------------- Patient detail ---------------------------- */
const TABS = ['report', 'overview', 'family', 'alerts', 'memories', 'reminders', 'chat', 'journal', 'team'];

export async function patientDetail(el, [id, tab = 'report', page], ctx) {
  const pid = Number(id);
  const { patient, careTeam } = await api(`/patients/${pid}`);
  const labels = { report: t('report'), family: t('family'), overview: 'Games', alerts: t('alerts'), memories: t('memories'), reminders: t('reminders'), chat: t('chat'), journal: t('journal'), team: t('care_team') };
  mount(el, html`
    <div class="page">
      <div class="row spread">
        <div><a href="#/dashboard">← ${t('my_patients')}</a><h1 style="margin:.2em 0">${patient.name}</h1>
          <p class="muted" style="margin:0">${[patient.profile?.age && `${patient.profile.age} yrs`, patient.profile?.hometown, patient.profile?.state, patient.profile?.dementiaStage && `${patient.profile.dementiaStage} stage`, `language: ${patient.language}`].filter(Boolean).join(' · ')}</p></div>
        ${patient.profile?.careCode ? html`<div class="card small" style="padding:8px 14px">${t('care_code')}: <strong style="letter-spacing:.2em">${patient.profile.careCode}</strong></div>` : ''}
      </div>
      <nav class="tabs no-print" role="tablist">${TABS.map((k) => html`<a role="tab" class="tab ${k === tab ? 'active' : ''}" href="#/patient/${pid}/${k}">${labels[k]}</a>`)}</nav>
      <section id="tab"></section>
    </div>`);
  const box = $('#tab', el);
  const views = { report: reportTab, family: familyTab, overview, alerts: alertsTab, memories: memoriesTab, reminders: remindersTab, chat: chatTab, journal: journalTab, team: teamTab };
  await (views[tab] || reportTab)(box, pid, { ...ctx, careTeam, patient, page: Number(page) || 1, rerender: () => patientDetail(el, [id, tab, page], ctx) });
}

/* Overview: stats from /api/v1, trend label from /api/v2 (API versioning demo) */
async function overview(box, pid) {
  const [s, v2] = await Promise.all([api(`/games/stats/${pid}?days=30`), api(`/games/stats/${pid}`, { version: 'v2' })]);
  const trendBadge = { improving: html`<span class="badge">📈 improving</span>`, stable: html`<span class="badge low">➖ stable</span>`, declining: html`<span class="badge high">📉 declining</span>` }[v2.trend];
  mount(box, html`
    <div class="grid three">
      <div class="card"><div class="muted">${t('sessions')}</div><div class="stat">${s.totals.sessions}</div><div class="small muted">${t('last_30_days')}</div></div>
      <div class="card"><div class="muted">${t('accuracy')}</div><div class="stat">${pct(s.totals.avgAccuracy)}</div><div>${trendBadge}</div></div>
      <div class="card"><div class="muted">${t('minutes')}</div><div class="stat">${s.totals.minutes}</div><div class="small muted">${t('last_30_days')}</div></div>
    </div>
    <div class="card chart" style="margin-top:16px"><h3>Daily accuracy (${t('last_30_days')})</h3>${lineChart(s.daily)}</div>
    <div class="card" style="margin-top:16px"><h3>By game</h3>
      ${s.byGame.length ? html`<div class="table-wrap"><table><thead><tr><th>Game</th><th>${t('sessions')}</th><th>${t('accuracy')}</th><th>Avg level</th><th>Last played</th></tr></thead><tbody>
        ${s.byGame.map((g) => html`<tr><td>${GAMES.find((x) => x.type === g.gameType)?.icon} ${t(gameKey(g.gameType))}</td><td>${g.sessions}</td>
          <td style="min-width:140px"><div class="bar"><i style="width:${Math.round(g.avgAccuracy * 100)}%"></i></div>${pct(g.avgAccuracy)}</td><td>${g.avgDifficulty}</td><td>${fmtDate(g.lastPlayed)}</td></tr>`)}
      </tbody></table></div>` : html`<p class="muted">${t('no_data')}</p>`}
    </div>`);
}

// Hand-drawn SVG line chart — no chart library needed
function lineChart(daily) {
  if (daily.length < 2) return html`<p class="muted">${t('no_data')}</p>`;
  const W = 640, H = 220, P = 34;
  const x = (i) => P + (i * (W - 2 * P)) / (daily.length - 1);
  const y = (v) => H - P - v * (H - 2 * P);
  const pts = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.avgAccuracy).toFixed(1)}`).join(' ');
  const every = Math.ceil(daily.length / 6);
  return html`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily accuracy line chart">
    ${[0, 0.5, 1].map((v) => html`<line class="axis" x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}"/><text x="4" y="${y(v) + 4}">${v * 100}%</text>`)}
    <polyline class="line" points="${pts}"/>
    ${daily.map((d, i) => html`<circle class="dot" cx="${x(i)}" cy="${y(d.avgAccuracy)}" r="4"><title>${d.date}: ${pct(d.avgAccuracy)} (${d.sessions} games)</title></circle>
      ${i % every === 0 ? html`<text x="${x(i) - 16}" y="${H - 8}">${d.date.slice(5)}</text>` : ''}`)}
  </svg>`;
}

async function alertsTab(box, pid, ctx) {
  const { items } = await api(`/alerts?status=all&patientId=${pid}&limit=50`);
  mount(box, html`<div class="card"><ul class="list">${items.length ? items.map(alertRow) : html`<li class="muted">No alerts.</li>`}</ul></div>`);
  bindAck(box, ctx.rerender);
  liveRefresh(box, ctx.rerender);
}

/* Memories: CRUD + photo upload + semantic search */
async function memoriesTab(box, pid, ctx) {
  const data = await api(`/memories/${pid}?page=${ctx.page}&limit=6`);
  const canEdit = true;
  mount(box, html`
    <div class="row spread" style="margin-bottom:12px">
      <form id="search" class="row" style="flex:1;min-width:260px"><input name="q" placeholder="${t('search_memories')}" style="flex:1"><button class="btn secondary">🔎</button></form>
      ${canEdit ? html`<button class="btn" id="add">＋ ${t('add')}</button>` : ''}
    </div>
    <div id="results"></div>
    <div class="grid three">
      ${data.items.map((m) => html`
        <div class="card memory">
          <div class="ph">${m.photoUrl ? html`<img src="${m.photoUrl}" alt="">` : '🖼️'}</div>
          <div class="body"><h3>${m.title}</h3>
            <div class="muted small">${[m.place, m.year].filter(Boolean).join(' · ')}</div>
            <p class="small">${m.description}</p>
            ${m.people?.length ? html`<p class="small">👪 ${m.people.map((p) => `${p.name} (${p.relation})`).join(', ')}</p>` : ''}
            ${canEdit ? html`<div class="row"><button class="btn small secondary" data-edit="${m._id}">${t('edit')}</button><button class="btn small danger" data-del="${m._id}">${t('delete')}</button></div>` : ''}
          </div></div>`)}
    </div>
    ${data.items.length ? '' : html`<p class="muted">${t('no_memories')}</p>`}
    ${pager(data, (p) => `#/patient/${pid}/memories/${p}`)}`);

  $('#search', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api(`/memories/${pid}/search?q=${encodeURIComponent(e.target.q.value)}`);
      mount($('#results', box), html`<div class="card" style="margin-bottom:16px"><strong>Closest matches for “${r.query}”</strong>
        <ul class="list">${r.results.length ? r.results.map((m) => html`<li><span>${m.title} <span class="muted small">${m.place || ''}</span></span><span class="badge">score ${m.score}</span></li>`) : html`<li class="muted">No match</li>`}</ul></div>`);
    } catch (err) { toast(err.message, 'danger'); }
  });
  const addBtn = $('#add', box);
  if (addBtn) addBtn.addEventListener('click', () => memoryForm(pid, null, ctx.rerender));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => memoryForm(pid, data.items.find((m) => m._id === b.dataset.edit), ctx.rerender)));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this memory?')) return;
    await api(`/memories/${pid}/${b.dataset.del}`, { method: 'DELETE' });
    ctx.rerender();
  }));
}

function memoryForm(pid, m, done) {
  const people = (m?.people || []).map((p) => `${p.name} - ${p.relation}`).join('\n');
  const dlg = modal(String(html`
    <h2>${m ? t('edit') : t('add')} — ${t('memories')}</h2>
    <form id="mf" novalidate>
      <div class="field"><label>${t('title')}</label><input name="title" value="${m?.title || ''}" required></div>
      <div class="field"><label>${t('description')}</label><textarea name="description">${m?.description || ''}</textarea></div>
      <div class="row"><div class="field" style="flex:2"><label>${t('place')}</label><input name="place" value="${m?.place || ''}"></div>
        <div class="field" style="flex:1"><label>${t('year')}</label><input name="year" type="number" value="${m?.year || ''}"></div></div>
      <div class="field"><label>${t('people')}</label><textarea name="people" placeholder="Rupam - son&#10;Moni - granddaughter" style="min-height:80px">${people}</textarea></div>
      <div class="field"><label>${t('tags')}</label><input name="tags" value="${(m?.tags || []).join(', ')}"></div>
      <div class="field"><label>${t('photo')}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
      <div class="row"><button class="btn">${t('save')}</button><button type="button" class="btn secondary" id="cx">${t('cancel')}</button></div>
    </form>`));
  dlg.el.querySelector('#cx').addEventListener('click', dlg.close);
  const f = dlg.el.querySelector('#mf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const list = String(fd.get('people') || '').split('\n').map((l) => l.split(/\s+[-–]\s+/)).filter(([n]) => n && n.trim()).map(([name, relation = '']) => ({ name: name.trim(), relation: relation.trim() }));
    fd.set('people', JSON.stringify(list));
    if (!fd.get('photo')?.size) fd.delete('photo');
    if (!fd.get('year')) fd.delete('year');
    try {
      await api(m ? `/memories/${pid}/${m._id}` : `/memories/${pid}`, { method: m ? 'PUT' : 'POST', form: fd });
      dlg.close();
      toast(t('saved'), 'ok');
      done();
    } catch (err) { showFormErrors(f, err); }
  });
}

/* Reminders CRUD (PostgreSQL) */
async function remindersTab(box, pid, ctx) {
  const { reminders } = await api(`/reminders/${pid}`);
  mount(box, html`
    <form class="card row" id="rf" style="margin-bottom:16px;align-items:flex-end">
      <div style="flex:2;min-width:180px"><label>${t('title')}</label><input name="title" placeholder="Morning BP tablet" required></div>
      <div style="flex:1;min-width:120px"><label>${t('time')}</label><input name="time" type="time" required></div>
      <div style="flex:1;min-width:140px"><label>${t('kind')}</label><select name="kind"><option>medicine</option><option>meal</option><option>water</option><option>activity</option></select></div>
      <button class="btn">＋ ${t('add')}</button>
    </form>
    <div class="card"><ul class="list">
      ${reminders.map((r) => html`<li>
        <span><strong>${r.time}</strong> · ${r.title} <span class="badge low">${r.kind}</span> ${r.doneToday ? html`<span class="badge">✔ ${t('done_today')}</span>` : ''}</span>
        <span class="row"><label class="row small" style="font-weight:400"><input type="checkbox" data-toggle="${r.id}" ${r.active ? 'checked' : ''} style="width:auto;min-height:auto"> active</label>
        <button class="btn small danger" data-del="${r.id}">${t('delete')}</button></span></li>`)}
      ${reminders.length ? '' : html`<li class="muted">${t('no_data')}</li>`}
    </ul></div>`);
  const f = $('#rf', box);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/reminders/${pid}`, { method: 'POST', body: Object.fromEntries(new FormData(f)) }); ctx.rerender(); } catch (err) { showFormErrors(f, err); }
  });
  $$('[data-toggle]', box).forEach((c) => c.addEventListener('change', () => api(`/reminders/item/${c.dataset.toggle}`, { method: 'PATCH', body: { active: c.checked } }).catch((e) => toast(e.message, 'danger'))));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => { await api(`/reminders/item/${b.dataset.del}`, { method: 'DELETE' }); ctx.rerender(); }));
}

/* Family chat over Socket.IO */
async function chatTab(box, pid, ctx) {
  const hist = await api(`/chat/${pid}?limit=50`);
  const me = ctx.store.user.id;
  mount(box, html`
    <div class="card">
      <div class="chat" id="log"></div>
      <div class="muted small" id="typing" style="min-height:1.4em"></div>
      <form class="chat-input" id="cf"><input name="text" placeholder="${t('type_here')}" autocomplete="off" maxlength="1000"><button class="btn">${t('send')}</button></form>
    </div>`);
  const log = $('#log', box);
  const add = (m) => {
    const b = document.createElement('div');
    b.className = `bubble ${m.senderId === me ? 'me' : ''}`;
    b.innerHTML = String(html`<div class="meta">${m.senderName} · ${m.senderRole} · ${fmtTime(m.createdAt)}</div>`);
    b.append(document.createTextNode(m.text));
    log.append(b);
    log.scrollTop = log.scrollHeight;
  };
  hist.items.forEach(add);

  const socket = getSocket() || connectSocket();
  socket.emit('chat:join', { patientId: pid }, (res) => { if (!res.ok) toast(res.error, 'danger'); });
  const onMsg = (m) => { if (m.patientId === pid && box.isConnected) add(m); };
  let typingTimer;
  const onTyping = ({ name }) => { $('#typing', box).textContent = `${name} is typing…`; clearTimeout(typingTimer); typingTimer = setTimeout(() => { $('#typing', box).textContent = ''; }, 1500); };
  socket.on('chat:message', onMsg);
  socket.on('chat:typing', onTyping);
  window.addEventListener('hashchange', () => { socket.off('chat:message', onMsg); socket.off('chat:typing', onTyping); }, { once: true });

  const f = $('#cf', box);
  f.text.addEventListener('input', () => socket.emit('chat:typing', { patientId: pid }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = f.text.value.trim();
    if (!text) return;
    socket.emit('chat:send', { patientId: pid, text }, (res) => { if (!res.ok) toast(res.error, 'danger'); });
    f.text.value = '';
  });
}

async function journalTab(box, pid, ctx) {
  const data = await api(`/journal/${pid}?page=${ctx.page}&limit=10`);
  const moodIcon = { happy: '😊', okay: '🙂', sad: '😢', confused: '😕' };
  mount(box, html`
    <div class="stack">${data.items.map((j) => html`<div class="card"><div class="muted small">${fmtDate(j.createdAt)} ${fmtTime(j.createdAt)} · ${j.language} ${moodIcon[j.mood] || ''}</div><p style="margin:.3em 0 0">${j.text}</p></div>`)}
    ${data.items.length ? '' : html`<p class="muted">${t('no_data')}</p>`}</div>
    ${pager(data, (p) => `#/patient/${pid}/journal/${p}`)}`);
}

async function teamTab(box, pid, ctx) {
  const me = ctx.store.user.id;
  mount(box, html`
    <div class="grid two" style="align-items:start">
      <div class="card"><h3>${t('care_team')}</h3>
        <ul class="list">${ctx.careTeam.map((c) => html`<li><span><strong>${c.name}</strong>${c.relation ? ` · ${c.relation}` : ''}${c.id === me ? ' (you)' : ''}<br><span class="muted small">${c.email} · since ${fmtDate(c.since)}</span></span>
          ${c.id === me ? html`<button class="btn small danger" id="leave">${t('leave_patient')}</button>` : ''}</li>`)}</ul>
      </div>
      <div class="stack">
        <div class="card"><h3>${t('care_code')}</h3>
          <p class="muted small">Other family members can connect with this code from their own caregiver account (“${t('connect_patient')}”).</p>
          <p style="font-size:2rem;font-weight:700;letter-spacing:.3em;margin:0">${ctx.patient.profile?.careCode || '—'}</p></div>
        <form class="card" id="tf">
          <h3>${t('invite_caregiver')}</h3>
          <div class="field"><label>${t('email')}</label><input name="email" type="email" required placeholder="sister@example.com"></div>
          <div class="field"><label>${t('relation')}</label><input name="relation" placeholder="daughter, nephew…"></div>
          <button class="btn">＋ ${t('add')}</button>
        </form>
      </div>
    </div>`);
  const f = $('#tf', box);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api(`/patients/${pid}/care-team`, { method: 'POST', body: Object.fromEntries(new FormData(f)) }); toast(t('saved'), 'ok'); ctx.rerender(); } catch (err) { showFormErrors(f, err); }
  });
  const leave = $('#leave', box);
  if (leave) leave.addEventListener('click', async () => {
    if (!confirm(`Stop caring for ${ctx.patient.name}? You will no longer see their reports or alerts.`)) return;
    await api(`/patients/${pid}/care-team/${me}`, { method: 'DELETE' });
    toast('Disconnected', 'ok');
    ctx.go('dashboard');
  });
}
