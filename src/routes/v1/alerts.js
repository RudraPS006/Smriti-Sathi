const express = require('express');
const { body, param } = require('express-validator');
const { prisma } = require('../../config/db');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, requireRole, canAccessPatient } = require('../../middleware/auth');
const { createAlert } = require('../../services/alertService');
const { record } = require('../../services/activityService');
const { paginate, pageResult } = require('./helpers');

const router = express.Router();
router.use(requireAuth);

async function visiblePatientIds(user) {
  if (user.role === 'patient') return [user.id];
  if (user.role === 'admin') return undefined; // all
  const links = await prisma.careLink.findMany({ where: { carerId: user.id }, select: { patientId: true } });
  return links.map((l) => l.patientId);
}

// GET /api/v1/alerts?status=open|all&patientId=3&page=1
router.get('/', async (req, res) => {
  let ids = await visiblePatientIds(req.user);
  const only = Number(req.query.patientId);
  if (Number.isInteger(only) && only > 0) {
    if (ids && !ids.includes(only)) throw new HttpError(403, 'You are not part of this patient’s care team');
    ids = [only];
  }
  const where = {
    ...(ids ? { patientId: { in: ids } } : {}),
    ...(req.query.status === 'all' ? {} : { acknowledged: false }),
  };
  const pg = paginate(req, 20);
  const [items, total] = await Promise.all([
    prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, skip: pg.skip, take: pg.limit, include: { patient: { select: { id: true, name: true } } } }),
    prisma.alert.count({ where }),
  ]);
  res.json(pageResult(items, total, pg));
});

// The big red Help button
router.post('/sos', requireRole('patient'), body('note').optional().trim().isLength({ max: 200 }), validate, async (req, res) => {
  const alert = await createAlert({
    patientId: req.user.id,
    type: 'sos',
    severity: 'high',
    message: `${req.user.name} pressed the Help button${req.body.note ? `: "${req.body.note}"` : '.'}`,
  });
  record(req.user.id, 'sos', 'Pressed the Help button', { alertId: alert.id });
  res.status(201).json({ alert });
});

router.patch('/:id/ack', requireRole('caregiver', 'admin'), param('id').isInt(), validate, async (req, res) => {
  const alert = await prisma.alert.findUnique({ where: { id: Number(req.params.id) } });
  if (!alert || !(await canAccessPatient(req.user, alert.patientId))) throw new HttpError(404, 'Alert not found');
  res.json({ alert: await prisma.alert.update({ where: { id: alert.id }, data: { acknowledged: true } }) });
});

module.exports = router;
