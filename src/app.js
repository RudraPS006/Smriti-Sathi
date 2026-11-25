// The Express application (kept separate from server.js so tests can import it
// without opening a port — Supertest drives it directly).
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const config = require('./config');
const requestLogger = require('./middleware/requestLogger');
const { errorHandler, apiNotFound } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1); // behind Render's proxy in production

// ---- Security headers (Unit III) ----
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        // Force HTTPS only in production. On http://localhost this would make
        // browsers like Brave rewrite every request to https:// and fail.
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    // HSTS ("always use HTTPS for this host") — production only, same reason
    strictTransportSecurity: config.isProd,
    crossOriginEmbedderPolicy: false,
  })
);

// ---- Built-in + third-party middleware via app.use() (Unit III) ----
app.use(express.json({ limit: '100kb' })); // parses JSON bodies (replaces body-parser)
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // fills req.cookies
// Sessions are kept in MongoDB, so a game in progress survives a server restart
// (Render's free servers sleep when idle). Tests use the default in-memory store.
const { MongoStore } = require('connect-mongo');
const sessionStore = config.isTest ? undefined : MongoStore.create({ mongoUrl: config.mongoUri, collectionName: 'sessions', ttl: 2 * 60 * 60 });
const sessionMiddleware = session({
  store: sessionStore,
  name: 'smriti.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 2 * 60 * 60 * 1000 },
});
app.use(sessionMiddleware);
app.use(requestLogger); // our own middleware

// ---- Static frontend ----
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    maxAge: config.isProd ? '1h' : 0,
    // in development always re-check, so edited ES modules are never stale
    setHeaders: (res) => { if (!config.isProd) res.setHeader('Cache-Control', 'no-cache'); },
  })
);

// ---- Versioned API (Unit VI) ----
app.use('/api/v1', require('./routes/v1'));
app.use('/api/v2', require('./routes/v2'));

// ---- app.all(): any method on an unknown /api path -> JSON 404 (Unit III) ----
app.all('/api/{*splat}', apiNotFound);

// ---- Single-page app: every other GET returns index.html ----
app.get(/^\/(?!uploads\/|socket\.io\/).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use(errorHandler);

module.exports = { app, sessionMiddleware };
