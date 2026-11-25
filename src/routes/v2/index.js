// Unit VI — API versioning.
// v2 changes the shape of the stats response (percentages + a trend label)
// without breaking older clients that still call /api/v1/games/stats.
const express = require('express');
const { requireAuth, requirePatientAccess } = require('../../middleware/auth');
const { summary } = require('../../services/reportService');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', version: 'v2' }));

router.get('/games/stats/:patientId', requireAuth, requirePatientAccess(), async (req, res) => {
  const s = await summary(req.patientId, 30);
  const half = Math.floor(s.daily.length / 2);
  const avg = (arr) => (arr.length ? arr.reduce((t, d) => t + d.avgAccuracy, 0) / arr.length : 0);
  const change = avg(s.daily.slice(half)) - avg(s.daily.slice(0, half));
  res.json({
    patientId: req.patientId,
    period: { days: s.days },
    overall: { sessions: s.totals.sessions, minutesPlayed: s.totals.minutes, accuracyPercent: Math.round(s.totals.avgAccuracy * 100) },
    trend: Math.abs(change) < 0.05 ? 'stable' : change > 0 ? 'improving' : 'declining',
    games: s.byGame.map((g) => ({ name: g.gameType, sessions: g.sessions, accuracyPercent: Math.round(g.avgAccuracy * 100), level: g.avgDifficulty })),
  });
});

module.exports = router;
