import { html, mount, $, showFormErrors } from '../lib.js';
import { api } from '../api.js';
import { t } from '../i18n.js';

const NER_STATES = ['Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'];

export function login(el, params, ctx) {
  mount(el, html`
    <div class="page narrow">
      <div class="card stack">
        <h1>${t('sign_in')}</h1>
        <p class="muted">${t('tagline')}</p>
        <form id="f" novalidate>
          <div class="field"><label for="email">${t('email')}</label><input id="email" name="email" type="email" autocomplete="username" required></div>
          <div class="field"><label for="password">${t('password')}</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
          <button class="btn big block" type="submit">${t('sign_in')}</button>
        </form>
        <p class="center">${t('no_account')} <a href="#/signup">${t('create_account')}</a></p>
        <p class="center small muted">${t('demo_accounts')}</p>
      </div>
    </div>`);
  $('#f', el).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      const { user } = await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      await ctx.onLogin(user);
    } catch (err) { showFormErrors(f, err); }
  });
}

export function signup(el, params, ctx) {
  mount(el, html`
    <div class="page narrow">
      <div class="card">
        <h1>${t('create_account')}</h1>
        <form id="f" novalidate>
          <div class="field"><label for="name">${t('name')}</label><input id="name" name="name" required autocomplete="name"></div>
          <div class="field"><label for="email">${t('email')}</label><input id="email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="password">${t('password')}</label><input id="password" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
          <div class="field"><label for="role">${t('role')}</label>
            <select id="role" name="role">
              <option value="patient">${t('role_patient')}</option>
              <option value="caregiver">${t('role_caregiver')}</option>
            </select></div>
          <div id="patient-extra">
            <div class="field"><label for="age">${t('age')}</label><input id="age" name="age" type="number" min="40" max="120"></div>
            <div class="field"><label for="hometown">${t('hometown')}</label><input id="hometown" name="hometown"></div>
            <div class="field"><label for="state">${t('state')}</label>
              <select id="state" name="state"><option value=""></option>${NER_STATES.map((s) => html`<option>${s}</option>`)}</select></div>
          </div>
          <button class="btn big block" type="submit">${t('create_account')}</button>
        </form>
        <p class="center">${t('have_account')} <a href="#/login">${t('sign_in')}</a></p>
      </div>
    </div>`);
  const f = $('#f', el);
  f.role.addEventListener('change', () => { $('#patient-extra', el).hidden = f.role.value !== 'patient'; });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(f));
    body.language = ctx.lang();
    if (body.role !== 'patient') { delete body.age; delete body.hometown; delete body.state; }
    try {
      const { user } = await api('/auth/register', { method: 'POST', body });
      await ctx.onLogin(user);
    } catch (err) { showFormErrors(f, err); }
  });
}
