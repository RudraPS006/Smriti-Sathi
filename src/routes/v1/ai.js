// Unit VI — LLM integration endpoints
const express = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { prisma } = require('../../config/db');
const config = require('../../config');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const ai = require('../../services/aiService');
const { createAlert, hasRecentOpenAlert } = require('../../services/alertService');
const { record } = require('../../services/activityService');

const router = express.Router();
router.use(requireAuth);
// LLM calls cost money: 30 per 10 minutes per IP
router.use(rateLimit({ windowMs: 10 * 60 * 1000, limit: config.isTest ? 1000 : 30, standardHeaders: true, legacyHeaders: false }));

const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/status', (req, res) => res.json({ mock: ai.isMock(), model: ai.isMock() ? 'mock' : config.openai.model }));

// Smriti companion chat
router.post(
  '/companion',
  requireRole('patient'),
  [body('message').trim().isLength({ min: 1, max: 500 }), body('history').optional().isArray({ max: 12 })],
  validate,
  async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { patientProfile: true } });
    const result = await ai.companionReply({
      patient: { id: user.id, name: user.name, hometown: user.patientProfile?.hometown },
      message: req.body.message,
      language: user.language,
      history: req.body.history || [],
    });
    record(user.id, 'companion_chat', `Talked with Smriti: "${req.body.message.slice(0, 120)}"`, { distress: result.distress });
    // Words like "pain" or "I fell" -> tell the family right away
    if (result.distress && !(await hasRecentOpenAlert(user.id, 'sos', 1))) {
      await createAlert({ patientId: user.id, type: 'sos', severity: 'high', message: `Possible distress in companion chat: "${req.body.message.slice(0, 120)}"` });
    }
    res.json(result);
  }
);

// Recall quiz generated from the family's memories
router.get('/quiz', requireRole('patient'), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { language: true } });
  res.json(await ai.generateQuiz({ patientId: req.user.id, language: user.language }));
});

// The patient finished the quiz -> goes into the activity report
router.post(
  '/quiz/result',
  requireRole('patient'),
  [body('score').isInt({ min: 0 }).toInt(), body('total').isInt({ min: 1, max: 20 }).toInt()],
  body('score').custom((score, { req }) => score <= Number(req.body.total)).withMessage('Score cannot be more than total'),
  validate,
  async (req, res) => {
    await record(req.user.id, 'quiz', `Family quiz: ${req.body.score}/${req.body.total} correct`, { score: req.body.score, total: req.body.total });
    res.status(201).json({ ok: true });
  }
);

// Speech-to-text (used for Assamese, where browser speech recognition is weak)
router.post('/transcribe', audioUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: { status: 400, message: 'No audio received' } });
  const lang = config.languages.includes(req.body.language) ? req.body.language : undefined;
  res.json(await ai.transcribe(req.file.buffer, req.file.originalname, lang));
});

module.exports = router;
