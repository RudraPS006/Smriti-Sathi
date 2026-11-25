// Shared photo handling for memories and family members.
const multer = require('multer');
const mongoose = require('mongoose');
const Photo = require('../models/Photo');
const HttpError = require('../middleware/httpError');

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PREFIX = '/api/v1/photos/';

// Keep the file in memory just long enough to save it to MongoDB (max 3 MB)
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = TYPES.includes(file.mimetype);
    cb(ok ? null : new HttpError(415, 'Only JPG, PNG or WEBP photos are allowed'), ok);
  },
});

async function savePhoto(file, patientId, uploadedBy) {
  const photo = await Photo.create({ patientId, contentType: file.mimetype, size: file.size, data: file.buffer, uploadedBy });
  return PREFIX + photo._id;
}

function photoIdFrom(url) {
  if (typeof url !== 'string' || !url.startsWith(PREFIX)) return null;
  const id = url.slice(PREFIX.length);
  return mongoose.isValidObjectId(id) ? id : null;
}

// Delete a stored photo when its memory / family member is removed or replaced
async function removePhoto(url) {
  const id = photoIdFrom(url);
  if (id) await Photo.deleteOne({ _id: id }).catch(() => {});
}

module.exports = { photoUpload, savePhoto, removePhoto, photoIdFrom, PREFIX };
