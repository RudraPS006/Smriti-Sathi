// Caregiver: the patient's family list — add/edit with photo, delete, import a CSV/JSON file.
import { html, mount, $, $$, toast, modal, showFormErrors } from '../lib.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

// a function, so t() runs after the language has loaded
const samples = () => [
  ['/api/v1/family/template.csv', t('download_template')],
  ['/sample-data/fake-family-bina-extra.csv', 'fake-family-bina-extra.csv (6 rows, 1 has an error on purpose)'],
  ['/sample-data/fake-family-lalthansangi.json', 'fake-family-lalthansangi.json (5 people, with photos)'],
];

export const avatarOf = (m, size = 72) => m.photoUrl
  ? html`<img src="${m.photoUrl}" alt="" width="${size}" height="${size}" style="border-radius:50%;object-fit:cover;flex:none;background:#eee">`
  : html`<span aria-hidden="true" style="width:${size}px;height:${size}px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);font-size:${size / 2}px;flex:none">👤</span>`;

export async function familyTab(box, pid, ctx) {
  const { members } = await api(`/family/${pid}`);
  mount(box, html`
    <div class="row spread" style="margin-bottom:14px">
      <p class="muted" style="margin:0">${members.length} people · used in the “Family faces” game, the family quiz and Smriti’s conversations.</p>
      <div class="row">
        <button class="btn" id="add">＋ ${t('add_family')}</button>
        <button class="btn secondary" id="import">⬆ ${t('import_family')}</button>
      </div>
    </div>
    ${members.length ? '' : html`<div class="card center"><p>${t('no_family')}</p></div>`}
    <div class="grid two">
      ${members.map((m) => html`
        <div class="card row" style="align-items:flex-start;flex-wrap:nowrap">
          ${avatarOf(m)}
          <div style="flex:1;min-width:0">
            <div class="row spread"><h3 style="margin:0">${m.name}</h3>${m.isEmergencyContact ? html`<span class="badge high">🚑 ${t('emergency_contact')}</span>` : ''}</div>
            <div class="muted">${[m.relation, m.city, m.birthYear && `${t('born')} ${m.birthYear}`].filter(Boolean).join(' · ')}</div>
            ${m.phone ? html`<div class="small">📞 ${m.phone}</div>` : ''}
            ${m.notes ? html`<p class="small" style="margin:.4em 0">${m.notes}</p>` : ''}
            <div class="row" style="margin-top:6px"><button class="btn small secondary" data-edit="${m._id}">${t('edit')}</button><button class="btn small danger" data-del="${m._id}">${t('delete')}</button></div>
          </div>
        </div>`)}
    </div>`);

  $('#add', box).addEventListener('click', () => memberForm(pid, null, ctx.rerender));
  $('#import', box).addEventListener('click', () => importDialog(pid, ctx.rerender));
  $$('[data-edit]', box).forEach((b) => b.addEventListener('click', () => memberForm(pid, members.find((m) => m._id === b.dataset.edit), ctx.rerender)));
  $$('[data-del]', box).forEach((b) => b.addEventListener('click', async () => {
    const m = members.find((x) => x._id === b.dataset.del);
    if (!confirm(`Remove ${m.name} from the family list?`)) return;
    await api(`/family/${pid}/${m._id}`, { method: 'DELETE' });
    ctx.rerender();
  }));
}

function memberForm(pid, m, done) {
  const dlg = modal(String(html`
    <h2>${m ? `${t('edit')} — ${m.name}` : t('add_family')}</h2>
    <form id="ff" novalidate>
      <div class="row">
        <div class="field" style="flex:2;min-width:180px"><label>${t('name')}</label><input name="name" value="${m?.name || ''}" required maxlength="60"></div>
        <div class="field" style="flex:1;min-width:150px"><label>${t('relation')}</label>
          <input name="relation" value="${m?.relation || ''}" required list="relations" maxlength="40" placeholder="son, daughter, sister…">
          <datalist id="relations">${['son', 'daughter', 'husband', 'wife', 'sister', 'brother', 'grandson', 'granddaughter', 'daughter-in-law', 'son-in-law', 'mother', 'father', 'friend', 'neighbour'].map((r) => html`<option value="${r}">`)}</datalist></div>
      </div>
      <div class="row">
        <div class="field" style="flex:1;min-width:150px"><label>${t('phone')}</label><input name="phone" type="tel" value="${m?.phone || ''}"></div>
        <div class="field" style="flex:1;min-width:130px"><label>${t('city')}</label><input name="city" value="${m?.city || ''}"></div>
        <div class="field" style="flex:1;min-width:110px"><label>${t('birth_year')}</label><input name="birthYear" type="number" min="1900" value="${m?.birthYear || ''}"></div>
      </div>
      <div class="field"><label>${t('notes')}</label><textarea name="notes" maxlength="500" style="min-height:70px" placeholder="Calls every Sunday; lives next door…">${m?.notes || ''}</textarea></div>
      <div class="field"><label>${t('photo')}</label><input name="photo" type="file" accept="image/jpeg,image/png,image/webp"></div>
      <label class="row" style="font-weight:600"><input type="checkbox" name="isEmergencyContact" ${m?.isEmergencyContact ? 'checked' : ''} style="width:auto;min-height:auto"> 🚑 ${t('emergency_contact')}</label>
      <div class="row" style="margin-top:14px"><button class="btn">${t('save')}</button><button type="button" class="btn secondary" id="cx">${t('cancel')}</button></div>
    </form>`));
  dlg.el.querySelector('#cx').addEventListener('click', dlg.close);
  const f = dlg.el.querySelector('#ff');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    fd.set('isEmergencyContact', f.isEmergencyContact.checked ? 'true' : 'false');
    if (!fd.get('photo')?.size) fd.delete('photo');
    for (const k of ['birthYear', 'phone']) if (!fd.get(k)) fd.delete(k);
    try {
      await api(m ? `/family/${pid}/${m._id}` : `/family/${pid}`, { method: m ? 'PUT' : 'POST', form: fd });
      dlg.close();
      toast(t('saved'), 'ok');
      done();
    } catch (err) { showFormErrors(f, err); }
  });
}

function importDialog(pid, done) {
  const dlg = modal(String(html`
    <h2>⬆ ${t('import_family')}</h2>
    <p class="muted">${t('import_help')}</p>
    <p class="small">Columns: <code>name, relation, phone, city, birthYear, isEmergencyContact, notes, photoUrl</code></p>
    <form id="imp" class="stack">
      <input name="file" type="file" accept=".csv,.json,text/csv,application/json" required>
      <div class="row"><button class="btn">⬆ ${t('import_family')}</button><button type="button" class="btn secondary" id="cx">${t('cancel')}</button></div>
    </form>
    <div id="result" aria-live="polite"></div>
    <h3 style="margin-top:18px">${t('sample_files')}</h3>
    <ul>${samples().map(([href, label]) => html`<li><a href="${href}" download>${label}</a></li>`)}</ul>`));
  dlg.el.querySelector('#cx').addEventListener('click', dlg.close);
  const f = dlg.el.querySelector('#imp');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.file.files.length) return;
    const fd = new FormData();
    fd.append('file', f.file.files[0]);
    try {
      const r = await api(`/family/${pid}/import`, { method: 'POST', form: fd });
      mount(dlg.el.querySelector('#result'), html`
        <div class="card" style="margin-top:12px">
          <strong>✔ ${r.created} added · ${r.updated} updated · ${r.skipped.length} skipped</strong>
          ${r.skipped.length ? html`<ul class="small">${r.skipped.map((s) => html`<li>Row ${s.row}${s.name ? ` (${s.name})` : ''}: ${s.reason}</li>`)}</ul>` : ''}
          <button class="btn small" id="ok">${t('done')}</button>
        </div>`);
      dlg.el.querySelector('#ok').addEventListener('click', () => { dlg.close(); done(); });
    } catch (err) { showFormErrors(f, err); }
  });
}
