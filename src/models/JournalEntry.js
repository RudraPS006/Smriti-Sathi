const { Schema, model } = require('mongoose');

// Voice journal — the patient speaks, speech is turned into text and saved.
const journalEntrySchema = new Schema(
  {
    patientId: { type: Number, required: true, index: true },
    text: { type: String, required: true, maxlength: 4000 },
    language: { type: String, default: 'en' },
    mood: { type: String, enum: ['happy', 'okay', 'sad', 'confused', ''], default: '' },
  },
  { timestamps: true }
);

module.exports = model('JournalEntry', journalEntrySchema);
