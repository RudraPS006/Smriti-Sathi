// Unit III — a custom middleware written from scratch.
// Measures how long each request took and writes one line to logs/access-<date>.log
const { writeLine } = require('../services/logService');
const config = require('../config');

function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const who = req.user ? `${req.user.role}#${req.user.id}` : 'guest';
    const line = `${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms ${who}`;
    if (!config.isTest) {
      writeLine(line, (err) => { if (err) console.error('[log] write failed', err.message); });
    }
  });
  next(); // hand over to the next middleware
}

module.exports = requestLogger;
