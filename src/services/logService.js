// Unit I — fs module, callbacks, streams + zlib
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');

function todayFile() {
  return path.join(LOG_DIR, `access-${new Date().toISOString().slice(0, 10)}.log`);
}

// Classic Node callback style (error-first callback) — fs.appendFile
function writeLine(line, callback = () => {}) {
  fs.mkdir(LOG_DIR, { recursive: true }, (mkErr) => {
    if (mkErr) return callback(mkErr);
    fs.appendFile(todayFile(), line + '\n', 'utf8', callback);
  });
}

// Compress every log file older than today: read stream -> gzip -> write stream.
// Uses Promises + async/await on top of streams.
async function archiveOldLogs() {
  const files = await fs.promises.readdir(LOG_DIR).catch(() => []);
  const today = path.basename(todayFile());
  const archived = [];
  for (const file of files) {
    if (!file.endsWith('.log') || file === today) continue;
    const src = path.join(LOG_DIR, file);
    await pipeline(fs.createReadStream(src), zlib.createGzip(), fs.createWriteStream(src + '.gz'));
    await fs.promises.unlink(src);
    archived.push(file + '.gz');
  }
  return archived;
}

// Read a compressed archive back (decompress) — used by the admin API
async function readArchive(fileName) {
  const safe = path.basename(fileName); // block ../ path traversal
  const chunks = [];
  await pipeline(
    fs.createReadStream(path.join(LOG_DIR, safe)),
    zlib.createGunzip(),
    async function* (source) {
      for await (const chunk of source) chunks.push(chunk);
    }
  );
  return Buffer.concat(chunks).toString('utf8');
}

module.exports = { writeLine, archiveOldLogs, readArchive, LOG_DIR };
