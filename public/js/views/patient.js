// Patient screens: very large, one task per screen, everything can be read aloud.
import { html, mount, $, $$, modal, toast, fmtDate, fmtTime, longDate } from '../lib.js';
import { api } from '../api.js';
import { t, currentLang } from '../i18n.js';
import { speak, listen, canListen, matchCommand, voiceErrorMessage } from '../voice.js';
import { GAMES, gameKey } from '../games/index.js';
import { localRelation } from '../games/faceRecall.js';

const backRow = (to = 'home') => html`<div class="back-row"><a class="btn secondary" href="#/${to}">← ${t('back')}</a></div>`;

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? t('good_morning') : h < 17 ? t('good_afternoon') : t('good_evening');
}

/* ------------------------------- Home --------------------------------- */
export async function home(el, params, ctx) {
  const lang = currentLang();
  const { user } = await api('/auth/me');
  const { reminders } = await api(`/reminders/${user.id}`);
  const now = new Date();
  const nowHM = now.toTimeString().slice(0, 5);
  const next = reminders.find((r) => r.active && !r.doneToday && r.time >= nowHM);
  const first = user.name.split(' ')[0];
  const dateText = longDate(now, lang);
  const place = user.profile?.hometown;

  // Reality orientation: name, day, date, time and place — standard dementia-care practice
  mount(el, html`
    <div class="page">
      <section class="greeting">
        <h1>${greetingWord()}, ${first} 🙏</h1>
        <p class="orient">${t('today_is')} <strong>${dateText}</strong> · ${fmtTime(now, lang)}</p>
        ${place ? html`<p class="orient">🏡 ${t('you_are_at')} ${place}</p>` : ''}
        <button class="btn ghost" id="read">🔊 ${t('read_aloud')}</button>
      </section>
      ${next ? html`
        <div class="card row spread" style="margin-top:16px;border:3px solid var(--accent)">
          <div><div class="muted">⏰ ${next.time}</div><strong style="font-size:1.3rem">${next.title}</strong></div>
          <button class="btn" data-done="${next.id}">✔ ${t('mark_done')}</button>
        </div>` : ''}
      <nav class="tiles" aria-label="Main">
        ${tile('games', '🧩', t('play_games'), t('game_memory_match'))}
        ${tile('family', '👪', t('my_family'))}
        ${tile('memories', '📸', t('my_memories'))}
        ${tile('reminders', '⏰', t('reminders'))}
        ${tile('companion', '💬', t('talk_smriti'))}
        ${tile('quiz', '❓', t('memory_quiz'))}
        ${tile('journal', '📔', t('journal'))}
      </nav>
      <p class="muted center" style="margin-top:20px">${t('voice_hint')}</p>
    </div>`);

  const sentence = `${greetingWord()}, ${first}. ${t('today_is')} ${dateText}. ${place ? `${t('you_are_at')} ${place}.` : ''}`;
  $('#read', el).addEventListener('click', () => speak(sentence));
  const doneBtn = $('[data-done]', el);
  if (doneBtn) doneBtn.addEventListener('click', async () => {
    await api(`/reminders/item/${doneBtn.dataset.done}/done`, { method: 'POST' });
    toast(t('saved'), 'ok');
    home(el, params, ctx);
  });
}

const tile = (to, icon, label, sub) => html`<a class="tile" href="#/${to}"><span class="ico">${icon}</span><span>${label}${sub ? html`<small>${sub}…</small>` : ''}</span></a>`;

/* --------------------------- Voice command ---------------------------- */
export async function voiceCommand(btn, ctx) {
  if (!canListen()) return toast(t('voice_not_supported'));
  btn.classList.add('listening');
  btn.lastChild.textContent = t('listening');
  try {
    const text = await listen();
    const cmd = matchCommand(text);
    if (cmd === 'help') ctx.sos();
    else if (cmd) ctx.go(cmd);
    else if (text) { toast(`“${text}”`); speak(t('voice_hint')); }
  } catch (e) {
    const msg = voiceErrorMessage(e, t);
    toast(msg);
    speak(msg); // the patient hears why, not just reads it
  } finally {
    btn.classList.remove('listening');
    btn.lastChild.textContent = t('speak');
  }
}

/* ---------------------------- Reminder alarm --------------------------- */
export function reminderAlarm(r) {
  const text = `${t('reminder_now')} ${r.title}`;
  speak(text);
  const m = modal(String(html`
    <div class="stack">
      <div style="font-size:4rem">⏰</div>
      <h2>${t('reminder_now')}</h2>
      <p style="font-size:1.6rem;font-weight:700">${r.title}</p>
      <button class="btn big block" id="ok">✔ ${t('mark_done')}</button>
    </div>`), { cls: 'alarm' });
  m.el.querySelector('#ok').addEventListener('click', async () => {
    await api(`/reminders/item/${r.id}/done`, { method: 'POST' }).catch(() => {});
    m.close();
    toast(t('saved'), 'ok');
  });
}

/* -------------------------------- Games -------------------------------- */
export function games(el) {
  mount(el, html`
    <div class="page">
      ${backRow()}
      <h1>🧩 ${t('play_games')}</h1>
      <div class="tiles">
        ${GAMES.map((g) => html`
          <a class="tile" href="#/play/${g.type}"><span class="ico">${g.icon}</span>
            <span>${t(gameKey(g.type))}<small>${t(gameKey(g.type) + '_desc')}</small></span></a>`)}
      </div>
    </div>`);
}

export async function play(el, [type], ctx) {
  const game = GAMES.find((g) => g.type === type);
  if (!game) return ctx.go('games');
  const lang = currentLang();
  const start = await api(`/games/${type}/start`);

  mount(el, html`
    <div class="page">
      <div class="game-head">
        <a class="btn secondary" href="#/games">← ${t('back')}</a>
        <h1 style="margin:0">${game.icon} ${t(gameKey(type))}</h1>
        <span class="badge">${t('level')} ${start.difficulty} / 5</span>
      </div>
      <div id="board"></div>
    </div>`);

  const result = await game.module.play($('#board', el), { ...start, t, speak, lang });
  if (!result || !el.isConnected) return;

  const saved = await api(`/games/${type}/result`, { method: 'POST', body: result });
  const ratio = result.score / result.maxScore;
  const stars = ratio >= 0.85 ? 3 : ratio >= 0.5 ? 2 : 1;
  const msg = ratio >= 0.5 ? t('well_done') : t('good_try'); // always encouraging
  mount($('#board', el), html`
    <div class="card result stack">
      <div class="stars" aria-label="${stars} stars">${'⭐'.repeat(stars)}</div>
      <h2>${msg}</h2>
      <div class="muted">${t('your_score')}</div>
      <div class="score">${result.score} / ${result.maxScore}</div>
      <p class="muted small">${saved.next.reason}</p>
      <div class="row" style="justify-content:center">
        <a class="btn big" href="#/play/${type}" id="again">🔁 ${t('play_again')}</a>
        <a class="btn big secondary" href="#/games">${t('back')}</a>
      </div>
    </div>`);
  speak(`${msg} ${t('your_score')} ${result.score} / ${result.maxScore}`);
  // same hash would not trigger a route change, so restart manually
  $('#again', el).addEventListener('click', (e) => { e.preventDefault(); play(el, [type], ctx); });
}

/* ------------------------------- Memories ------------------------------ */
export async function memories(el, params, ctx) {
  const page = Number(params[0]) || 1;
  const { user } = ctx.store;
  const data = await api(`/memories/${user.id}?page=${page}&limit=6`);
  mount(el, html`
    <div class="page">
      ${backRow()}
      <h1>📸 ${t('my_memories')}</h1>
      ${data.items.length ? '' : html`<div class="card center"><p>${t('no_memories')}</p></div>`}
      <div class="grid three">
        ${data.items.map((m) => html`
          <button class="card memory" data-id="${m._id}" style="text-align:left;font:inherit;cursor:pointer">
            <div class="ph">${m.photoUrl ? html`<img src="${m.photoUrl}" alt="">` : '🖼️'}</div>
            <div class="body"><h3>${m.title}</h3><div class="muted">${[m.place, m.year].filter(Boolean).join(' · ')}</div></div>
          </button>`)}
      </div>
      ${pager(data, (p) => `#/memories/${p}`)}
    </div>`);
  $$('[data-id]', el).forEach((b) => b.addEventListener('click', () => {
    const m = data.items.find((x) => x._id === b.dataset.id);
    const people = (m.people || []).map((p) => `${p.name} (${p.relation})`).join(', ');
    const story = [m.title, m.place && `${m.place}${m.year ? `, ${m.year}` : ''}`, people, m.description].filter(Boolean).join('. ');
    const dlg = modal(String(html`
      <div class="stack">
        ${m.photoUrl ? html`<img src="${m.photoUrl}" alt="" style="border-radius:16px">` : ''}
        <h2>${m.title}</h2>
        <p class="muted">${[m.place, m.year].filter(Boolean).join(' · ')}</p>
        ${people ? html`<p>👪 ${people}</p>` : ''}
        <p style="font-size:1.2rem">${m.description}</p>
        <div class="row"><button class="btn big" id="say">🔊 ${t('read_aloud')}</button><button class="btn big secondary" id="x">${t('done')}</button></div>
      </div>`));
    dlg.el.querySelector('#say').addEventListener('click', () => speak(story));
    dlg.el.querySelector('#x').addEventListener('click', dlg.close);
    speak(story);
    api(`/memories/${user.id}/${m._id}/viewed`, { method: 'POST' }).catch(() => {}); // for the caregiver's report
  }));
}

export function pager(data, href) {
  if (data.totalPages <= 1) return '';
  return html`<div class="pager">
    ${data.page > 1 ? html`<a class="btn secondary" href="${href(data.page - 1)}">←</a>` : ''}
    <span>${data.page} / ${data.totalPages}</span>
    ${data.page < data.totalPages ? html`<a class="btn secondary" href="${href(data.page + 1)}">→</a>` : ''}
  </div>`;
}

/* ------------------------------ Reminders ------------------------------ */
export async function reminders(el, params, ctx) {
  const { reminders: list } = await api(`/reminders/${ctx.store.user.id}`);
  const icon = { medicine: '💊', meal: '🍛', water: '💧', activity: '🚶' };
  const active = list.filter((r) => r.active);
  mount(el, html`
    <div class="page">
      ${backRow()}
      <h1>⏰ ${t('reminders')}</h1>
      <div class="stack">
        ${active.map((r) => html`
          <div class="card row spread" style="${r.doneToday ? 'opacity:.65' : ''}">
            <div class="row"><span style="font-size:2.4rem">${icon[r.kind] || '⏰'}</span>
              <div><div class="muted">${r.time}</div><strong style="font-size:1.3rem">${r.title}</strong></div></div>
            ${r.doneToday ? html`<span class="badge">✔ ${t('done_today')}</span>` : html`<button class="btn" data-done="${r.id}">✔ ${t('mark_done')}</button>`}
          </div>`)}
        ${active.every((r) => r.doneToday) ? html`<p class="card center">${t('no_reminders')}</p>` : ''}
      </div>
    </div>`);
  $$('[data-done]', el).forEach((b) => b.addEventListener('click', async () => {
    await api(`/reminders/item/${b.dataset.done}/done`, { method: 'POST' });
    toast(t('saved'), 'ok');
    reminders(el, params, ctx);
  }));
}

/* ------------------------- Smriti AI companion ------------------------- */
const history = [];
export async function companion(el) {
  mount(el, html`
    <div class="page narrow">
      ${backRow()}
      <h1>💬 ${t('talk_smriti')}</h1>
      <div class="card">
        <div class="chat" id="log" aria-live="polite"></div>
        <form class="chat-input" id="f">
          <button type="button" class="btn secondary" id="talk" aria-label="${t('speak')}">🎤</button>
          <input name="msg" placeholder="${t('type_here')}" autocomplete="off" maxlength="500">
          <button class="btn">${t('send')}</button>
        </form>
      </div>
    </div>`);
  const log = $('#log', el);
  const add = (role, text) => {
    const b = document.createElement('div');
    b.className = `bubble ${role === 'user' ? 'me' : ''}`;
    b.textContent = text;
    log.append(b);
    log.scrollTop = log.scrollHeight;
  };
  if (!history.length) history.push({ role: 'assistant', content: t('smriti_hello') });
  history.forEach((h) => add(h.role, h.content));
  speak(history[history.length - 1].content);

  const send = async (text) => {
    text = text.trim();
    if (!text) return;
    add('user', text);
    try {
      const res = await api('/ai/companion', { method: 'POST', body: { message: text, history: history.slice(-6) } });
      history.push({ role: 'user', content: text }, { role: 'assistant', content: res.reply });
      add('assistant', res.reply);
      speak(res.reply);
    } catch (e) { toast(e.message, 'danger'); }
  };
  const f = $('#f', el);
  f.addEventListener('submit', (e) => { e.preventDefault(); send(f.msg.value); f.msg.value = ''; });
  $('#talk', el).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.classList.add('listening'); b.textContent = '…';
    try { const said = await listen(); if (said) send(said); } catch (err) { const msg = voiceErrorMessage(err, t); toast(msg); speak(msg); }
    b.classList.remove('listening'); b.textContent = '🎤';
  });
}

/* ------------------------------ AI quiz -------------------------------- */
export async function quiz(el) {
  const { questions } = await api('/ai/quiz');
  if (!questions.length) {
    mount(el, html`<div class="page">${backRow()}<div class="card center"><p class="prompt">${t('quiz_none')}</p></div></div>`);
    return speak(t('quiz_none'));
  }
  let i = 0;
  let score = 0;
  const show = () => {
    if (i >= questions.length) {
      api('/ai/quiz/result', { method: 'POST', body: { score, total: questions.length } }).catch(() => {});
      mount(el, html`<div class="page">${backRow()}<div class="card result stack">
        <h2>${t('well_done')}</h2><div class="score">${score} / ${questions.length}</div>
        <a class="btn big" href="#/home">${t('home')}</a></div></div>`);
      return speak(`${t('well_done')} ${score} / ${questions.length}`);
    }
    const q = questions[i];
    mount(el, html`
      <div class="page">${backRow()}
        <h1>❓ ${t('memory_quiz')}</h1>
        <p class="muted center">${i + 1} / ${questions.length}</p>
        <p class="prompt">${q.question}</p>
        <div class="choices">${q.options.map((o, k) => html`<button class="choice" data-k="${k}">${o}</button>`)}</div>
        <div class="feedback" aria-live="polite"></div>
      </div>`);
    speak(q.question);
    $$('.choice', el).forEach((b) => b.addEventListener('click', () => {
      const ok = Number(b.dataset.k) === q.answerIndex;
      $$('.choice', el).forEach((c) => { c.disabled = true; if (Number(c.dataset.k) === q.answerIndex) c.classList.add('right'); });
      if (!ok) b.classList.add('wrong'); else score++;
      const fb = $('.feedback', el);
      fb.className = `feedback ${ok ? 'good' : 'bad'}`;
      fb.textContent = ok ? t('correct') : q.options[q.answerIndex];
      speak(fb.textContent);
      setTimeout(() => { i++; show(); }, 1800);
    }));
  };
  show();
}

/* ----------------------------- Voice diary ----------------------------- */
export async function journal(el, params, ctx) {
  const lang = currentLang();
  const past = await api(`/journal/${ctx.store.user.id}?limit=5`);
  const moods = [['happy', '😊'], ['okay', '🙂'], ['sad', '😢'], ['confused', '😕']];
  mount(el, html`
    <div class="page narrow">
      ${backRow()}
      <h1>📔 ${t('journal')}</h1>
      <form class="card stack" id="f">
        <p>${t('journal_prompt')}</p>
        <button type="button" class="btn big secondary block" id="rec">🎤 ${t('speak')}</button>
        <textarea name="text" placeholder="${t('type_here')}" maxlength="4000"></textarea>
        <div><strong>${t('how_feel')}</strong>
          <div class="row" style="margin-top:8px">${moods.map(([m, e]) => html`
            <label class="btn secondary" style="font-weight:600"><input type="radio" name="mood" value="${m}" style="width:auto;min-height:auto"> ${e} ${t('mood_' + m)}</label>`)}</div></div>
        <button class="btn big block">${t('save')}</button>
      </form>
      <div class="stack" style="margin-top:16px">
        ${past.items.map((j) => html`<div class="card"><div class="muted small">${fmtDate(j.createdAt, lang)} ${j.mood ? `· ${t('mood_' + j.mood)}` : ''}</div><p style="margin:.3em 0 0">${j.text}</p></div>`)}
      </div>
    </div>`);
  speak(t('journal_prompt'));
  const f = $('#f', el);
  $('#rec', el).addEventListener('click', async (e) => {
    const b = e.currentTarget;
    b.classList.add('listening'); b.textContent = `🎤 ${t('listening')}`;
    try { const said = await listen(); if (said) f.text.value = `${f.text.value} ${said}`.trim(); } catch (err) { const msg = voiceErrorMessage(err, t); toast(msg); speak(msg); }
    b.classList.remove('listening'); b.textContent = `🎤 ${t('speak')}`;
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.text.value.trim()) return;
    await api('/journal', { method: 'POST', body: { text: f.text.value, mood: f.mood.value || '', language: lang } });
    toast(t('saved'), 'ok');
    speak(t('saved'));
    journal(el, params, ctx);
  });
}

/* ------------------------------ My family ------------------------------ */
export async function family(el, params, ctx) {
  const lang = currentLang();
  const pid = ctx.store.user.id;
  const [{ members }, { careCode }] = await Promise.all([api(`/family/${pid}?viewed=true`), api('/patients/me/care-code')]);
  const describe = (m) => `${m.name}. ${localRelation(m.relation, lang)}.${m.city ? ` ${t('lives_in', { city: m.city })}.` : ''} ${m.notes || ''}`;
  mount(el, html`
    <div class="page">
      ${backRow()}
      <h1>👪 ${t('my_family')}</h1>
      ${members.length ? '' : html`<div class="card center"><p>${t('no_family')}</p></div>`}
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))">
        ${members.map((m) => html`
          <div class="card row" style="flex-wrap:nowrap;align-items:center">
            ${m.photoUrl ? html`<img src="${m.photoUrl}" alt="" width="110" height="110" style="border-radius:50%;object-fit:cover;flex:none;background:#eee">`
              : html`<span style="width:110px;height:110px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);font-size:3rem;flex:none">👤</span>`}
            <div style="flex:1;min-width:0">
              <h2 style="margin:0">${m.name}</h2>
              <div style="font-size:1.25rem;font-weight:600;color:var(--primary)">${localRelation(m.relation, lang)}</div>
              ${m.city ? html`<div class="muted">🏠 ${t('lives_in', { city: m.city })}</div>` : ''}
              ${m.notes ? html`<div class="small">${m.notes}</div>` : ''}
              <div class="row" style="margin-top:8px">
                <button class="btn secondary" data-say="${m._id}">🔊 ${t('read_aloud')}</button>
                ${m.phone ? html`<a class="btn ${m.isEmergencyContact ? 'danger' : ''}" href="tel:${m.phone.replace(/[^+0-9]/g, '')}">📞 ${t('call')}</a>` : ''}
              </div>
            </div>
          </div>`)}
      </div>
      <div class="card center" style="margin-top:24px">
        <div class="muted">${t('my_family_code')}</div>
        <div style="font-size:2.4rem;font-weight:700;letter-spacing:.35em">${careCode}</div>
        <p class="small muted" style="margin:0">${t('family_code_help')}</p>
      </div>
    </div>`);
  $$('[data-say]', el).forEach((b) => b.addEventListener('click', () => speak(describe(members.find((m) => m._id === b.dataset.say)))));
}
