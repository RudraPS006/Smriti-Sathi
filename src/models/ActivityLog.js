// Everything the patient does, so the caregiver gets a complete activity report.
const { Schema, model } = require('mongoose');

const ACTIVITY_TYPES = ['login', 'game', 'reminder_done', 'journal', 'companion_chat', 'quiz', 'memory_viewed', 'family_viewed', 'sos'];

const activityLogSchema = new Schema(
  {
    patientId: { type: Number, required: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    summary: { type: String, required: true, maxlength: 300 },
    details: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ patientId: 1, createdAt: -1 });

module.exports = model('ActivityLog', activityLogSchema);
module.exports.ACTIVITY_TYPES = ACTIVITY_TYPES;
