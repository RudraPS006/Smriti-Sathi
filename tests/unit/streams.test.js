const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const { toCsv } = require('../../src/services/reportService');

test('CSV transform + gzip round trip', async () => {
  const docs = [
    { completedAt: new Date('2026-11-01T10:00:00Z'), gameType: 'sequence', difficulty: 2, score: 2, maxScore: 3, mistakes: 1, durationSec: 60 },
    { completedAt: new Date('2026-11-02T10:00:00Z'), gameType: 'memory-match', difficulty: 3, score: 5, maxScore: 5, mistakes: 0, durationSec: 90 },
  ];
  const chunks = [];
  await pipeline(Readable.from(docs), toCsv(), zlib.createGzip(), async function* (src) { for await (const c of src) chunks.push(c); });
  const csv = zlib.gunzipSync(Buffer.concat(chunks)).toString();
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe('date,game,difficulty,score,max_score,accuracy_pct,mistakes,duration_sec');
  expect(lines[1]).toContain('sequence,2,2,3,67,1,60');
  expect(lines).toHaveLength(3);
});
