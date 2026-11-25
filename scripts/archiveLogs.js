// npm run logs:archive — compress old log files with gzip (Unit I: fs + stream + zlib)
const { archiveOldLogs } = require('../src/services/logService');

archiveOldLogs()
  .then((files) => console.log(files.length ? `Compressed: ${files.join(', ')}` : 'No old logs to compress.'))
  .catch((e) => { console.error(e.message); process.exit(1); });
