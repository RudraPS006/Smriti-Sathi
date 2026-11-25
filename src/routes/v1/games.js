// Adaptive memory games API.
// express-session is used to remember which game is in progress, so the
// server (not the browser) measures how long the game took.
const express = require('express');
const { body, param } = require('express-validator');
const { prisma } = require('../../config/db');
const GameSession = require('../../models/GameSession');
const Memory = require('../../models/Memory');
const FamilyMember = require('../../models/FamilyMember');
const { record } = require('../../services/activityService');
const bus = require('../../events/bus');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, requireRole, requirePatientAccess } = require('../../middleware/auth');
const { nextDifficulty, gameConfig } = require('../../services/adaptiveEngine');
const { summary } = require('../../services/reportService');
const { paginate, pageResult } = require('./helpers');

const router = express.Router();
router.use(requireAuth);

const gameTypeRule = param('gameType').isIn(GameSession.GAME_TYPES).withMessage('Unknown game');
const STAGE_START = { mild: 2, moderate: 1, severe: 1 };

async function startingDifficulty(patientId, gameType) {
  const recent = await GameSession.find({ patientId, gameType }).sort({ completedAt: -1 }).limit(3).lean();
  if (recent.length) return nextDifficulty(recent, recent[0].difficulty);
  const profile = await prisma.patientProfile.findUnique({ where: { userId: patientId } });
  return { difficulty: STAGE_START[profile?.dementiaStage] || 1, reason: 'First time playing — starting gently.' };
}

// GET /api/v1/games/:gameType/start  (patient only)
router.get('/:gameType/start', requireRole('patient'), gameTypeRule, validate, async (req, res) => {
  const { gameType } = req.params;
  const { difficulty, reason } = await startingDifficulty(req.user.id, gameType);

  let extra = {};
  if (gameType === 'face-recall') {
    // People come from the family list first, then from memories — personal recall works better than strangers
    const [family, memories] = await Promise.all([
      FamilyMember.find({ patientId: req.user.id }).lean(),
      Memory.find({ patientId: req.user.id, 'people.0': { $exists: true } }).lean(),
    ]);
    const seen = new Map();
    // the same person may appear as "Rupam Bora" (family list) and "Rupam" (a memory) — count them once
    const firstName = (n) => String(n).trim().split(/\s+/)[0].toLowerCase();
    const known = new Set();
    const add = (name, relation, photoUrl) => {
      const key = firstName(name);
      if (!name || !relation || known.has(key)) return;
      known.add(key);
      seen.set(name, { name, relation, photoUrl: photoUrl || '' });
    };
    family.forEach((f) => add(f.name, f.relation, f.photoUrl));
    memories.forEach((m) => m.people.forEach((p) => add(p.name, p.relation, m.photoUrl)));
    extra.people = [...seen.values()];
  }

  req.session.currentGame = { gameType, difficulty, startedAt: Date.now() };
  res.json({ gameType, difficulty, reason, config: gameConfig(gameType, difficulty), ...extra });
});

// POST /api/v1/games/:gameType/result
router.post(
  '/:gameType/result',
  requireRole('patient'),
  gameTypeRule,
  body('score').isInt({ min: 0 }).toInt(),
  body('maxScore').isInt({ min: 1, max: 100 }).toInt(),
  body('mistakes').optional().isInt({ min: 0, max: 500 }).toInt(),
  body('score').custom((score, { req }) => score <= Number(req.body.maxScore)).withMessage('Score cannot be more than max score'),
  validate,
  async (req, res) => {
    const { gameType } = req.params;
    const current = req.session.currentGame;
    if (!current || current.gameType !== gameType) {
      throw new HttpError(409, 'No game of this type was started. Please start the game again.');
    }
    const durationSec = Math.min(3600, Math.round((Date.now() - current.startedAt) / 1000));
    const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { language: true } });

    const session = await GameSession.create({
      patientId: req.user.id,
      gameType,
      difficulty: current.difficulty,
      score: req.body.score,
      maxScore: req.body.maxScore,
      mistakes: req.body.mistakes || 0,
      durationSec,
      language: me?.language || 'en',
    });
    delete req.session.currentGame;

    bus.emit(bus.EVENTS.GAME_COMPLETED, session.toObject()); // decline check runs in the background
    record(req.user.id, 'game', `Played ${gameType}: ${session.score}/${session.maxScore} at level ${session.difficulty}`, {
      gameType, score: session.score, maxScore: session.maxScore, difficulty: session.difficulty, durationSec,
    });
    const next = await startingDifficulty(req.user.id, gameType);
    res.status(201).json({ session, next });
  }
);

// GET /api/v1/games/history/:patientId?page=1&limit=10&gameType=sequence
router.get('/history/:patientId', requirePatientAccess(), async (req, res) => {
  const pg = paginate(req);
  const filter = { patientId: req.patientId };
  if (GameSession.GAME_TYPES.includes(req.query.gameType)) filter.gameType = req.query.gameType;
  const [items, total] = await Promise.all([
    GameSession.find(filter).sort({ completedAt: -1 }).skip(pg.skip).limit(pg.limit),
    GameSession.countDocuments(filter),
  ]);
  res.json(pageResult(items, total, pg));
});

// GET /api/v1/games/stats/:patientId?days=30
router.get('/stats/:patientId', requirePatientAccess(), async (req, res) => {
  const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
  res.json(await summary(req.patientId, days));
});

module.exports = router;
