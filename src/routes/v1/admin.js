const express = require('express');
const fs = require('fs');
const { body, param } = require('express-validator');
const { prisma } = require('../../config/db');
const validate = require('../../middleware/validate');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { archiveOldLogs, readArchive, LOG_DIR } = require('../../services/logService');
const { paginate, pageResult, publicUser } = require('./helpers');

const router = express.Router();
router.use(requireAuth, requireRole('admin')); // RBAC: whole router is admin-only

router.get('/users', async (req, res) => {
  const pg = paginate(req, 20);
  const where = ['patient', 'caregiver', 'admin'].includes(req.query.role) ? { role: req.query.role } : {};
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { id: 'asc' }, skip: pg.skip, take: pg.limit }),
    prisma.user.count({ where }),
  ]);
  res.json(pageResult(users.map(publicUser), total, pg));
});

router.patch('/users/:id/role', [param('id').isInt(), body('role').isIn(['patient', 'caregiver', 'admin'])], validate, async (req, res) => {
  const user = await prisma.user.update({ where: { id: Number(req.params.id) }, data: { role: req.body.role } });
  res.json({ user: publicUser(user) });
});

router.get('/logs', async (req, res) => {
  const files = (await fs.promises.readdir(LOG_DIR).catch(() => [])).filter((f) => /\.log(\.gz)?$/.test(f)).sort();
  res.json({ files });
});

router.post('/logs/archive', async (req, res) => res.json({ archived: await archiveOldLogs() }));

router.get('/logs/:file', param('file').matches(/^access-\d{4}-\d{2}-\d{2}\.log\.gz$/), validate, async (req, res) => {
  res.type('text/plain').send(await readArchive(req.params.file));
});

module.exports = router;
