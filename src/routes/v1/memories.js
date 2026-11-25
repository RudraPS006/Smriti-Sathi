// Unit IV — full CRUD on a Mongoose model, with pagination and file upload.
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { body, param } = require('express-validator');
const Memory = require('../../models/Memory');
const bus = require('../../events/bus');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, requireRole, requirePatientAccess } = require('../../middleware/auth');
const { searchMemories } = require('../../services/aiService');
const { paginate, pageResult } = require('./helpers');
const { record } = require('../../services/activityService');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    cb(ok ? null : new HttpError(415, 'Only JPG, PNG or WEBP photos are allowed'), ok);
  },
});

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const memoryRules = [
  body('title').trim().isLength({ min: 2, max: 120 }).withMessage('Title must be 2–120 characters'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('place').optional().trim().isLength({ max: 80 }),
  body('year').optional({ values: 'falsy' }).isInt({ min: 1900, max: new Date().getFullYear() }).toInt(),
  // multipart forms send arrays as JSON strings
  body('people').optional().customSanitizer((v) => (typeof v === 'string' ? safeJson(v, []) : v)).isArray({ max: 10 }),
  body('tags').optional().customSanitizer((v) => (typeof v === 'string' ? v.split(',').map((t) => t.trim()).filter(Boolean) : v)).isArray({ max: 10 }),
];

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

function removePhoto(url) {
  if (url && url.startsWith('/uploads/')) fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

// LIST (paginated)  GET /api/v1/memories/:patientId?page=1&limit=6
router.get('/:patientId', requirePatientAccess(), async (req, res) => {
  const pg = paginate(req, 6);
  const filter = { patientId: req.patientId };
  const [items, total] = await Promise.all([
    Memory.find(filter).sort({ year: -1, createdAt: -1 }).skip(pg.skip).limit(pg.limit),
    Memory.countDocuments(filter),
  ]);
  res.json(pageResult(items, total, pg));
});

// SEMANTIC SEARCH  GET /api/v1/memories/:patientId/search?q=tea garden
router.get('/:patientId/search', requirePatientAccess(), async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) throw new HttpError(400, 'Type at least 2 letters to search');
  res.json({ query: q, results: await searchMemories(req.patientId, q, 5) });
});

// The patient opened a memory -> goes into the caregiver's activity report
router.post('/:patientId/:id/viewed', requirePatientAccess(), requireRole('patient'), param('id').isMongoId(), validate, async (req, res) => {
  const memory = await Memory.findOne({ _id: req.params.id, patientId: req.patientId }).select('title');
  if (!memory) throw new HttpError(404, 'Memory not found');
  record(req.patientId, 'memory_viewed', `Looked at the memory "${memory.title}"`, { memoryId: memory._id });
  res.status(204).end();
});

// CREATE (caregivers add memories; the patient may too)
router.post('/:patientId', requirePatientAccess(), requireRole('caregiver', 'patient', 'admin'), upload.single('photo'), memoryRules, validate, async (req, res) => {
  const memory = await Memory.create({
    ...pick(req.body),
    patientId: req.patientId,
    photoUrl: req.file ? `/uploads/${req.file.filename}` : '',
    createdBy: req.user.id,
  });
  bus.emit(bus.EVENTS.MEMORY_ADDED, memory);
  res.status(201).json({ memory });
});

// UPDATE
router.put('/:patientId/:id', requirePatientAccess(), requireRole('caregiver', 'patient', 'admin'), param('id').isMongoId(), upload.single('photo'), memoryRules, validate, async (req, res) => {
  const memory = await Memory.findOne({ _id: req.params.id, patientId: req.patientId });
  if (!memory) throw new HttpError(404, 'Memory not found');
  Object.assign(memory, pick(req.body));
  if (req.file) {
    removePhoto(memory.photoUrl);
    memory.photoUrl = `/uploads/${req.file.filename}`;
  }
  memory.embedding = undefined; // text changed -> recompute
  await memory.save();
  bus.emit(bus.EVENTS.MEMORY_ADDED, memory);
  res.json({ memory });
});

// DELETE
router.delete('/:patientId/:id', requirePatientAccess(), requireRole('caregiver', 'admin'), param('id').isMongoId(), validate, async (req, res) => {
  const memory = await Memory.findOneAndDelete({ _id: req.params.id, patientId: req.patientId });
  if (!memory) throw new HttpError(404, 'Memory not found');
  removePhoto(memory.photoUrl);
  res.status(204).end();
});

function pick(b) {
  const out = {};
  for (const k of ['title', 'description', 'place', 'year', 'people', 'tags']) if (b[k] !== undefined) out[k] = b[k];
  if (Array.isArray(out.people)) out.people = out.people.filter((p) => p && p.name).map((p) => ({ name: String(p.name).slice(0, 60), relation: String(p.relation || '').slice(0, 40) }));
  return out;
}

module.exports = router;
