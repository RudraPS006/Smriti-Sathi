// Unit V — CRUD on PostgreSQL through Prisma
const express = require('express');
const { body, param } = require('express-validator');
const { prisma } = require('../../config/db');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, requireRole, requirePatientAccess, canAccessPatient } = require('../../middleware/auth');
const { startOfTodayIST } = require('../../services/scheduler');
const { record } = require('../../services/activityService');

const router = express.Router();
router.use(requireAuth);

const rules = [
  body('title').trim().isLength({ min: 2, max: 80 }),
  body('time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Time must be HH:MM (24 hour)'),
  body('kind').optional().isIn(['medicine', 'meal', 'water', 'activity']),
  body('active').optional().isBoolean().toBoolean(),
];

async function loadOwned(req) {
  const r = await prisma.reminder.findUnique({ where: { id: Number(req.params.id) } });
  if (!r || !(await canAccessPatient(req.user, r.patientId))) throw new HttpError(404, 'Reminder not found');
  return r;
}

router.get('/:patientId', requirePatientAccess(), async (req, res) => {
  const reminders = await prisma.reminder.findMany({ where: { patientId: req.patientId }, orderBy: { time: 'asc' } });
  const today = startOfTodayIST();
  res.json({ reminders: reminders.map((r) => ({ ...r, doneToday: Boolean(r.lastDoneAt && r.lastDoneAt >= today) })) });
});

router.post('/:patientId', requirePatientAccess(), requireRole('caregiver', 'admin'), rules, validate, async (req, res) => {
  const { title, time, kind, active } = req.body;
  const reminder = await prisma.reminder.create({ data: { patientId: req.patientId, title, time, kind, active } });
  res.status(201).json({ reminder });
});

router.patch('/item/:id', requireRole('caregiver', 'admin'), param('id').isInt(), rules.map((r) => r.optional()), validate, async (req, res) => {
  await loadOwned(req);
  const { title, time, kind, active } = req.body;
  const reminder = await prisma.reminder.update({ where: { id: Number(req.params.id) }, data: { title, time, kind, active } });
  res.json({ reminder });
});

router.delete('/item/:id', requireRole('caregiver', 'admin'), param('id').isInt(), validate, async (req, res) => {
  await loadOwned(req);
  await prisma.reminder.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

// Patient taps "Done" on the reminder card
router.post('/item/:id/done', param('id').isInt(), validate, async (req, res) => {
  const before = await loadOwned(req);
  const reminder = await prisma.reminder.update({ where: { id: Number(req.params.id) }, data: { lastDoneAt: new Date() } });
  record(before.patientId, 'reminder_done', `Marked done: ${before.title} (${before.time})`, { reminderId: before.id, kind: before.kind, dueTime: before.time });
  res.json({ reminder });
});

module.exports = router;
