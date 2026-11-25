// Unit VI — LLM integration: OpenAI chat, embeddings, speech-to-text.
// If OPENAI_API_KEY is empty the service runs in MOCK MODE so the whole app
// still works (and can be demoed / tested) without paying for API calls.
const OpenAI = require('openai');
const { toFile } = require('openai');
const config = require('../config');
const Memory = require('../models/Memory');
const FamilyMember = require('../models/FamilyMember');
const { companionSystemPrompt, quizPrompt } = require('./prompts');

const client = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;
const isMock = () => !client;

/* ----------------------------- Embeddings ------------------------------ */

const MOCK_DIMS = 256;
const STOP = new Set('the a an and or of to in on at is was were with for my your our we you i me it this that'.split(' '));

// Offline stand-in for a real embedding: "hashing trick" bag of words.
// Not truly semantic, but similar wording gives similar vectors, which is enough to demo search.
function mockEmbed(text) {
  const v = new Array(MOCK_DIMS).fill(0);
  const words = (String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => !STOP.has(w));
  for (const w of words) {
    let h = 2166136261;
    for (const ch of w) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    v[Math.abs(h) % MOCK_DIMS] += 1;
  }
  return normalise(v);
}

async function embed(text) {
  if (isMock()) return mockEmbed(text);
  const res = await client.embeddings.create({ model: config.openai.embedModel, input: text });
  return res.data[0].embedding;
}

const memoryText = (m) =>
  [m.title, m.description, m.place, m.year, ...(m.people || []).map((p) => `${p.name} ${p.relation}`), ...(m.tags || [])]
    .filter(Boolean).join('. ');

async function embedMemory(memoryId) {
  const m = await Memory.findById(memoryId);
  if (!m) return;
  m.embedding = await embed(memoryText(m));
  await m.save();
}

function cosine(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are normalised, so dot product == cosine similarity
}

function normalise(v) {
  const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / len);
}

/** Semantic search over one patient's memories. */
async function searchMemories(patientId, query, k = 3) {
  const q = normalise(await embed(query));
  const memories = await Memory.find({ patientId }).select('+embedding').lean();
  const scored = [];
  for (const m of memories) {
    let e = m.embedding;
    if (!e || e.length !== q.length) {
      // embedding missing, or made by a different model (e.g. mock -> real key added later)
      e = await embed(memoryText(m));
      await Memory.updateOne({ _id: m._id }, { embedding: e });
    }
    scored.push({ memory: m, score: cosine(q, normalise(e)) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((s) => s.score > 0.05)
    .map(({ memory, score }) => {
      const { embedding, ...rest } = memory; // never send vectors to the browser
      return { ...rest, score: Math.round(score * 100) / 100 };
    });
}

/* ------------------------------ Safety --------------------------------- */

const DISTRESS = [
  'pain', 'hurt', 'fell', 'fall', 'help me', 'scared', 'dizzy', 'bleeding', 'lost',
  'दर्द', 'गिर', 'मदद', 'डर', 'चक्कर',
  'বিষ', 'পৰি', 'সহায়', 'ভয়',
  'ব্যথা', 'পড়ে', 'সাহায্য',
];
const isDistress = (text) => DISTRESS.some((w) => String(text).toLowerCase().includes(w));

/* ------------------------------- Chat ---------------------------------- */

const MOCK_LINES = {
  en: {
    memory: '{name}, it is lovely talking with you. Do you remember "{title}"? Tell me a little about it.',
    plain: '{name}, I am right here with you. You are safe. Shall we play a memory game together?',
    sos: '{name}, please press the red Help button. Your family is being told right now.',
  },
  hi: {
    memory: '{name} जी, आपसे बात करके अच्छा लगा। क्या आपको "{title}" याद है? उसके बारे में थोड़ा बताइए।',
    plain: '{name} जी, मैं आपके साथ हूँ। आप सुरक्षित हैं। क्या हम साथ में एक खेल खेलें?',
    sos: '{name} जी, कृपया लाल \'मदद\' बटन दबाइए। आपके परिवार को अभी बताया जा रहा है।',
  },
  as: {
    memory: '{name}, আপোনাৰ লগত কথা পাতি ভাল লাগিল। আপোনাৰ "{title}" মনত আছেনে? অলপ কওকচোন।',
    plain: '{name}, মই আপোনাৰ লগতে আছোঁ। আপুনি সুৰক্ষিত। আহক, একেলগে এটা খেল খেলোঁ?',
    sos: '{name}, অনুগ্ৰহ কৰি ৰঙা \'সহায়\' বুটামটো টিপক। আপোনাৰ পৰিয়ালক এতিয়াই জনোৱা হৈছে।',
  },
  bn: {
    memory: '{name}, আপনার সাথে কথা বলে ভালো লাগলো। আপনার কি "{title}" মনে আছে? একটু বলুন না।',
    plain: '{name}, আমি আপনার পাশে আছি। আপনি নিরাপদে আছেন। চলুন, একসাথে একটা খেলা খেলি?',
    sos: '{name}, দয়া করে লাল \'সাহায্য\' বোতামটি টিপুন। আপনার পরিবারকে এখনই জানানো হচ্ছে।',
  },
};

const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

/**
 * Companion chat with retrieval: find the patient's most relevant memories (embeddings),
 * put them in the system prompt, then ask the model.
 */
async function companionReply({ patient, message, language = 'en', history = [] }) {
  const firstName = patient.name.split(' ')[0];
  const distress = isDistress(message);
  const [related, family] = await Promise.all([
    searchMemories(patient.id, message, 3),
    FamilyMember.find({ patientId: patient.id }).select('name relation city notes').limit(20).lean(),
  ]);

  if (isMock()) {
    const lines = MOCK_LINES[language] || MOCK_LINES.en;
    const tpl = distress ? lines.sos : related.length ? lines.memory : lines.plain;
    return { reply: fill(tpl, { name: firstName, title: related[0]?.title }), distress, memoriesUsed: related.map((m) => m.title), mock: true };
  }

  const messages = [
    { role: 'system', content: companionSystemPrompt({ name: firstName, language, hometown: patient.hometown, memories: related, family }) },
    ...history.slice(-6).map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 500) })),
    { role: 'user', content: message },
  ];
  const res = await client.chat.completions.create({ model: config.openai.model, messages, temperature: 0.6, max_tokens: 160 });
  return { reply: res.choices[0].message.content.trim(), distress, memoriesUsed: related.map((m) => m.title), mock: false };
}

/* ------------------------------- Quiz ---------------------------------- */

const QUIZ_TPL = {
  en: { place: 'Where was "{title}"?', person: 'Who is {name} to you?' },
  hi: { place: '"{title}" कहाँ था?', person: '{name} आपके क्या लगते हैं?' },
  as: { place: '"{title}" ক\'ত আছিল?', person: '{name} আপোনাৰ কি হয়?' },
  bn: { place: '"{title}" কোথায় ছিল?', person: '{name} আপনার কে হন?' },
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mockQuiz(memories, language, family = []) {
  const t = QUIZ_TPL[language] || QUIZ_TPL.en;
  const places = [...new Set([...memories.map((m) => m.place).filter(Boolean), 'Shillong', 'Guwahati', 'Kaziranga', 'Agartala'])];
  const relations = [...new Set([...family.map((f) => f.relation), ...memories.flatMap((m) => (m.people || []).map((p) => p.relation)).filter(Boolean), 'neighbour', 'cousin', 'teacher'])];
  const pick = (pool, correct) => shuffle([correct, ...shuffle(pool.filter((x) => x !== correct)).slice(0, 2)]);

  const questions = [];
  // One or two questions about family members
  for (const f of shuffle(family).slice(0, 2)) {
    const options = pick(relations, f.relation);
    questions.push({ question: fill(t.person, { name: f.name }), options, answerIndex: options.indexOf(f.relation) });
  }
  for (const m of shuffle(memories)) {
    if (questions.length >= 5) break;
    const person = (m.people || []).find((p) => p.name && p.relation);
    if (person && Math.random() < 0.5) {
      const options = pick(relations, person.relation);
      questions.push({ question: fill(t.person, { name: person.name }), options, answerIndex: options.indexOf(person.relation), memoryId: m._id });
    } else if (m.place) {
      const options = pick(places, m.place);
      questions.push({ question: fill(t.place, { title: m.title }), options, answerIndex: options.indexOf(m.place), memoryId: m._id });
    }
  }
  return questions;
}

async function generateQuiz({ patientId, language = 'en' }) {
  const [memories, family] = await Promise.all([
    Memory.find({ patientId }).sort({ createdAt: -1 }).limit(8).lean(),
    FamilyMember.find({ patientId }).select('name relation').lean(),
  ]);
  if (!memories.length && !family.length) return { questions: [], mock: isMock() };
  if (isMock()) return { questions: mockQuiz(memories, language, family), mock: true };

  const res = await client.chat.completions.create({
    model: config.openai.model,
    messages: [{ role: 'user', content: quizPrompt({ language, memories, family }) }],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });
  let parsed;
  try { parsed = JSON.parse(res.choices[0].message.content); } catch { parsed = { questions: [] }; }
  // Never trust model output blindly: validate shape before sending to the browser
  const questions = (parsed.questions || []).filter(
    (q) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2 &&
      Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < q.options.length
  ).slice(0, 5);
  return { questions: questions.length ? questions : mockQuiz(memories, language, family), mock: false };
}

/* --------------------------- Speech to text ---------------------------- */

async function transcribe(buffer, filename, language) {
  if (isMock()) {
    return { text: '', mock: true, message: 'Speech-to-text needs an OpenAI key. Please type instead.' };
  }
  const file = await toFile(buffer, filename || 'speech.webm');
  const res = await client.audio.transcriptions.create({ file, model: config.openai.sttModel, language });
  return { text: res.text, mock: false };
}

module.exports = { isMock, embed, embedMemory, searchMemories, companionReply, generateQuiz, transcribe, isDistress, mockEmbed, cosine };
