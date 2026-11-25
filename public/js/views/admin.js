// Admin: RBAC role management + compressed log archive (fs/zlib on the server).
import { html, mount, $, $$, toast } from '../lib.js';
import { api } from '../api.js';
import { pager } from './patient.js';

export async function panel(el, [page]) {
  const [users, logs] = await Promise.all([api(`/admin/users?page=${Number(page) || 1}&limit=20`), api('/admin/logs')]);
  const roles = ['patient', 'caregiver', 'admin'];
  mount(el, html`
    <div class="page">
      <h1>Admin</h1>
      <div class="card table-wrap"><h2>Users (${users.total})</h2>
        <table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Language</th><th>Role</th></tr></thead>
        <tbody>${users.items.map((u) => html`<tr><td>${u.id}</td><td>${u.name}</td><td>${u.email}</td><td>${u.language}</td>
          <td><select data-role="${u.id}" style="min-height:38px">${roles.map((r) => html`<option ${r === u.role ? 'selected' : ''}>${r}</option>`)}</select></td></tr>`)}</tbody></table>
        ${pager(users, (p) => `#/admin/${p}`)}
      </div>
      <div class="card" style="margin-top:16px"><div class="row spread"><h2 style="margin:0">Server logs</h2><button class="btn secondary" id="arch">Compress old logs (gzip)</button></div>
        <ul class="list">${logs.files.map((f) => html`<li><span>${f}</span>${f.endsWith('.gz') ? html`<button class="btn small secondary" data-view="${f}">View (gunzip)</button>` : html`<span class="badge">today</span>`}</li>`)}</ul>
        <pre id="out" style="white-space:pre-wrap;max-height:300px;overflow:auto;font-size:.8rem"></pre>
      </div>
    </div>`);
  $$('[data-role]', el).forEach((s) => s.addEventListener('change', async () => {
    try { await api(`/admin/users/${s.dataset.role}/role`, { method: 'PATCH', body: { role: s.value } }); toast('Role updated', 'ok'); } catch (e) { toast(e.message, 'danger'); }
  }));
  $('#arch', el).addEventListener('click', async () => {
    const r = await api('/admin/logs/archive', { method: 'POST' });
    toast(r.archived.length ? `Compressed: ${r.archived.join(', ')}` : 'Nothing to compress (only today’s log exists)', 'ok');
    panel(el, [page]);
  });
  $$('[data-view]', el).forEach((b) => b.addEventListener('click', async () => {
    const res = await fetch(`/api/v1/admin/logs/${b.dataset.view}`, { credentials: 'same-origin' });
    $('#out', el).textContent = (await res.text()).split('\n').slice(-60).join('\n');
  }));
}
