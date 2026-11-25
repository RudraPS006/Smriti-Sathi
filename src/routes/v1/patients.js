// Patients and their care team.
// A caregiver can connect to a patient in two ways:
//   1. POST /patients/connect  { careCode }  — the patient already has an account
//   2. POST /patients          { name, email, password, ... } — create the patient's account for them
const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { prisma } = require('../../config/db');
const config = require('../../config');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, requireRole, requirePatientAccess } = require('../../middleware/auth');
const { uniqueCode, normalise, LENGTH } = require('../../services/careCode');
const { publicUser } = require('./helpers');

const router = express.Router();
router.use(requireAuth);

// Guessing care codes must be slow: 10 tries per 15 minutes per IP
const connectLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 10, standardHeaders: true, legacyHeaders: false });

const profileRules = [
  body('age').optional({ values: 'falsy' }).isInt({ min: 40, max: 120 }).toInt(),
  body('hometown').optional().trim().isLength({ max: 80 }),
  body('state').optional().trim().isLength({ max: 40 }),
  body('dementiaStage').optional().isIn(['mild', 'moderate', 'severe']),
  body('notes').optional().trim().isLength({ max: 1000 }),
];

async function withAlertCounts(patients) {
  const open = await prisma.alert.groupBy({
    by: ['patientId'], where: { patientId: { in: patients.map((p) => p.id) }, acknowledged: false }, _count: true,
  });
  const count = Object.fromEntries(open.map((a) => [a.patientId, a._count]));
  return patients.map((p) => ({ ...publicUser(p), relation: p.relation, profile: p.patientProfile, openAlerts: count[p.id] || 0 }));
}

// Caregiver: "my patients". Patient: themselves. Admin: everyone.
router.get('/', async (req, res) => {
  const include = { patientProfile: true };
  let patients;
  if (req.user.role === 'patient') {
    patients = await prisma.user.findMany({ where: { id: req.user.id }, include });
  } else if (req.user.role === 'admin') {
    patients = await prisma.user.findMany({ where: { role: 'patient' }, include, orderBy: { name: 'asc' } });
  } else {
    const links = await prisma.careLink.findMany({ where: { carerId: req.user.id }, include: { patient: { include } }, orderBy: { createdAt: 'asc' } });
    patients = links.map((l) => ({ ...l.patient, relation: l.relation }));
  }
  res.json({ patients: await withAlertCounts(patients) });
});

// ---- Patient: see / renew my care code ----
router.get('/me/care-code', requireRole('patient'), async (req, res) => {
  let profile = await prisma.patientProfile.findUnique({ where: { userId: req.user.id } });
  if (!profile?.careCode) {
    profile = await prisma.patientProfile.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, careCode: await uniqueCode() },
      update: { careCode: await uniqueCode() },
    });
  }
  res.json({ careCode: profile.careCode });
});

router.post('/me/care-code/regenerate', requireRole('patient'), async (req, res) => {
  const profile = await prisma.patientProfile.update({ where: { userId: req.user.id }, data: { careCode: await uniqueCode() } });
  res.json({ careCode: profile.careCode });
});

// ---- Caregiver option 1: connect to an existing patient with their care code ----
router.post(
  '/connect',
  requireRole('caregiver'),
  connectLimiter,
  [
    body('careCode').customSanitizer(normalise).isLength({ min: LENGTH, max: LENGTH }).withMessage(`The care code has ${LENGTH} letters/numbers`),
    body('relation').optional().trim().isLength({ max: 40 }),
  ],
  validate,
  async (req, res) => {
    const profile = await prisma.patientProfile.findUnique({ where: { careCode: req.body.careCode }, include: { user: true } });
    if (!profile) throw new HttpError(404, 'No patient found with that care code');
    const link = await prisma.careLink.create({
      data: { patientId: profile.userId, carerId: req.user.id, relation: req.body.relation || null },
    });
    res.status(201).json({ link, patient: publicUser(profile.user) });
  }
);

// ---- Caregiver option 2: create an account for the patient and connect ----
router.post(
  '/',
  requireRole('caregiver'),
  [
    body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),
    body('email').trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('language').optional().isIn(config.languages),
    body('relation').optional().trim().isLength({ max: 40 }),
    ...profileRules,
  ],
  validate,
  async (req, res) => {
    const { name, email, password, language = 'en', relation, age, hometown, state, dementiaStage, notes } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const careCode = await uniqueCode();
    // One transaction: either the user, profile and link are all created, or none of them
    const patient = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name, email, passwordHash, role: 'patient', language, patientProfile: { create: { age: age || null, hometown, state, dementiaStage, notes, careCode } } },
      });
      await tx.careLink.create({ data: { patientId: user.id, carerId: req.user.id, relation: relation || null } });
      return user;
    });
    res.status(201).json({ patient: publicUser(patient), careCode });
  }
);

router.get('/:patientId', requirePatientAccess(), async (req, res) => {
  const p = await prisma.user.findUnique({
    where: { id: req.patientId },
    include: { patientProfile: true, careTeam: { include: { carer: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (!p || p.role !== 'patient') throw new HttpError(404, 'Patient not found');
  res.json({
    patient: { ...publicUser(p), profile: p.patientProfile },
    careTeam: p.careTeam.map((l) => ({ ...publicUser(l.carer), relation: l.relation, since: l.createdAt })),
  });
});

router.patch('/:patientId/profile', requirePatientAccess(), profileRules, validate, async (req, res) => {
  const { age, dementiaStage, hometown, state, notes } = req.body;
  const profile = await prisma.patientProfile.upsert({
    where: { userId: req.patientId },
    create: { userId: req.patientId, age, dementiaStage, hometown, state, notes, careCode: await uniqueCode() },
    update: { age, dementiaStage, hometown, state, notes },
  });
  res.json({ profile });
});

// Invite another caregiver (e.g. a sibling) by the email of their caregiver account
router.post(
  '/:patientId/care-team',
  requirePatientAccess(),
  [body('email').trim().isEmail().normalizeEmail(), body('relation').optional().trim().isLength({ max: 40 })],
  validate,
  async (req, res) => {
    const carer = await prisma.user.findUnique({ where: { email: req.body.email } });
    if (!carer || carer.role !== 'caregiver') throw new HttpError(404, 'No caregiver account with that email');
    const link = await prisma.careLink.create({ data: { patientId: req.patientId, carerId: carer.id, relation: req.body.relation } });
    res.status(201).json({ link });
  }
);

// Remove a caregiver: the patient, an admin, or the caregiver themselves ("leave")
router.delete('/:patientId/care-team/:carerId', requirePatientAccess(), async (req, res) => {
  const carerId = Number(req.params.carerId);
  if (req.user.role === 'caregiver' && req.user.id !== carerId) {
    throw new HttpError(403, 'Caregivers can only remove themselves');
  }
  await prisma.careLink.delete({ where: { patientId_carerId: { patientId: req.patientId, carerId } } });
  res.status(204).end();
});

module.exports = router;
