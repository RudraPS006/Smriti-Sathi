// Chat history (REST). Live messages travel over Socket.IO — see src/sockets.
const express = require('express');
const ChatMessage = require('../../models/ChatMessage');
const { requireAuth, requirePatientAccess } = require('../../middleware/auth');
const { paginate, pageResult } = require('./helpers');

const router = express.Router();
router.use(requireAuth);

router.get('/:patientId', requirePatientAccess(), async (req, res) => {
  const pg = paginate(req, 30, 100);
  const filter = { patientId: req.patientId };
  const [items, total] = await Promise.all([
    ChatMessage.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    ChatMessage.countDocuments(filter),
  ]);
  res.json(pageResult(items.reverse(), total, pg)); // oldest first for display
});

module.exports = router;
