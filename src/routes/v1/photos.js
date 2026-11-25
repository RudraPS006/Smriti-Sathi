// GET /api/v1/photos/:id — only the patient and their care team may view a photo.
const express = require('express');
const { param } = require('express-validator');
const Photo = require('../../models/Photo');
const validate = require('../../middleware/validate');
const HttpError = require('../../middleware/httpError');
const { requireAuth, canAccessPatient } = require('../../middleware/auth');

const router = express.Router();

router.get('/:id', requireAuth, param('id').isMongoId(), validate, async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (!photo || !(await canAccessPatient(req.user, photo.patientId))) throw new HttpError(404, 'Photo not found');
  const etag = `"${photo._id}"`; // a photo never changes; a new upload gets a new id
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.set({ 'Content-Type': photo.contentType, 'Cache-Control': 'private, max-age=86400', ETag: etag });
  res.send(photo.data);
});

module.exports = router;
