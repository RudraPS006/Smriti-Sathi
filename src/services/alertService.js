// Creates an alert in PostgreSQL, then announces it on the event bus.
// The Socket.IO layer listens and pushes it live to the care team.
const { prisma } = require('../config/db');
const bus = require('../events/bus');

async function createAlert({ patientId, type, severity = 'medium', message }) {
  const alert = await prisma.alert.create({ data: { patientId, type, severity, message } });
  bus.emit(bus.EVENTS.ALERT_CREATED, alert);
  return alert;
}

// Avoid flooding caregivers: has a similar open alert been raised recently?
async function hasRecentOpenAlert(patientId, type, hours = 24) {
  const since = new Date(Date.now() - hours * 3600 * 1000);
  const found = await prisma.alert.findFirst({
    where: { patientId, type, acknowledged: false, createdAt: { gte: since } },
  });
  return Boolean(found);
}

module.exports = { createAlert, hasRecentOpenAlert };
