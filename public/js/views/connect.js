// Caregiver: connect to a patient — with their care code, or by creating their account.
import { html, mount, $, toast, modal, showFormErrors } from '../lib.js';
import { api } from '../api.js';
import { t, LANGS } from '../i18n.js';

const NER_STATES = ['Assam', 'Arunachal Pradesh', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Sikkim', 'Tripura'];

export function connect(el, params, ctx) {
  mount(el, html`
    <div class="page">
      <a href="#/dashboard">← ${t('my_patients')}</a>
      <h1 style="margin-top:.3em">🔗 ${t('connect_patient')}</h1>
      <div class="grid two" style="align-items:start">
        <form class="card stack" id="code" novalidate>
          <h2>${t('connect_with_code')}</h2>
          <p class="muted">${t('connect_with_code_help')}</p>
          <div class="field"><label for="careCode">${t('care_code')}</label>
            <input id="careCode" name="careCode" required maxlength="8" autocomplete="off" placeholder="e.g. BINA26"
              style="font-size:1.6rem;letter-spacing:.3em;text-transform:uppercase;font-weight:700"></div>
          <div class="field"><label for="relation1">${t('your_relation')}</label><input id="relation1" name="relation" placeholder="son, daughter, granddaughter, nurse…"></div>
          <button class="btn big block">${t('connect')}</button>
        </form>

        <form class="card" id="create" novalidate>
          <h2>${t('create_patient_account')}</h2>
          <p class="muted">${t('create_patient_help')}</p>
          <div class="field"><label for="name">${t('name')}</label><input id="name" name="name" required></div>
          <div class="row">
            <div class="field" style="flex:2;min-width:200px"><label for="email">${t('email')}</label><input id="email" name="email" type="email" required autocomplete="off"></div>
            <div class="field" style="flex:1;min-width:150px"><label for="pw">${t('password')}</label><input id="pw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
          </div>
          <div class="row">
            <div class="field" style="flex:1;min-width:110px"><label for="age">${t('age')}</label><input id="age" name="age" type="number" min="40" max="120"></div>
            <div class="field" style="flex:1;min-width:150px"><label for="language">${t('language')}</label>
              <select id="language" name="language">${Object.entries(LANGS).map(([k, v]) => html`<option value="${k}">${v}</option>`)}</select></div>
            <div class="field" style="flex:1;min-width:150px"><label for="stage">${t('dementia_stage')}</label>
              <select id="stage" name="dementiaStage"><option>mild</option><option>moderate</option><option>severe</option></select></div>
          </div>
          <div class="row">
            <div class="field" style="flex:1;min-width:150px"><label for="hometown">${t('hometown')}</label><input id="hometown" name="hometown"></div>
            <div class="field" style="flex:1;min-width:150px"><label for="state">${t('state')}</label>
              <select id="state" name="state"><option value=""></option>${NER_STATES.map((s) => html`<option>${s}</option>`)}</select></div>
          </div>
          <div class="field"><label for="relation2">${t('your_relation')}</label><input id="relation2" name="relation" placeholder="son, daughter…"></div>
          <button class="btn big block">${t('create_patient_account')}</button>
        </form>
      </div>
    </div>`);

  const codeForm = $('#code', el);
  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { patient } = await api('/patients/connect', { method: 'POST', body: Object.fromEntries(new FormData(codeForm)) });
      toast(`Connected to ${patient.name}`, 'ok');
      ctx.go(`patient/${patient.id}/report`);
    } catch (err) { showFormErrors(codeForm, err); }
  });

  const createForm = $('#create', el);
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(createForm));
    if (!body.age) delete body.age;
    if (!body.state) delete body.state;
    try {
      const { patient, careCode } = await api('/patients', { method: 'POST', body });
      const m = modal(String(html`
        <div class="stack center">
          <h2>✔ ${patient.name}</h2>
          <p>Account created and connected. Next, add their family on the <strong>${t('family')}</strong> tab.</p>
          <p class="muted">${t('care_code')} (share with other family members):</p>
          <p style="font-size:2rem;font-weight:700;letter-spacing:.3em">${careCode}</p>
          <button class="btn big block" id="go">${t('add_family')}</button>
        </div>`));
      m.el.querySelector('#go').addEventListener('click', () => { m.close(); ctx.go(`patient/${patient.id}/family`); });
    } catch (err) { showFormErrors(createForm, err); }
  });
}
