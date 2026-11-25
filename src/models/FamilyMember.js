// Family members attached to a patient by the caregiver (or imported from a CSV/JSON file).
// Used by the "Family faces" game, the patient's "My family" page and the AI companion.
const { Schema, model } = require('mongoose');

const familyMemberSchema = new Schema(
  {
    patientId: { type: Number, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    relation: { type: String, required: true, trim: true, maxlength: 40 },
    photoUrl: { type: String, default: '' },
    phone: { type: String, default: '', maxlength: 20 },
    city: { type: String, default: '', maxlength: 60 },
    birthYear: { type: Number, min: 1900, max: 2100 },
    notes: { type: String, default: '', maxlength: 500 }, // "Calls every Sunday", "Lives next door"
    isEmergencyContact: { type: Boolean, default: false },
    createdBy: { type: Number },
  },
  { timestamps: true }
);

familyMemberSchema.index({ patientId: 1, name: 1 }, { unique: true }); // no duplicate names per patient

module.exports = model('FamilyMember', familyMemberSchema);
