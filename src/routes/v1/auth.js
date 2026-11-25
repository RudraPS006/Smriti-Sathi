// Unit II (Router, GET/POST, express-validator) + Unit III (JWT, cookies)
const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { prisma } = require('../../config/db');
const config = require('../../config');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, signToken, cookieOptions, COOKIE } = require('../../middleware/auth');
const { publicUser } = require('./helpers');
const { uniqueCode } = require('../../services/careCode');
const { record } = require('../../services/activityService');

const router = express.Router();

// Slow down password guessing: max 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: config.isTest ? 1000 : 20, standardHeaders: true, legacyHeaders: false });

const registerRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),
  body('email').trim().isEmail().withMessage('Enter a valid email').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  // Admin accounts cannot be self-registered
  body('role').optional().isIn(['patient', 'caregiver']).withMessage('Role must be patient or caregiver'),
  body('language').optional().isIn(config.languages),
  body('age').optional({ values: 'falsy' }).isInt({ min: 40, max: 120 }).toInt(),
  body('hometown').optional().trim().isLength({ max: 80 }),
  body('state').optional().trim().isLength({ max: 40 }),
];

router.post('/register', authLimiter, registerRules, validate, async (req, res) => {
  const { name, email, password, role = 'patient', language = 'en', age, hometown, state } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      name, email, passwordHash, role, language,
      ...(role === 'patient' ? { patientProfile: { create: { age: age || null, hometown, state, careCode: await uniqueCode() } } } : {}),
    },
  });
  res.cookie(COOKIE, signToken(user), cookieOptions());
  res.status(201).json({ user: publicUser(user), token: signToken(user) });
});

router.post(
  '/login',
  authLimiter,
  [body('email').trim().isEmail().normalizeEmail(), body('password').notEmpty()],
  validate,
  async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Email or password is not correct');
    req.session.language = user.language; // express-session: remember language for this browser
    if (user.role === 'patient') record(user.id, 'login', 'Signed in');
    const token = signToken(user);
    res.cookie(COOKIE, token, cookieOptions());
    res.json({ user: publicUser(user), token });
  }
);

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { patientProfile: true } });
  if (!user) throw new HttpError(401, 'Account no longer exists');
  res.json({ user: { ...publicUser(user), profile: user.patientProfile } });
});

router.patch(
  '/me',
  requireAuth,
  [body('language').optional().isIn(config.languages), body('name').optional().trim().isLength({ min: 2, max: 80 }), body('phone').optional().trim().isLength({ max: 20 })],
  validate,
  async (req, res) => {
    const { language, name, phone } = req.body;
    const user = await prisma.user.update({ where: { id: req.user.id }, data: { language, name, phone } });
    if (language) req.session.language = language;
    res.json({ user: publicUser(user) });
  }
);

module.exports = router;
