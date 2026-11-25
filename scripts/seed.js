// Fills BOTH databases with demo data:  npm run seed
// Wipes existing data first — never run against production.
require('../src/config');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { prisma, connectDatabases, disconnectDatabases } = require('../src/config/db');
const GameSession = require('../src/models/GameSession');
const Memory = require('../src/models/Memory');
const ChatMessage = require('../src/models/ChatMessage');
const JournalEntry = require('../src/models/JournalEntry');
const FamilyMember = require('../src/models/FamilyMember');
const ActivityLog = require('../src/models/ActivityLog');
const { embed } = require('../src/services/aiService');

// Demo password for every seeded account (test data only)
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'Smriti@2026';

const DEMO_USERS = {
  // Fixed care codes so testers can try "Connect with care code"
  bina: { name: 'Bina Devi Bora', email: 'bina@demo.smriti', role: 'patient', language: 'as', profile: { age: 74, hometown: 'Guwahati', state: 'Assam', dementiaStage: 'mild', careCode: 'BINA26' } },
  lal: { name: 'Lalthansangi Ralte', email: 'lalthansangi@demo.smriti', role: 'patient', language: 'en', profile: { age: 79, hometown: 'Aizawl', state: 'Mizoram', dementiaStage: 'moderate', careCode: 'LALR79' } },
  rupam: { name: 'Rupam Bora', email: 'rupam@demo.smriti', role: 'caregiver', language: 'en' },
  mary: { name: 'Mary Lalremruati', email: 'mary@demo.smriti', role: 'caregiver', language: 'en' },
  // Not linked to anyone yet: sign in as her and connect to Bina with code BINA26
  ananya: { name: 'Ananya Bora', email: 'ananya@demo.smriti', role: 'caregiver', language: 'en' },
  admin: { name: 'Site Admin', email: 'admin@demo.smriti', role: 'admin', language: 'en' },
};

// FAKE family members for testing. Photos are illustrated avatars (scripts/generateAvatars.js).
// Phone numbers start with 00000 so they cannot be real.
const av = (slug) => `/seed-avatars/${slug}.svg`;
const BINA_FAMILY = [
  { name: 'Hemanta Bora', relation: 'husband', city: 'Guwahati', birthYear: 1947, notes: 'Retired bank clerk; reads the newspaper to her every morning', photoUrl: av('hemanta-bora') },
  { name: 'Rupam Bora', relation: 'son', phone: '+91 00000 10001', city: 'Guwahati', birthYear: 1976, isEmergencyContact: true, notes: 'Lives with her; main caregiver', photoUrl: av('rupam-bora') },
  { name: 'Anjali Bora', relation: 'daughter-in-law', phone: '+91 00000 10002', city: 'Guwahati', birthYear: 1981, notes: 'Cooks her favourite masor tenga', photoUrl: av('anjali-bora') },
  { name: 'Moni Bora', relation: 'granddaughter', city: 'Guwahati', birthYear: 2012, notes: 'Class 8; loves drawing', photoUrl: av('moni-bora') },
  { name: 'Dipali Saikia', relation: 'sister', phone: '+91 00000 10004', city: 'Jorhat', birthYear: 1954, notes: 'Danced Bihu with her as girls', photoUrl: av('dipali-saikia') },
  { name: 'Ananya Bora', relation: 'granddaughter', phone: '+91 00000 10005', city: 'Bengaluru', birthYear: 2000, notes: 'Software engineer; video-calls on Saturdays', photoUrl: av('ananya-bora') },
];
const LAL_FAMILY = [
  { name: 'Mary Lalremruati', relation: 'daughter', phone: '+91 00000 30001', city: 'Aizawl', birthYear: 1975, isEmergencyContact: true, notes: 'Lives with her; main caregiver', photoUrl: av('mary-lalremruati') },
  { name: 'Zothanpuia Ralte', relation: 'son', phone: '+91 00000 30002', city: 'Shillong', birthYear: 1978, notes: 'Phones every evening', photoUrl: av('zothanpuia-ralte') },
  { name: 'Lalnunmawii', relation: 'granddaughter', city: 'Aizawl', birthYear: 2011, notes: 'Sings in the church choir with her', photoUrl: av('lalnunmawii') },
  { name: 'Vanlalruata Ralte', relation: 'husband', city: 'Aizawl', birthYear: 1944, notes: 'Retired school teacher', photoUrl: av('vanlalruata-ralte') },
];

const BINA_MEMORIES = [
  { title: 'Trip to Kaziranga', place: 'Kaziranga', year: 1998, description: 'We rode an elephant at dawn and saw a one-horned rhino near the river. Hemanta carried the flask of tea.', people: [{ name: 'Hemanta', relation: 'husband' }, { name: 'Rupam', relation: 'son' }], tags: ['travel', 'rhino'] },
  { title: 'Rongali Bihu at Sivasagar', place: 'Sivasagar', year: 1975, description: 'Dancing Bihu with my sister in new mekhela chador. The dhol played all evening.', people: [{ name: 'Dipali', relation: 'sister' }], tags: ['festival', 'bihu'] },
  { title: "Rupam's wedding", place: 'Guwahati', year: 2012, description: 'Rupam married Anjali. The whole family came, and we ate pitha and laru for days.', people: [{ name: 'Rupam', relation: 'son' }, { name: 'Anjali', relation: 'daughter-in-law' }], tags: ['family', 'wedding'] },
  { title: 'Boat ride to Majuli', place: 'Majuli', year: 2005, description: 'A big ferry across the Brahmaputra. We visited the satra and watched mask making.', people: [{ name: 'Hemanta', relation: 'husband' }], tags: ['river', 'travel'] },
  { title: "Moni's first day at school", place: 'Guwahati', year: 2019, description: 'My granddaughter Moni wore a red ribbon and held my hand all the way to the gate.', people: [{ name: 'Moni', relation: 'granddaughter' }, { name: 'Anjali', relation: 'daughter-in-law' }], tags: ['family'] },
  { title: 'Childhood in the tea garden', place: 'Jorhat', year: 1962, description: 'Father worked at the tea estate. We played between the tea bushes and drank sweet tea from brass cups.', people: [{ name: 'Dipali', relation: 'sister' }], tags: ['childhood', 'tea'] },
];

const LAL_MEMORIES = [
  { title: 'Chapchar Kut festival', place: 'Aizawl', year: 1980, description: 'Cheraw bamboo dance in the town square. Everyone wore puan.', people: [{ name: 'Mary', relation: 'daughter' }], tags: ['festival'] },
  { title: 'Church choir Christmas', place: 'Aizawl', year: 1990, description: 'Singing carols all night with the choir.', people: [{ name: 'Zothan', relation: 'son' }, { name: 'Mary', relation: 'daughter' }], tags: ['music'] },
];

const GAME_TYPES = ['memory-match', 'face-recall', 'sequence', 'word-picture'];
const MAX = { 'memory-match': 5, 'face-recall': 6, sequence: 3, 'word-picture': 6 };

// 21 days of play. Accuracy is steady, then dips in the last 4 days so the
// dashboard shows a "declining" trend and the decline alert makes sense.
function fakeSessions(patientId, base, dipLastDays = 4) {
  const out = [];
  for (let day = 20; day >= 0; day--) {
    const perDay = 1 + (day % 3 === 0 ? 1 : 0);
    for (let k = 0; k < perDay; k++) {
      const gameType = GAME_TYPES[(day + k) % GAME_TYPES.length];
      const maxScore = MAX[gameType];
      let acc = base + Math.sin(day + k) * 0.08;
      if (day < dipLastDays) acc -= 0.3;
      acc = Math.min(1, Math.max(0.15, acc));
      const when = new Date(Date.now() - day * 86400000);
      when.setHours(10 + k * 6, 15, 0, 0);
      out.push({
        patientId, gameType, maxScore,
        difficulty: Math.max(1, Math.min(5, Math.round(1 + acc * 3))),
        score: Math.round(acc * maxScore),
        mistakes: Math.round((1 - acc) * 6),
        durationSec: 90 + ((day * 37) % 120),
        completedAt: when,
      });
    }
  }
  return out;
}

// Activity history that matches the game sessions, plus reminders, diary, chats, logins
function fakeActivity(patientId, sessions, memories) {
  const at = (daysAgo, h, m = 0) => { const d = new Date(Date.now() - daysAgo * 86400000); d.setHours(h, m, 0, 0); return d; };
  const out = sessions.map((g) => ({
    patientId, type: 'game', createdAt: g.completedAt,
    summary: `Played ${g.gameType}: ${g.score}/${g.maxScore} at level ${g.difficulty}`,
    details: { gameType: g.gameType, score: g.score, maxScore: g.maxScore, difficulty: g.difficulty },
  }));
  for (let day = 20; day >= 0; day--) {
    out.push({ patientId, type: 'login', createdAt: at(day, 9, 50), summary: 'Signed in' });
    // morning tablet nearly every day; night tablet missed now and then
    out.push({ patientId, type: 'reminder_done', createdAt: at(day, 8, 5), summary: 'Marked done: Blood pressure tablet (08:00)' });
    if (day % 4 !== 1) out.push({ patientId, type: 'reminder_done', createdAt: at(day, 13, 20), summary: 'Marked done: Lunch with rice and dal (13:00)' });
    if (day % 5 !== 2) out.push({ patientId, type: 'reminder_done', createdAt: at(day, 21, 10), summary: 'Marked done: Night tablet (Donepezil) (21:00)' });
    if (day % 3 === 0) out.push({ patientId, type: 'companion_chat', createdAt: at(day, 16, 30), summary: 'Talked with Smriti: "Tell me about Bihu"' });
    if (day % 2 === 0 && memories.length) {
      const m = memories[day % memories.length];
      out.push({ patientId, type: 'memory_viewed', createdAt: at(day, 17, 15), summary: `Looked at the memory "${m.title}"` });
    }
    if (day % 4 === 0) out.push({ patientId, type: 'quiz', createdAt: at(day, 18, 0), summary: `Family quiz: ${day % 8 === 0 ? 4 : 3}/5 correct` });
    if (day % 6 === 0) out.push({ patientId, type: 'family_viewed', createdAt: at(day, 11, 40), summary: 'Looked at the family page (6 people)' });
  }
  out.push({ patientId, type: 'journal', createdAt: at(1, 19, 30), summary: 'Wrote in the voice diary (feeling happy)' });
  out.push({ patientId, type: 'journal', createdAt: at(0, 8, 40), summary: 'Wrote in the voice diary (feeling confused)' });
  return out.filter((a) => a.createdAt <= new Date());
}

async function main() {
  if (config.isProd) throw new Error('Refusing to seed in production');
  await connectDatabases();
  console.log('Clearing old data…');
  await Promise.all([GameSession.deleteMany({}), Memory.deleteMany({}), ChatMessage.deleteMany({}), JournalEntry.deleteMany({}), FamilyMember.deleteMany({}), ActivityLog.deleteMany({})]);
  // Order matters because of foreign keys (Unit V)
  await prisma.alert.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.careLink.deleteMany();
  await prisma.patientProfile.deleteMany();
  await prisma.user.deleteMany();

  console.log('Creating users (PostgreSQL)…');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const u = {};
  for (const [key, d] of Object.entries(DEMO_USERS)) {
    u[key] = await prisma.user.create({
      data: {
        name: d.name, email: d.email, role: d.role, language: d.language, passwordHash,
        ...(d.profile ? { patientProfile: { create: d.profile } } : {}),
      },
    });
  }

  await prisma.careLink.createMany({
    data: [
      { patientId: u.bina.id, carerId: u.rupam.id, relation: 'son' },
      { patientId: u.lal.id, carerId: u.mary.id, relation: 'daughter' },
    ],
  });

  await prisma.reminder.createMany({
    data: [
      { patientId: u.bina.id, title: 'Blood pressure tablet', time: '08:00', kind: 'medicine' },
      { patientId: u.bina.id, title: 'Lunch with rice and dal', time: '13:00', kind: 'meal' },
      { patientId: u.bina.id, title: 'Drink a glass of water', time: '15:30', kind: 'water' },
      { patientId: u.bina.id, title: 'Evening walk in the garden', time: '17:00', kind: 'activity' },
      { patientId: u.bina.id, title: 'Night tablet (Donepezil)', time: '21:00', kind: 'medicine' },
      { patientId: u.lal.id, title: 'Morning tablets', time: '08:30', kind: 'medicine' },
    ],
  });

  console.log('Creating memories, games, chat and diary (MongoDB)…');
  const withEmbeddings = async (list, patientId, createdBy) => {
    for (const m of list) {
      const text = [m.title, m.description, m.place, m.year, ...m.people.map((p) => `${p.name} ${p.relation}`), ...m.tags].join('. ');
      await Memory.create({ ...m, patientId, createdBy, embedding: await embed(text) });
    }
  };
  await withEmbeddings(BINA_MEMORIES, u.bina.id, u.rupam.id);
  await withEmbeddings(LAL_MEMORIES, u.lal.id, u.mary.id);

  await FamilyMember.insertMany([
    ...BINA_FAMILY.map((f) => ({ ...f, patientId: u.bina.id, createdBy: u.rupam.id })),
    ...LAL_FAMILY.map((f) => ({ ...f, patientId: u.lal.id, createdBy: u.mary.id })),
  ]);

  const sessions = [...fakeSessions(u.bina.id, 0.8, 4), ...fakeSessions(u.lal.id, 0.6, 0)];
  await GameSession.insertMany(sessions);
  await ActivityLog.insertMany([
    ...fakeActivity(u.bina.id, sessions.filter((g) => g.patientId === u.bina.id), BINA_MEMORIES),
    ...fakeActivity(u.lal.id, sessions.filter((g) => g.patientId === u.lal.id), LAL_MEMORIES),
  ]);

  await ChatMessage.insertMany([
    { patientId: u.bina.id, senderId: u.rupam.id, senderName: u.rupam.name, senderRole: 'caregiver', text: 'Ma played two games today. She seemed a bit tired.' },
    { patientId: u.bina.id, senderId: u.bina.id, senderName: u.bina.name, senderRole: 'patient', text: 'মই ভালে আছোঁ। ভাত খালোঁ।' },
  ]);
  await JournalEntry.insertMany([
    { patientId: u.bina.id, text: 'আজি মনিয়ে মোক ফোন কৰিছিল। বৰ ভাল লাগিল।', language: 'as', mood: 'happy' },
    { patientId: u.bina.id, text: 'I could not find my glasses this morning.', language: 'en', mood: 'confused' },
  ]);

  await prisma.alert.createMany({
    data: [
      { patientId: u.bina.id, type: 'cognitive_decline', severity: 'medium', message: 'Game accuracy fell from 81% to 52% over the last 5 games. Consider a check-in or doctor review.' },
      { patientId: u.bina.id, type: 'missed_reminder', severity: 'medium', message: '"Night tablet (Donepezil)" (21:00) was not marked as done.', acknowledged: true },
    ],
  });

  console.log('\nDone. Demo accounts (password is in scripts/seed.js / SEED_PASSWORD):');
  for (const d of Object.values(DEMO_USERS)) console.log(`  ${d.role.padEnd(9)} ${d.email}${d.profile ? `   care code ${d.profile.careCode}` : ''}`);
  console.log('  (ananya@demo.smriti is not connected yet — use her to test "Connect with care code")');
  await disconnectDatabases();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDatabases().catch(() => {});
  process.exit(1);
});
