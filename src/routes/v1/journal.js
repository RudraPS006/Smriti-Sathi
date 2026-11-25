const express = require('express');
const { body } = require('express-validator');
const JournalEntry = require('../../models/JournalEntry');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole, requirePatientAccess } = require('../../middleware/auth');
const { paginate, pageResult } = require('./helpers');
const { record } = require('../../services/activityService');

const router = express.Router();
router.use(requireAuth);

router.post(
  '/',
  requireRole('patient'),
  [body('text').trim().isLength({ min: 1, max: 4000 }), body('language').optional().isIn(['en', 'hi', 'as', 'bn']), body('mood').optional().isIn(['happy', 'okay', 'sad', 'confused', ''])],
  validate,
  async (req, res) => {
    const entry = await JournalEntry.create({ patientId: req.user.id, text: req.body.text, language: req.body.language, mood: req.body.mood });
    record(req.user.id, 'journal', `Wrote in the voice diary${entry.mood ? ` (feeling ${entry.mood})` : ''}`, { mood: entry.mood, words: entry.text.split(/\s+/).length });
    res.status(201).json({ entry });
  }
);

router.get('/:patientId', requirePatientAccess(), async (req, res) => {
  const pg = paginate(req, 10);
  const filter = { patientId: req.patientId };
  const [items, total] = await Promise.all([
    JournalEntry.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    JournalEntry.countDocuments(filter),
  ]);
  res.json(pageResult(items, total, pg));
});

module.exports = router;
