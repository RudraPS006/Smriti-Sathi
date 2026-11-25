// The raw-http microservice: status codes, headers, ETag/304, 404, 405
const server = require('../../i18n-service/server');
let base;

beforeAll((done) => { server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); }); });
afterAll(() => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));

test('GET /locales lists the 4 languages', async () => {
  const r = await fetch(`${base}/locales`);
  expect(r.status).toBe(200);
  expect((await r.json()).sort()).toEqual(['as', 'bn', 'en', 'hi']);
});

test('GET /locales/as returns Assamese with ETag, then 304', async () => {
  const r = await fetch(`${base}/locales/as`);
  expect(r.status).toBe(200);
  expect(r.headers.get('content-type')).toMatch(/application\/json/);
  expect((await r.json()).play_games).toBe('খেল খেলক');
  const again = await fetch(`${base}/locales/as`, { headers: { 'If-None-Match': r.headers.get('etag') } });
  expect(again.status).toBe(304);
});

test('unknown language -> 404, POST -> 405', async () => {
  expect((await fetch(`${base}/locales/fr`)).status).toBe(404);
  const r = await fetch(`${base}/locales/en`, { method: 'POST' });
  expect(r.status).toBe(405);
  expect(r.headers.get('allow')).toBe('GET, OPTIONS');
});

test('every language file has the keys the patient screens need', () => {
  const en = require('../../i18n-service/locales/en.json');
  const patientKeys = ['play_games', 'help', 'help_confirm', 'yes_help', 'mark_done', 'correct', 'who_is_your', 'what_is_this'];
  for (const lang of ['hi', 'as', 'bn']) {
    const loc = require(`../../i18n-service/locales/${lang}.json`);
    for (const k of patientKeys) { expect(en[k]).toBeTruthy(); expect(loc[k]).toBeTruthy(); }
  }
});
