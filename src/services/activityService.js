// Records patient activity and announces it on the event bus,
// so the caregiver's dashboard updates live (see src/sockets).
const ActivityLog = require('../models/ActivityLog');
const bus = require('../events/bus');

async function record(patientId, type, summary, details = {}) {
  try {
    const entry = await ActivityLog.create({ patientId, type, summary: String(summary).slice(0, 300), details });
    bus.emit(bus.EVENTS.ACTIVITY_LOGGED, entry.toObject());
    return entry;
  } catch (e) {
    // Logging must never break the patient's action itself
    console.error('[activity] could not record:', e.message);
    return null;
  }
}

module.exports = { record };
