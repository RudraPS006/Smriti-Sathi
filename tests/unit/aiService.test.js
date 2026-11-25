const { mockEmbed, cosine, isDistress } = require('../../src/services/aiService');
const { companionSystemPrompt } = require('../../src/services/prompts');

test('mock embeddings: similar text scores higher than unrelated text', () => {
  const q = mockEmbed('rhino trip to Kaziranga');
  const close = mockEmbed('We saw a rhino at Kaziranga on our trip');
  const far = mockEmbed('Wedding food pitha and laru');
  expect(cosine(q, close)).toBeGreaterThan(cosine(q, far));
});

test('distress words are detected in several languages', () => {
  expect(isDistress('I fell in the bathroom')).toBe(true);
  expect(isDistress('मुझे दर्द हो रहा है')).toBe(true);
  expect(isDistress('মোক সহায় লাগে')).toBe(true);
  expect(isDistress('The tea was lovely')).toBe(false);
});

test('system prompt contains language, safety rules and memories', () => {
  const p = companionSystemPrompt({ name: 'Bina', language: 'as', hometown: 'Guwahati', memories: [{ title: 'Bihu', description: 'dance', place: 'Sivasagar', year: 1975 }] });
  expect(p).toMatch(/Assamese/);
  expect(p).toMatch(/Never give medical advice/);
  expect(p).toMatch(/Bihu \(1975\), Sivasagar/);
});
