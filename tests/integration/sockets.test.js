// Unit III — Socket.IO + raw WebSocket, tested over a real port.
require('../setupEnv');
const { describe, test, before, after } = require('node:test');
const { expect } = require('expect');
const http = require('http');
const request = require('supertest');
const { io: connect } = require('socket.io-client');
const WebSocket = require('ws');
const { app } = require('../../src/app');
const { prisma, connectDatabases, disconnectDatabases } = require('../../src/config/db');
const { initSockets } = require('../../src/sockets');
const ChatMessage = require('../../src/models/ChatMessage');

const PASSWORD = 'test-password-123';
let server, io, url, patient, carer, outsider;
const clients = [];

async function account(role, email) {
  const r = await request(app).post('/api/v1/auth/register').send({ name: `Sock ${role}`, email, password: PASSWORD, role });
  return { user: r.body.user, token: r.body.token };
}
function socketFor(token) {
  const s = connect(url, { auth: { token }, transports: ['websocket'], forceNew: true });
  clients.push(s);
  return new Promise((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); });
}
const once = (s, evt) => new Promise((resolve) => s.once(evt, resolve));
const emitAck = (s, evt, data) => new Promise((resolve) => s.emit(evt, data, resolve));

before(async () => {
  await connectDatabases();
  await prisma.user.deleteMany({ where: { email: { endsWith: '@sock.test' } } });
  patient = await account('patient', 'p@sock.test');
  carer = await account('caregiver', 'c@sock.test');
  outsider = await account('caregiver', 'o@sock.test');
  await prisma.careLink.create({ data: { patientId: patient.user.id, carerId: carer.user.id, relation: 'son' } });
  server = http.createServer(app);
  ({ io } = initSockets(server));
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  clients.forEach((c) => c.disconnect());
  io.close();
  await new Promise((r) => server.close(r));
  await ChatMessage.deleteMany({ patientId: patient.user.id });
  await require('../../src/models/ActivityLog').deleteMany({ patientId: patient.user.id });
  await require('../../src/models/JournalEntry').deleteMany({ patientId: patient.user.id });
  await prisma.user.deleteMany({ where: { email: { endsWith: '@sock.test' } } });
  await disconnectDatabases();
});

describe('Socket.IO', () => {
  test('connection without a valid JWT is refused', async () => {
    await expect(socketFor('not-a-token')).rejects.toThrow('unauthorised');
  });

  test('patient SOS reaches the linked caregiver live, not an outsider', async () => {
    const carerSock = await socketFor(carer.token);
    const outsiderSock = await socketFor(outsider.token);
    const patientSock = await socketFor(patient.token);
    let outsiderGotIt = false;
    outsiderSock.on('alert:new', () => { outsiderGotIt = true; });

    const received = once(carerSock, 'alert:new');
    const confirmed = once(patientSock, 'sos:received');
    await request(app).post('/api/v1/alerts/sos').set('Authorization', `Bearer ${patient.token}`).send({ note: 'help' });

    const alert = await received;
    expect(alert.type).toBe('sos');
    expect(alert.patient.id).toBe(patient.user.id);
    await confirmed;
    await new Promise((r) => setTimeout(r, 200));
    expect(outsiderGotIt).toBe(false);
  });

  test('patient activity (e.g. writing in the diary) is pushed live to the caregiver', async () => {
    const carerSock = await socketFor(carer.token);
    const got = once(carerSock, 'activity:new');
    await request(app).post('/api/v1/journal').set('Authorization', `Bearer ${patient.token}`).send({ text: 'Had tea with Rupam', mood: 'happy' });
    const a = await got;
    expect(a.type).toBe('journal');
    expect(a.patientId).toBe(patient.user.id);
    expect(a.summary).toMatch(/happy/);
  });

  test('chat: join, send with acknowledgement, broadcast, saved in MongoDB', async () => {
    const a = await socketFor(carer.token);
    const b = await socketFor(patient.token);
    expect(await emitAck(a, 'chat:join', { patientId: patient.user.id })).toEqual({ ok: true });
    await emitAck(b, 'chat:join', { patientId: patient.user.id });
    const incoming = once(b, 'chat:message');
    const ack = await emitAck(a, 'chat:send', { patientId: patient.user.id, text: 'Lunch is ready, Ma' });
    expect(ack.ok).toBe(true);
    expect((await incoming).text).toBe('Lunch is ready, Ma');
    expect(await ChatMessage.countDocuments({ patientId: patient.user.id })).toBe(1);
  });

  test('outsider cannot join the patient chat room', async () => {
    const s = await socketFor(outsider.token);
    expect(await emitAck(s, 'chat:join', { patientId: patient.user.id })).toEqual({ ok: false, error: 'not allowed' });
  });
});

describe('raw WebSocket /ws', () => {
  test('hello + ping/pong', async () => {
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    const msgs = [];
    await new Promise((resolve) => {
      ws.on('message', (d) => {
        msgs.push(JSON.parse(d));
        if (msgs.length === 1) ws.send('ping');
        if (msgs.length === 2) resolve();
      });
    });
    ws.close();
    expect(msgs.map((m) => m.type)).toEqual(['hello', 'pong']);
  });
});
