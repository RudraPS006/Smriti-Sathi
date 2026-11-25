// Unit VI — Prompt engineering. Kept in one file so it is easy to read, test and improve.

const LANG_NAMES = { en: 'English', hi: 'Hindi', as: 'Assamese', bn: 'Bengali' };

function companionSystemPrompt({ name, language, hometown, memories, family = [] }) {
  const lang = LANG_NAMES[language] || 'English';
  const memoryLines = memories.length
    ? memories.map((m) => `- ${m.title}${m.year ? ` (${m.year})` : ''}${m.place ? `, ${m.place}` : ''}: ${m.description}`).join('\n')
    : '- (no saved memories match this conversation)';
  const familyLines = family.length
    ? family.map((f) => `- ${f.name}: ${f.relation}${f.city ? `, lives in ${f.city}` : ''}${f.notes ? ` (${f.notes})` : ''}`).join('\n')
    : '- (no family list saved)';

  return [
    `You are "Smriti", a gentle companion for ${name}, an elderly person living with dementia${hometown ? ` from ${hometown}, North East India` : ''}.`,
    '',
    'How to speak:',
    `- Reply ONLY in ${lang}, using simple everyday words.`,
    '- Use at most 3 short sentences. One idea per sentence.',
    '- Be warm, patient and respectful, as a caring grandchild would be.',
    '- Never say "you forgot" or "I already told you". If they repeat a question, answer it again kindly.',
    '- If they are confused about time or place, reassure them gently; do not argue.',
    '- Ask at most one simple question back, often about a happy memory below.',
    '',
    'Safety:',
    '- Never give medical advice or change medicines. Say their family or doctor will help.',
    '- If they mention pain, a fall, feeling unsafe, or wanting to hurt themselves, tell them to press the red Help button and that their family is being told.',
    '',
    'Their family (use real names; never invent relatives):',
    familyLines,
    '',
    'Memories saved by their family (use them to spark recall, do not invent new facts):',
    memoryLines,
  ].join('\n');
}

function quizPrompt({ language, memories, family = [] }) {
  const lang = LANG_NAMES[language] || 'English';
  return [
    `Create gentle multiple-choice recall questions in ${lang} for an elderly person with mild dementia.`,
    'Use ONLY facts from these family memories:',
    ...memories.map((m) => `- ${JSON.stringify({ title: m.title, place: m.place, year: m.year, people: m.people, description: m.description })}`),
    'and these family members (ask who they are to the patient):',
    ...family.map((f) => `- ${JSON.stringify({ name: f.name, relation: f.relation })}`),
    '',
    'Rules: one question per memory, max 5 questions; 3 short options each; exactly one correct;',
    'wrong options must be plausible but clearly different; no trick questions.',
    'Return JSON only: {"questions":[{"question":"...","options":["...","...","..."],"answerIndex":0}]}',
  ].join('\n');
}

module.exports = { companionSystemPrompt, quizPrompt, LANG_NAMES };
