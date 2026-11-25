// Unit IV — Mongoose schema + model
const { Schema, model } = require('mongoose');

const GAME_TYPES = ['memory-match', 'face-recall', 'sequence', 'word-picture'];

const gameSessionSchema = new Schema(
  {
    patientId: { type: Number, required: true, index: true }, // User.id from PostgreSQL
    gameType: { type: String, enum: GAME_TYPES, required: true },
    difficulty: { type: Number, min: 1, max: 5, required: true },
    score: { type: Number, required: true, min: 0 },
    maxScore: { type: Number, required: true, min: 1 },
    mistakes: { type: Number, default: 0 },
    durationSec: { type: Number, default: 0 },
    language: { type: String, default: 'en' },
    completedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

// Virtual field: accuracy is derived, never stored twice
gameSessionSchema.virtual('accuracy').get(function () {
  return this.maxScore ? this.score / this.maxScore : 0;
});
gameSessionSchema.set('toJSON', { virtuals: true });

module.exports = model('GameSession', gameSessionSchema);
module.exports.GAME_TYPES = GAME_TYPES;
