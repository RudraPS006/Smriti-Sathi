// Unit II — "Implementing HTTP services in Node.js" WITHOUT Express.
// A tiny separate microservice that serves translation files.
// Shows: http.createServer, the request/response objects, manual routing,
// response headers, status codes, and CORS — everything Express hides.
//
//   GET /health            -> 200 {"status":"ok"}
//   GET /locales           -> 200 ["en","hi","as","bn"]
//   GET /locales/:lang     -> 200 {...strings}   (ETag + Cache-Control)
//   anything else          -> 404 / 405
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

// I18N_PORT locally (PORT is the main app's); on Render each service gets its own PORT
const PORT = Number(process.env.I18N_PORT || process.env.PORT) || 4001;
const DIR = path.join(__dirname, 'locales');

// Load once at start-up and cache in memory (fs + JSON)
const locales = {};
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const body = fs.readFileSync(path.join(DIR, file), 'utf8');
  JSON.parse(body); // fail fast on a broken file
  locales[path.basename(file, '.json')] = { body, etag: `"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"` };
}

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' });
    return res.end();
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, OPTIONS' });

  if (url.pathname === '/health') return send(res, 200, { status: 'ok', service: 'i18n', languages: Object.keys(locales) });
  if (url.pathname === '/locales') return send(res, 200, Object.keys(locales));

  const match = url.pathname.match(/^\/locales\/([a-z]{2})$/);
  if (match) {
    const loc = locales[match[1]];
    if (!loc) return send(res, 404, { error: `Language "${match[1]}" not available` });
    if (req.headers['if-none-match'] === loc.etag) {
      res.writeHead(304, { ETag: loc.etag });
      return res.end();
    }
    return send(res, 200, loc.body, { ETag: loc.etag, 'Cache-Control': 'public, max-age=300' });
  }

  send(res, 404, { error: 'Not found' });
});

if (require.main === module) {
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use — the i18n service is probably already running.\nStop the other copy, or start this one with I18N_PORT=4002 (and set I18N_SERVICE_URL to match).`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, () => console.log(`i18n-service listening on http://localhost:${PORT}`));
}
module.exports = server;
