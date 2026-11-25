// Caregiver activity reports: everything the patient did in a period.
// Unit IV (aggregation pipelines), Unit I (streams + zlib for the CSV download)
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const { prisma } = require('../config/db');
const ActivityLog = require('../models/ActivityLog');
const JournalEntry = require('../models/JournalEntry');
const { summary: gameSummary } = require('./reportService');
const { startOfTodayIST } = require('./scheduler');

const TZ = 'Asia/Kolkata';
const since = (days) => new Date(Date.now() - days * 86400000);

async function activitySummary(patientId, days = 7) {
  const from = since(days);
  const match = { $match: { patientId, createdAt: { $gte: from } } };

  const [byType, daily, last, todayByType, moods, games, activeReminders, alerts] = await Promise.all([
    ActivityLog.aggregate([match, { $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ActivityLog.aggregate([
      match,
      { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, type: '$type' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.day', total: { $sum: '$count' }, types: { $push: { k: '$_id.type', v: '$count' } } } },
      { $project: { _id: 0, date: '$_id', total: 1, byType: { $arrayToObject: '$types' } } },
      { $sort: { date: 1 } },
    ]),
    ActivityLog.findOne({ patientId }).sort({ createdAt: -1 }).lean(),
    ActivityLog.aggregate([
      { $match: { patientId, createdAt: { $gte: startOfTodayIST() } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    JournalEntry.aggregate([
      { $match: { patientId, createdAt: { $gte: from }, mood: { $ne: '' } } },
      { $group: { _id: '$mood', count: { $sum: 1 } } },
    ]),
    gameSummary(patientId, days),
    prisma.reminder.count({ where: { patientId, active: true } }),
    prisma.alert.groupBy({ by: ['type'], where: { patientId, createdAt: { gte: from } }, _count: true }),
  ]);

  const counts = Object.fromEntries(byType.map((t) => [t._id, t.count]));
  const expected = activeReminders * days;
  return {
    days,
    from,
    lastActive: last?.createdAt || null,
    lastActivity: last?.summary || null,
    totals: { activities: byType.reduce((s, t) => s + t.count, 0), activeDays: daily.length },
    byType: counts,
    today: Object.fromEntries(todayByType.map((t) => [t._id, t.count])),
    daily,
    reminders: {
      active: activeReminders,
      done: counts.reminder_done || 0,
      expected,
      adherence: expected ? Math.min(1, (counts.reminder_done || 0) / expected) : null,
    },
    moods: Object.fromEntries(moods.map((m) => [m._id, m.count])),
    games: games.totals,
    alerts: Object.fromEntries(alerts.map((a) => [a.type, a._count])),
  };
}

async function timeline(patientId, { days = 7, type, skip = 0, limit = 20 } = {}) {
  const filter = { patientId, createdAt: { $gte: since(days) } };
  if (ActivityLog.ACTIVITY_TYPES.includes(type)) filter.type = type;
  const [items, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLog.countDocuments(filter),
  ]);
  return { items, total };
}

const cell = (v) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Mongo cursor -> CSV lines -> gzip -> HTTP response (memory stays flat for any size)
async function streamActivityCsv(patientId, days, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Disposition', `attachment; filename="patient-${patientId}-activity-${days}d.csv"`);
  let first = true;
  const toCsv = new Transform({
    writableObjectMode: true,
    transform(doc, _enc, done) {
      const header = first ? '﻿date_time_ist,activity,summary\n' : ''; // BOM so Excel shows ৰ, ह correctly
      first = false;
      const when = new Date(doc.createdAt).toLocaleString('en-IN', { timeZone: TZ, hour12: false });
      done(null, `${header}${[when, doc.type, doc.summary].map(cell).join(',')}\n`);
    },
    flush(done) { done(null, first ? '﻿date_time_ist,activity,summary\n' : ''); },
  });
  const cursor = ActivityLog.find({ patientId, createdAt: { $gte: since(days) } }).sort({ createdAt: 1 }).lean().cursor();
  await pipeline(cursor, toCsv, zlib.createGzip(), res);
}

module.exports = { activitySummary, timeline, streamActivityCsv };
