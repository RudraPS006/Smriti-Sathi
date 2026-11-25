// Unit I — Stream module + Zlib, Unit IV — MongoDB aggregation
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const GameSession = require('../models/GameSession');

const csvCell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// A Transform stream: Mongo documents in -> CSV lines out
function toCsv() {
  let headerSent = false;
  return new Transform({
    writableObjectMode: true, // accepts JS objects
    transform(doc, _enc, done) {
      let out = '';
      if (!headerSent) {
        out += 'date,game,difficulty,score,max_score,accuracy_pct,mistakes,duration_sec\n';
        headerSent = true;
      }
      const acc = Math.round((doc.score / doc.maxScore) * 100);
      out += [doc.completedAt.toISOString(), doc.gameType, doc.difficulty, doc.score, doc.maxScore, acc, doc.mistakes, doc.durationSec]
        .map(csvCell).join(',') + '\n';
      done(null, out);
    },
  });
}

/**
 * Streams every game session of a patient as a gzip-compressed CSV.
 * Memory stays flat even with years of data: Mongo cursor -> CSV -> gzip -> HTTP response.
 */
async function streamGameReport(patientId, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Disposition', `attachment; filename="patient-${patientId}-games.csv"`);
  const cursor = GameSession.find({ patientId }).sort({ completedAt: 1 }).lean().cursor();
  await pipeline(cursor, toCsv(), zlib.createGzip(), res);
}

// Aggregation pipeline: per-game averages + daily trend for the last N days
async function summary(patientId, days = 30) {
  const since = new Date(Date.now() - days * 86400000);
  const match = { $match: { patientId, completedAt: { $gte: since } } };
  const accuracy = { $divide: ['$score', '$maxScore'] };

  const [byGame, daily, totals] = await Promise.all([
    GameSession.aggregate([
      match,
      { $group: { _id: '$gameType', sessions: { $sum: 1 }, avgAccuracy: { $avg: accuracy }, avgDifficulty: { $avg: '$difficulty' }, lastPlayed: { $max: '$completedAt' } } },
      { $sort: { _id: 1 } },
    ]),
    GameSession.aggregate([
      match,
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone: 'Asia/Kolkata' } }, sessions: { $sum: 1 }, avgAccuracy: { $avg: accuracy } } },
      { $sort: { _id: 1 } },
    ]),
    GameSession.aggregate([match, { $group: { _id: null, sessions: { $sum: 1 }, minutes: { $sum: { $divide: ['$durationSec', 60] } }, avgAccuracy: { $avg: accuracy } } }]),
  ]);

  const t = totals[0] || { sessions: 0, minutes: 0, avgAccuracy: 0 };
  return {
    days,
    totals: { sessions: t.sessions, minutes: Math.round(t.minutes), avgAccuracy: round(t.avgAccuracy) },
    byGame: byGame.map((g) => ({ gameType: g._id, sessions: g.sessions, avgAccuracy: round(g.avgAccuracy), avgDifficulty: round(g.avgDifficulty, 1), lastPlayed: g.lastPlayed })),
    daily: daily.map((d) => ({ date: d._id, sessions: d.sessions, avgAccuracy: round(d.avgAccuracy) })),
  };
}

const round = (n, dp = 2) => Math.round((n || 0) * 10 ** dp) / 10 ** dp;

module.exports = { streamGameReport, summary, toCsv };
