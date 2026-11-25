const { Schema, model } = require('mongoose');

// Family / care-team chat (Socket.IO). One room per patient.
const chatMessageSchema = new Schema(
  {
    patientId: { type: Number, required: true, index: true },
    senderId: { type: Number, required: true },
    senderName: String,
    senderRole: String,
    text: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true }
);

module.exports = model('ChatMessage', chatMessageSchema);
