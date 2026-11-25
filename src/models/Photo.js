// Uploaded photos live in MongoDB (not on disk), so they survive restarts and
// redeploys on hosts with temporary disks such as Render's free plan.
const { Schema, model } = require('mongoose');

const photoSchema = new Schema(
  {
    patientId: { type: Number, required: true, index: true }, // whose care team may see it
    contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    uploadedBy: Number,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = model('Photo', photoSchema);
