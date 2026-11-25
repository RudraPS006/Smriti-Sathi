// Caregiver reports on the patient: game stats + a full activity report.
const express = require('express');
const { requireAuth, requireRole, requirePatientAccess } = require('../../middleware/auth');
const { streamGameReport, summary } = require('../../services/reportService');
const { activitySummary, timeline, streamActivityCsv } = require('../../services/activityReport');
const { paginate, pageResult } = require('./helpers');

const router = express.Router();
router.use(requireAuth, requireRole('caregiver', 'admin'));

const daysOf = (req, def = 7) => Math.min(365, Math.max(1, parseInt(req.query.days, 10) || def));

router.get('/:patientId/summary', requirePatientAccess(), async (req, res) => {
  res.json(await summary(req.patientId, daysOf(req, 30)));
});

// Streams a gzip-compressed CSV of every game (Unit I: Stream + Zlib)
router.get('/:patientId/games.csv', requirePatientAccess(), async (req, res) => {
  await streamGameReport(req.patientId, res);
});

// Activity report: GET /api/v1/reports/3/activity?days=7&type=game&page=1&limit=20
router.get('/:patientId/activity', requirePatientAccess(), async (req, res) => {
  const days = daysOf(req);
  const pg = paginate(req, 20, 100);
  const [report, tl] = await Promise.all([
    activitySummary(req.patientId, days),
    timeline(req.patientId, { days, type: req.query.type, skip: pg.skip, limit: pg.limit }),
  ]);
  res.json({ report, timeline: pageResult(tl.items, tl.total, pg) });
});

router.get('/:patientId/activity.csv', requirePatientAccess(), async (req, res) => {
  await streamActivityCsv(req.patientId, daysOf(req, 30), res);
});

module.exports = router;
