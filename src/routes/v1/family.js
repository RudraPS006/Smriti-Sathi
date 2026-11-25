// Family members of a patient — add one at a time (with photo) or import a CSV / JSON file.
// Unit IV (Mongoose CRUD), Unit II (express-validator), Unit I (fs + JSON + parsing a file buffer)
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { body, param } = require('express-validator');
const FamilyMember = require('../../models/FamilyMember');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, requireRole, requirePatientAccess } = require('../../middleware/auth');
const { record } = require('../../services/activityService');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
const TEMPLATE = path.join(__dirname, '..', '..', '..', 'public', 'sample-data', 'family-template.csv');

const photoUpload = multer({
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
const dataUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 512 * 1024 } });

const router = express.Router();
router.use(requireAuth);

const memberRules = [
  body('name').trim().isLength({ min: 1, max: 60 }).withMessage('Name is required (max 60 characters)'),
  body('relation').trim().isLength({ min: 1, max: 40 }).withMessage('Relation is required, e.g. son, daughter, sister'),
  body('phone').optional({ values: 'falsy' }).trim().matches(/^[+0-9 ()-]{6,20}$/).withMessage('Phone can contain digits, spaces, + and -'),
  body('city').optional().trim().isLength({ max: 60 }),
  body('birthYear').optional({ values: 'falsy' }).isInt({ min: 1900, max: new Date().getFullYear() }).toInt(),
  body('notes').optional().trim().isLength({ max: 500 }),
  body('isEmergencyContact').optional().isBoolean().toBoolean(),
];

// Only our own image paths are allowed (the page's security policy blocks outside images anyway)
const safePhoto = (url) => (typeof url === 'string' && /^\/(uploads|seed-avatars)\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(url) ? url : '');

function removePhoto(url) {
  if (url && url.startsWith('/uploads/')) fs.unlink(path.join(UPLOAD_DIR, path.basename(url)), () => {});
}

function pick(b) {
  const out = {};
  for (const k of ['name', 'relation', 'phone', 'city', 'birthYear', 'notes', 'isEmergencyContact']) if (b[k] !== undefined) out[k] = b[k];
  return out;
}

// Template for the import feature
router.get('/template.csv', (req, res) => {
  res.download(TEMPLATE, 'family-template.csv');
});

// LIST
router.get('/:patientId', requirePatientAccess(), async (req, res) => {
  const members = await FamilyMember.find({ patientId: req.patientId }).sort({ isEmergencyContact: -1, name: 1 });
  if (req.user.role === 'patient' && req.query.viewed === 'true') {
    record(req.patientId, 'family_viewed', `Looked at the family page (${members.length} people)`);
  }
  res.json({ members });
});

// CREATE
router.post('/:patientId', requirePatientAccess(), requireRole('caregiver', 'admin'), photoUpload.single('photo'), memberRules, validate, async (req, res) => {
  const member = await FamilyMember.create({
    ...pick(req.body),
    patientId: req.patientId,
    photoUrl: req.file ? `/uploads/${req.file.filename}` : '',
    createdBy: req.user.id,
  }).catch((e) => {
    if (req.file) removePhoto(`/uploads/${req.file.filename}`);
    if (e.code === 11000) throw new HttpError(409, `${req.body.name} is already in the family list`);
    throw e;
  });
  res.status(201).json({ member });
});

// UPDATE
router.put('/:patientId/:id', requirePatientAccess(), requireRole('caregiver', 'admin'), param('id').isMongoId(), photoUpload.single('photo'), memberRules, validate, async (req, res) => {
  const member = await FamilyMember.findOne({ _id: req.params.id, patientId: req.patientId });
  if (!member) throw new HttpError(404, 'Family member not found');
  Object.assign(member, pick(req.body));
  if (req.file) {
    removePhoto(member.photoUrl);
    member.photoUrl = `/uploads/${req.file.filename}`;
  }
  await member.save();
  res.json({ member });
});

// DELETE
router.delete('/:patientId/:id', requirePatientAccess(), requireRole('caregiver', 'admin'), param('id').isMongoId(), validate, async (req, res) => {
  const member = await FamilyMember.findOneAndDelete({ _id: req.params.id, patientId: req.patientId });
  if (!member) throw new HttpError(404, 'Family member not found');
  removePhoto(member.photoUrl);
  res.status(204).end();
});

/* ------------------------------ Import ------------------------------- */

// Small CSV parser: handles quoted fields, commas and line breaks inside quotes, "" escapes
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().replace(/^﻿/, '')); // strip Excel's BOM
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Accept friendly header names: "Birth Year", "birth_year", "Emergency contact" ...
const KEY_MAP = { name: 'name', relation: 'relation', relationship: 'relation', phone: 'phone', mobile: 'phone', city: 'city', town: 'city', birthyear: 'birthYear', notes: 'notes', note: 'notes', isemergencycontact: 'isEmergencyContact', emergencycontact: 'isEmergencyContact', emergency: 'isEmergencyContact', photourl: 'photoUrl', photo: 'photoUrl' };

function cleanRow(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const key = KEY_MAP[String(k).toLowerCase().replace(/[^a-z]/g, '')];
    if (key) out[key] = typeof v === 'string' ? v.trim() : v;
  }
  const errors = [];
  if (!out.name || String(out.name).length > 60) errors.push('name is missing or too long');
  if (!out.relation || String(out.relation).length > 40) errors.push('relation is missing or too long');
  if (out.phone && !/^[+0-9 ()-]{6,20}$/.test(out.phone)) errors.push('phone is not valid');
  if (out.birthYear !== undefined && out.birthYear !== '') {
    const y = Number(out.birthYear);
    if (!Number.isInteger(y) || y < 1900 || y > new Date().getFullYear()) errors.push('birthYear is not valid');
    else out.birthYear = y;
  } else delete out.birthYear;
  out.isEmergencyContact = ['true', 'yes', 'y', '1', true].includes(typeof out.isEmergencyContact === 'string' ? out.isEmergencyContact.toLowerCase() : out.isEmergencyContact);
  out.photoUrl = safePhoto(out.photoUrl);
  out.notes = String(out.notes || '').slice(0, 500);
  out.city = String(out.city || '').slice(0, 60);
  return { member: out, errors };
}

// POST /api/v1/family/:patientId/import   (multipart field "file": .csv or .json)
router.post('/:patientId/import', requirePatientAccess(), requireRole('caregiver', 'admin'), dataUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose a .csv or .json file to import');
  const text = req.file.buffer.toString('utf8');
  const isJson = /\.json$/i.test(req.file.originalname) || req.file.mimetype === 'application/json';

  let rows;
  try {
    if (isJson) {
      const parsed = JSON.parse(text);
      rows = Array.isArray(parsed) ? parsed : parsed.family || parsed.members;
      if (!Array.isArray(rows)) throw new Error('JSON must be a list, or {"family": [...]}');
    } else {
      rows = parseCsv(text);
    }
  } catch (e) {
    throw new HttpError(422, `Could not read the file: ${e.message}`);
  }
  if (rows.length > 200) throw new HttpError(413, 'At most 200 family members per file');

  let created = 0;
  let updated = 0;
  const skipped = [];
  for (const [i, raw] of rows.entries()) {
    const { member, errors } = cleanRow(raw);
    const rowNo = isJson ? i + 1 : i + 2; // CSV row 1 is the header
    if (errors.length) { skipped.push({ row: rowNo, name: member.name || '', reason: errors.join(', ') }); continue; }
    // Same name again = update that person instead of creating a duplicate
    const set = { ...member };
    if (!set.photoUrl) delete set.photoUrl; // keep an existing photo when the file has none
    const r = await FamilyMember.updateOne(
      { patientId: req.patientId, name: member.name },
      { $set: set, $setOnInsert: { createdBy: req.user.id } },
      { upsert: true }
    );
    if (r.upsertedCount) created++; else updated++;
  }
  res.status(created ? 201 : 200).json({ created, updated, skipped, total: rows.length });
});

module.exports = router;
module.exports.parseCsv = parseCsv;
module.exports.cleanRow = cleanRow;
