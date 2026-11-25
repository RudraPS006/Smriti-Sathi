// A "living memory" — a family photo or story the caregiver adds.
// Used by the face-recall game, the memory gallery, and AI semantic search (embeddings).
const { Schema, model } = require('mongoose');

const memorySchema = new Schema(
  {
    patientId: { type: Number, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    people: [{ name: String, relation: String }],
    place: { type: String, default: '' },
    year: { type: Number },
    photoUrl: { type: String, default: '' },
    tags: [String],
    embedding: { type: [Number], select: false }, // hidden unless explicitly requested
    createdBy: { type: Number }, // User.id of caregiver
  },
  { timestamps: true }
);

memorySchema.index({ title: 'text', description: 'text', place: 'text' });

module.exports = model('Memory', memorySchema);
