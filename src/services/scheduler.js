// Background jobs (setInterval). Runs inside the main process — fine for a single
// server; in a microservice design this would be its own worker service.
const { prisma } = require('../config/db');
const GameSession = require('../models/GameSession');
const bus = require('../events/bus');
const { createAlert, hasRecentOpenAlert } = require('./alertService');

const TZ = 'Asia/Kolkata';
const MISSED_AFTER_MIN = 15;

// "HH:MM" in India time, optionally shifted by minutes
function hhmm(date = new Date(), shiftMin = 0) {
  const d = new Date(date.getTime() + shiftMin * 60000);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}

function startOfTodayIST(now = new Date()) {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00+05:30`);
}

async function checkReminders(now = new Date()) {
  // 1) reminders due right now -> push to the patient's screen
  const due = await prisma.reminder.findMany({ where: { active: true, time: hhmm(now) } });
  due.forEach((r) => bus.emit(bus.EVENTS.REMINDER_DUE, r));

  // 2) reminders due 15 min ago and not marked done today -> alert the care team
  const late = await prisma.reminder.findMany({
    where: {
      active: true,
      time: hhmm(now, -MISSED_AFTER_MIN),
      OR: [{ lastDoneAt: null }, { lastDoneAt: { lt: startOfTodayIST(now) } }],
    },
  });
  for (const r of late) {
    await createAlert({ patientId: r.patientId, type: 'missed_reminder', severity: 'medium', message: `"${r.title}" (${r.time}) was not marked as done.` });
  }
}

async function checkInactivity(days = 3) {
  const patients = await prisma.user.findMany({ where: { role: 'patient' }, select: { id: true, name: true } });
  const since = new Date(Date.now() - days * 86400000);
  for (const p of patients) {
    const recent = await GameSession.exists({ patientId: p.id, completedAt: { gte: since } });
    if (!recent && !(await hasRecentOpenAlert(p.id, 'inactivity', 24))) {
      await createAlert({ patientId: p.id, type: 'inactivity', severity: 'low', message: `${p.name} has not played any memory activity in ${days} days.` });
    }
  }
}

let timers = [];
function startScheduler() {
  const safe = (fn) => () => fn().catch((e) => console.error('[scheduler]', e.message));
  timers.push(setInterval(safe(checkReminders), 60 * 1000));
  timers.push(setInterval(safe(checkInactivity), 60 * 60 * 1000));
  setTimeout(safe(checkInactivity), 10 * 1000);
}
function stopScheduler() { timers.forEach(clearInterval); timers = []; }

module.exports = { startScheduler, stopScheduler, checkReminders, checkInactivity, hhmm, startOfTodayIST };
