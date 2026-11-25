// Unit VI — Testing the REST API end-to-end with Supertest.
// Uses real (test) MongoDB and PostgreSQL databases: smriti_test.
//
// Runs on Node's built-in test runner (node --test) with Jest's `expect` library.
// Why not Jest itself? Jest runs each file inside a VM sandbox, and the MongoDB
// driver's handshake breaks inside that sandbox with MongoDB 9.
require('../setupEnv'); // must run first: points config at the test databases
const { describe, test, before, after } = require('node:test');
const { expect } = require('expect');
const request = require('supertest');
const zlib = require('zlib');
const { app } = require('../../src/app');
const { prisma, connectDatabases, disconnectDatabases } = require('../../src/config/db');
const { registerEventHandlers } = require('../../src/events/handlers');
const GameSession = require('../../src/models/GameSession');
const Memory = require('../../src/models/Memory');
const ChatMessage = require('../../src/models/ChatMessage');
const JournalEntry = require('../../src/models/JournalEntry');
const FamilyMember = require('../../src/models/FamilyMember');
const ActivityLog = require('../../src/models/ActivityLog');
const Photo = require('../../src/models/Photo');
const fs = require('fs');
const path = require('path');

const PASSWORD = 'test-password-123';

async function wipe() {
  await Promise.all([GameSession.deleteMany({}), Memory.deleteMany({}), ChatMessage.deleteMany({}), JournalEntry.deleteMany({}), FamilyMember.deleteMany({}), ActivityLog.deleteMany({}), Photo.deleteMany({})]);
  await prisma.alert.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.careLink.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.user.deleteMany();
}

// request.agent keeps cookies (JWT + session) between calls, like a browser
async function signUp(role, email, extra = {}) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/register').send({ name: `Test ${role}`, email, password: PASSWORD, role, ...extra });
  expect(res.status).toBe(201);
  return { agent, user: res.body.user, token: res.body.token };
}

let patient, carer, sibling, stranger;

before(async () => {
  await connectDatabases();
  registerEventHandlers();
  await wipe();
  patient = await signUp('patient', 'p@test.in', { age: 75, hometown: 'Shillong', state: 'Meghalaya', language: 'en' });
  carer = await signUp('caregiver', 'c@test.in');
  sibling = await signUp('caregiver', 'sib@test.in');
  stranger = await signUp('caregiver', 's@test.in');
});

after(async () => {
  await wipe();
  await disconnectDatabases();
});

describe('basics', () => {
  test('health checks for v1 and v2', async () => {
    expect((await request(app).get('/api/v1/health')).body.version).toBe('v1');
    expect((await request(app).get('/api/v2/health')).body.version).toBe('v2');
  });

  test('security headers are set (helmet)', async () => {
    const r = await request(app).get('/api/v1/health');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  test('app.all catches unknown API routes for any method', async () => {
    for (const method of ['get', 'post', 'delete']) {
      const r = await request(app)[method]('/api/v1/does-not-exist');
      expect(r.status).toBe(404);
      expect(r.body.error.message).toMatch(/No API route/);
    }
  });

  test('i18n falls back to local file when the microservice is down', async () => {
    const r = await request(app).get('/api/v1/i18n/hi');
    expect(r.status).toBe(200);
    expect(r.headers['x-served-by']).toBe('monolith-fallback');
    expect(r.body.help).toBe('मदद');
  });
});

describe('auth + validation', () => {
  test('express-validator rejects bad sign-up data with field details', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ name: 'A', email: 'nope', password: '123' });
    expect(r.status).toBe(422);
    const fields = r.body.error.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  test('cannot self-register as admin', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ name: 'Evil', email: 'evil@test.in', password: PASSWORD, role: 'admin' });
    expect(r.status).toBe(422);
  });

  test('duplicate email -> 409', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ name: 'Again', email: 'p@test.in', password: PASSWORD });
    expect(r.status).toBe(409);
  });

  test('login sets an httpOnly cookie; wrong password -> 401', async () => {
    const ok = await request(app).post('/api/v1/auth/login').send({ email: 'p@test.in', password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'].join(';')).toMatch(/token=.*HttpOnly/i);
    const bad = await request(app).post('/api/v1/auth/login').send({ email: 'p@test.in', password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  test('Bearer token works too (for Postman)', async () => {
    const r = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${patient.token}`);
    expect(r.body.user.email).toBe('p@test.in');
    expect(r.body.user.profile.hometown).toBe('Shillong');
  });

  test('no token -> 401', async () => {
    expect((await request(app).get('/api/v1/patients')).status).toBe(401);
  });
});

describe('RBAC and care team', () => {
  test('caregiver cannot see an unlinked patient', async () => {
    expect((await carer.agent.get(`/api/v1/patients/${patient.user.id}`)).status).toBe(403);
  });

  test('the doctor role no longer exists', async () => {
    const r = await request(app).post('/api/v1/auth/register').send({ name: 'Dr X', email: 'dr@test.in', password: PASSWORD, role: 'doctor' });
    expect(r.status).toBe(422);
  });

  test('patient gets a care code; caregiver connects with it', async () => {
    const { body } = await patient.agent.get('/api/v1/patients/me/care-code');
    expect(body.careCode).toMatch(/^[A-Z0-9]{6}$/);
    expect((await carer.agent.post('/api/v1/patients/connect').send({ careCode: 'ZZZZZZ' })).status).toBe(404);
    expect((await carer.agent.post('/api/v1/patients/connect').send({ careCode: '12' })).status).toBe(422);
    expect((await patient.agent.post('/api/v1/patients/connect').send({ careCode: body.careCode })).status).toBe(403);
    // lower case and spaces are fine: "ab c12d" -> "ABC12D"
    const messy = body.careCode.toLowerCase().replace(/(..)/, '$1 ');
    const r = await carer.agent.post('/api/v1/patients/connect').send({ careCode: messy, relation: 'son' });
    expect(r.status).toBe(201);
    expect(r.body.patient.id).toBe(patient.user.id);
    expect((await carer.agent.post('/api/v1/patients/connect').send({ careCode: body.careCode })).status).toBe(409);
    const list = await carer.agent.get('/api/v1/patients');
    expect(list.body.patients.map((p) => p.id)).toContain(patient.user.id);
  });

  test('caregiver invites a sibling by email; carers can only remove themselves', async () => {
    const r = await carer.agent.post(`/api/v1/patients/${patient.user.id}/care-team`).send({ email: 'sib@test.in', relation: 'daughter' });
    expect(r.status).toBe(201);
    const team = await carer.agent.get(`/api/v1/patients/${patient.user.id}`);
    expect(team.body.careTeam).toHaveLength(2);
    expect(team.body.patient.profile.careCode).toMatch(/^[A-Z0-9]{6}$/);
    expect((await carer.agent.delete(`/api/v1/patients/${patient.user.id}/care-team/${sibling.user.id}`)).status).toBe(403);
    expect((await sibling.agent.delete(`/api/v1/patients/${patient.user.id}/care-team/${sibling.user.id}`)).status).toBe(204);
    expect((await sibling.agent.get(`/api/v1/patients/${patient.user.id}`)).status).toBe(403);
  });

  test('caregiver creates an account for a patient and is connected to it', async () => {
    const r = await carer.agent.post('/api/v1/patients').send({ name: 'New Elder', email: 'elder@test.in', password: PASSWORD, language: 'as', age: 81, dementiaStage: 'moderate', relation: 'father' });
    expect(r.status).toBe(201);
    expect(r.body.careCode).toMatch(/^[A-Z0-9]{6}$/);
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'elder@test.in', password: PASSWORD });
    expect(login.body.user.role).toBe('patient');
    expect((await carer.agent.get(`/api/v1/patients/${r.body.patient.id}`)).status).toBe(200);
    expect((await carer.agent.post('/api/v1/patients').send({ name: 'Bad', email: 'x', password: '1' })).status).toBe(422);
  });

  test('stranger still blocked; non-admin blocked from admin API', async () => {
    expect((await stranger.agent.get(`/api/v1/games/history/${patient.user.id}`)).status).toBe(403);
    expect((await carer.agent.get('/api/v1/admin/users')).status).toBe(403);
  });

  test('only patients may play games', async () => {
    expect((await carer.agent.get('/api/v1/games/sequence/start')).status).toBe(403);
  });
});

describe('adaptive games (express-session + MongoDB)', () => {
  test('result without starting a game -> 409', async () => {
    const r = await patient.agent.post('/api/v1/games/sequence/result').send({ score: 3, maxScore: 3 });
    expect(r.status).toBe(409);
  });

  test('unknown game -> 422; score > max -> 422', async () => {
    expect((await patient.agent.get('/api/v1/games/chess/start')).status).toBe(422);
    await patient.agent.get('/api/v1/games/sequence/start');
    expect((await patient.agent.post('/api/v1/games/sequence/result').send({ score: 9, maxScore: 3 })).status).toBe(422);
  });

  test('three perfect games raise the level', async () => {
    let level;
    for (let i = 0; i < 3; i++) {
      const s = await patient.agent.get('/api/v1/games/word-picture/start');
      expect(s.status).toBe(200);
      level = level ?? s.body.difficulty;
      expect(s.body.config.rounds).toBeGreaterThan(0);
      const r = await patient.agent.post('/api/v1/games/word-picture/result').send({ score: s.body.config.rounds, maxScore: s.body.config.rounds });
      expect(r.status).toBe(201);
    }
    const next = await patient.agent.get('/api/v1/games/word-picture/start');
    expect(next.body.difficulty).toBe(level + 1);
    await patient.agent.post('/api/v1/games/word-picture/result').send({ score: 1, maxScore: 5 });
  });

  test('history is paginated; stats aggregate', async () => {
    const page1 = await carer.agent.get(`/api/v1/games/history/${patient.user.id}?page=1&limit=2`);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body.total).toBe(4);
    expect(page1.body.totalPages).toBe(2);
    const stats = await carer.agent.get(`/api/v1/games/stats/${patient.user.id}`);
    expect(stats.body.totals.sessions).toBe(4);
    const v2 = await carer.agent.get(`/api/v2/games/stats/${patient.user.id}`);
    expect(v2.body.overall.accuracyPercent).toBeGreaterThan(0);
    expect(['improving', 'stable', 'declining']).toContain(v2.body.trend);
  });

  test('a sharp drop creates a cognitive_decline alert (EventEmitter)', async () => {
    const pid = patient.user.id;
    const good = Array.from({ length: 10 }, (_, i) => ({ patientId: pid, gameType: 'sequence', difficulty: 2, score: 3, maxScore: 3, completedAt: new Date(Date.now() - (20 - i) * 3600e3) }));
    // dated a few seconds ahead so they are the newest sessions, together with the one we play below
    const bad = Array.from({ length: 4 }, (_, i) => ({ patientId: pid, gameType: 'sequence', difficulty: 2, score: 0, maxScore: 3, completedAt: new Date(Date.now() + (i + 1) * 1000) }));
    await GameSession.insertMany([...good, ...bad]);
    await patient.agent.get('/api/v1/games/sequence/start');
    await patient.agent.post('/api/v1/games/sequence/result').send({ score: 0, maxScore: 3 });
    await new Promise((r) => setTimeout(r, 300)); // the listener runs asynchronously
    const alerts = await carer.agent.get('/api/v1/alerts');
    expect(alerts.body.items.some((a) => a.type === 'cognitive_decline')).toBe(true);
  });
});

describe('memories (Mongoose CRUD + search)', () => {
  let memoryId;
  test('caregiver creates memories; unlinked caregiver cannot', async () => {
    const r = await carer.agent.post(`/api/v1/memories/${patient.user.id}`).send({
      title: 'Picnic at Umiam Lake', place: 'Umiam', year: 1995, description: 'Boating on the lake with the family', people: [{ name: 'Daniel', relation: 'son' }],
    });
    expect(r.status).toBe(201);
    memoryId = r.body.memory._id;
    await carer.agent.post(`/api/v1/memories/${patient.user.id}`).send({ title: 'Christmas in Shillong', place: 'Shillong', description: 'Carols and cake', people: [{ name: 'Grace', relation: 'daughter' }] });
    expect((await stranger.agent.post(`/api/v1/memories/${patient.user.id}`).send({ title: 'x y' })).status).toBe(403);
  });

  test('list, update, semantic search, delete', async () => {
    const list = await patient.agent.get(`/api/v1/memories/${patient.user.id}?limit=1`);
    expect(list.body.total).toBe(2);
    expect(list.body.items[0].embedding).toBeUndefined();

    const up = await carer.agent.put(`/api/v1/memories/${patient.user.id}/${memoryId}`).send({ title: 'Picnic at Umiam Lake', year: 1996 });
    expect(up.body.memory.year).toBe(1996);

    const s = await carer.agent.get(`/api/v1/memories/${patient.user.id}/search?q=boat on the lake`);
    expect(s.body.results[0].title).toBe('Picnic at Umiam Lake');

    expect((await carer.agent.delete(`/api/v1/memories/${patient.user.id}/${memoryId}`)).status).toBe(204);
    expect((await carer.agent.delete(`/api/v1/memories/${patient.user.id}/not-an-id`)).status).toBe(422);
  });
});

describe('reminders (Prisma CRUD)', () => {
  test('create, mark done, update, delete', async () => {
    const bad = await carer.agent.post(`/api/v1/reminders/${patient.user.id}`).send({ title: 'Tablet', time: '25:99' });
    expect(bad.status).toBe(422);
    const r = await carer.agent.post(`/api/v1/reminders/${patient.user.id}`).send({ title: 'BP tablet', time: '08:00', kind: 'medicine' });
    expect(r.status).toBe(201);
    const id = r.body.reminder.id;
    await patient.agent.post(`/api/v1/reminders/item/${id}/done`);
    const list = await patient.agent.get(`/api/v1/reminders/${patient.user.id}`);
    expect(list.body.reminders[0].doneToday).toBe(true);
    expect((await carer.agent.patch(`/api/v1/reminders/item/${id}`).send({ active: false })).body.reminder.active).toBe(false);
    expect((await stranger.agent.delete(`/api/v1/reminders/item/${id}`)).status).toBe(404);
    expect((await carer.agent.delete(`/api/v1/reminders/item/${id}`)).status).toBe(204);
  });
});

describe('alerts, reports, AI', () => {
  test('SOS creates a high alert the caregiver can acknowledge', async () => {
    const sos = await patient.agent.post('/api/v1/alerts/sos').send({ note: 'I feel dizzy' });
    expect(sos.status).toBe(201);
    expect(sos.body.alert.severity).toBe('high');
    const ack = await carer.agent.patch(`/api/v1/alerts/${sos.body.alert.id}/ack`);
    expect(ack.body.alert.acknowledged).toBe(true);
    expect((await carer.agent.post('/api/v1/alerts/sos')).status).toBe(403);
  });

  test('report downloads as a gzip-compressed CSV stream', async () => {
    const r = await carer.agent
      .get(`/api/v1/reports/${patient.user.id}/games.csv`)
      .buffer(true)
      .parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('gzip');
    // supertest may or may not auto-decompress; handle both
    let text;
    try { text = zlib.gunzipSync(r.body).toString(); } catch { text = r.body.toString(); }
    expect(text.split('\n')[0]).toMatch(/^date,game,difficulty/);
    expect((await patient.agent.get(`/api/v1/reports/${patient.user.id}/games.csv`)).status).toBe(403);
  });

  test('AI companion (mock mode) replies and raises an alert on distress words', async () => {
    const calm = await patient.agent.post('/api/v1/ai/companion').send({ message: 'Tell me about Christmas in Shillong' });
    expect(calm.body.mock).toBe(true);
    expect(calm.body.memoriesUsed).toContain('Christmas in Shillong');
    const before = await prisma.alert.count({ where: { patientId: patient.user.id, type: 'sos', acknowledged: false } });
    const sad = await patient.agent.post('/api/v1/ai/companion').send({ message: 'I fell down and I have pain' });
    expect(sad.body.distress).toBe(true);
    const after = await prisma.alert.count({ where: { patientId: patient.user.id, type: 'sos', acknowledged: false } });
    expect(after).toBe(before + 1);
  });

  test('AI quiz is built from family memories', async () => {
    const r = await patient.agent.get('/api/v1/ai/quiz');
    expect(r.status).toBe(200);
    for (const q of r.body.questions) {
      expect(q.options[q.answerIndex]).toBeDefined();
    }
  });

  test('journal: patient writes, caregiver reads', async () => {
    expect((await patient.agent.post('/api/v1/journal').send({ text: 'Lovely day', mood: 'happy' })).status).toBe(201);
    expect((await carer.agent.get(`/api/v1/journal/${patient.user.id}`)).body.total).toBe(1);
  });
});

const SAMPLES = path.join(__dirname, '..', '..', 'public', 'sample-data');

describe('family members (Mongoose CRUD + file import)', () => {
  let memberId;
  test('caregiver adds family; validation; duplicates; patient cannot add', async () => {
    const pid = patient.user.id;
    const r = await carer.agent.post(`/api/v1/family/${pid}`).send({ name: 'Daniel Lyngdoh', relation: 'son', phone: '+91 00000 11111', city: 'Shillong', birthYear: 1972, isEmergencyContact: true });
    expect(r.status).toBe(201);
    memberId = r.body.member._id;
    expect((await carer.agent.post(`/api/v1/family/${pid}`).send({ name: 'Daniel Lyngdoh', relation: 'son' })).status).toBe(409);
    const bad = await carer.agent.post(`/api/v1/family/${pid}`).send({ name: '', relation: '', phone: 'call me' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['name', 'relation', 'phone']));
    expect((await patient.agent.post(`/api/v1/family/${pid}`).send({ name: 'X', relation: 'y' })).status).toBe(403);
    expect((await stranger.agent.get(`/api/v1/family/${pid}`)).status).toBe(403);
  });

  test('update and delete', async () => {
    const pid = patient.user.id;
    const up = await carer.agent.put(`/api/v1/family/${pid}/${memberId}`).send({ name: 'Daniel Lyngdoh', relation: 'son', city: 'Tura' });
    expect(up.body.member.city).toBe('Tura');
    const extra = await carer.agent.post(`/api/v1/family/${pid}`).send({ name: 'Temp Person', relation: 'friend' });
    expect((await carer.agent.delete(`/api/v1/family/${pid}/${extra.body.member._id}`)).status).toBe(204);
  });

  test('import the fake CSV: rows added, duplicate updated, broken row skipped', async () => {
    const pid = patient.user.id;
    const r = await carer.agent.post(`/api/v1/family/${pid}/import`).attach('file', path.join(SAMPLES, 'fake-family-bina-extra.csv'));
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ created: 5, updated: 0, total: 6 });
    expect(r.body.skipped).toEqual([{ row: 6, name: '', reason: 'name is missing or too long' }]);
    // importing again updates everyone instead of duplicating
    const again = await carer.agent.post(`/api/v1/family/${pid}/import`).attach('file', path.join(SAMPLES, 'fake-family-bina-extra.csv'));
    expect(again.body).toMatchObject({ created: 0, updated: 5 });
    const quoted = (await carer.agent.get(`/api/v1/family/${pid}`)).body.members.find((m) => m.name === 'Bikash Saikia');
    expect(quoted.notes).toBe("Dipali's husband, tells funny stories"); // comma inside quotes kept
  });

  test('import the fake JSON (with avatar photos); bad files rejected', async () => {
    const pid = patient.user.id;
    const r = await carer.agent.post(`/api/v1/family/${pid}/import`).attach('file', path.join(SAMPLES, 'fake-family-lalthansangi.json'));
    expect(r.body).toMatchObject({ created: 5, updated: 0, skipped: [] });
    const { members } = (await patient.agent.get(`/api/v1/family/${pid}?viewed=true`)).body;
    expect(members.find((m) => m.name === 'Mary Lalremruati').photoUrl).toBe('/seed-avatars/mary-lalremruati.svg');
    expect(members[0].isEmergencyContact).toBe(true); // emergency contacts listed first

    const broken = await carer.agent.post(`/api/v1/family/${pid}/import`).attach('file', Buffer.from('{not json'), 'family.json');
    expect(broken.status).toBe(422);
    const evil = await carer.agent.post(`/api/v1/family/${pid}/import`).attach('file', Buffer.from('name,relation,photoUrl\nEve,friend,https://evil.example/x.png\n'), 'f.csv');
    expect(evil.status).toBe(201);
    const eve = (await carer.agent.get(`/api/v1/family/${pid}`)).body.members.find((m) => m.name === 'Eve');
    expect(eve.photoUrl).toBe(''); // outside image URLs are dropped
    expect((await carer.agent.post(`/api/v1/family/${pid}/import`)).status).toBe(400);
  });

  test('photos are stored in MongoDB and only the care team can view them', async () => {
    const pid = patient.user.id;
    // 1×1 transparent PNG
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    const r = await carer.agent.post(`/api/v1/family/${pid}`).field('name', 'Photo Person').field('relation', 'cousin').attach('photo', png, { filename: 'p.png', contentType: 'image/png' });
    expect(r.status).toBe(201);
    const url = r.body.member.photoUrl;
    expect(url).toMatch(/^\/api\/v1\/photos\/[0-9a-f]{24}$/);
    const img = await carer.agent.get(url);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((await patient.agent.get(url)).status).toBe(200);
    expect((await stranger.agent.get(url)).status).toBe(404);
    expect((await carer.agent.post(`/api/v1/family/${pid}`).field('name', 'Bad File').field('relation', 'x').attach('photo', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })).status).toBe(415);
    await carer.agent.delete(`/api/v1/family/${pid}/${r.body.member._id}`);
    expect((await carer.agent.get(url)).status).toBe(404); // deleted with its family member
  });

  test('template download; family feeds the Family faces game', async () => {
    const tpl = await carer.agent.get('/api/v1/family/template.csv');
    expect(tpl.status).toBe(200);
    expect(tpl.text.split('\n')[0]).toMatch(/^name,relation,phone/);
    const g = await patient.agent.get('/api/v1/games/face-recall/start');
    expect(g.body.people.map((p) => p.name)).toEqual(expect.arrayContaining(['Daniel Lyngdoh', 'Mary Lalremruati']));
  });
});

describe('activity report for caregivers', () => {
  test('quiz result is validated and recorded', async () => {
    expect((await patient.agent.post('/api/v1/ai/quiz/result').send({ score: 6, total: 5 })).status).toBe(422);
    expect((await patient.agent.post('/api/v1/ai/quiz/result').send({ score: 4, total: 5 })).status).toBe(201);
  });

  test('every patient action shows up in the report', async () => {
    await new Promise((r) => setTimeout(r, 200)); // activity is recorded asynchronously
    const { body } = await carer.agent.get(`/api/v1/reports/${patient.user.id}/activity?days=7&limit=100`);
    const t = body.report.byType;
    expect(t.login).toBeGreaterThanOrEqual(1);
    expect(t.game).toBeGreaterThanOrEqual(5);
    for (const type of ['reminder_done', 'sos', 'companion_chat', 'journal', 'quiz', 'family_viewed']) expect(t[type]).toBeGreaterThanOrEqual(1);
    expect(body.report.totals.activities).toBe(body.timeline.total);
    expect(body.report.today.quiz).toBe(1);
    expect(body.report.lastActive).toBeTruthy();
    expect(body.timeline.items[0].createdAt >= body.timeline.items[1].createdAt).toBe(true); // newest first
  });

  test('filter by type, paginate, CSV download, access control', async () => {
    const pid = patient.user.id;
    const games = await carer.agent.get(`/api/v1/reports/${pid}/activity?type=game&limit=2&page=1`);
    expect(games.body.timeline.items.every((a) => a.type === 'game')).toBe(true);
    expect(games.body.timeline.items).toHaveLength(2);
    const csv = await carer.agent.get(`/api/v1/reports/${pid}/activity.csv?days=7`).buffer(true)
      .parse((res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    let text;
    try { text = require('zlib').gunzipSync(csv.body).toString(); } catch { text = csv.body.toString(); }
    expect(text.replace(/^\uFEFF/, '').split('\n')[0]).toBe('date_time_ist,activity,summary');
    expect(text).toMatch(/Pressed the Help button/);
    expect((await patient.agent.get(`/api/v1/reports/${pid}/activity`)).status).toBe(403);
    expect((await stranger.agent.get(`/api/v1/reports/${pid}/activity`)).status).toBe(403);
  });
});
