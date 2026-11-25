// Central configuration — reads .env once (dotenv is a third-party module, Unit I)
const path = require('path');
// load smriti-sathi/.env no matter which folder the process was started from
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

// Render's private network gives "host:port" without http://
function withScheme(url) {
  return /^https?:\/\//.test(url) ? url : `http://${url}`;
}

const config = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/smriti_sathi',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret',
  jwtExpiresIn: '7d',
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-session',
  i18nServiceUrl: withScheme(process.env.I18N_SERVICE_URL || 'http://localhost:4001'),
  i18nPort: Number(process.env.I18N_PORT) || 4001,
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    embedModel: process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small',
    sttModel: process.env.OPENAI_STT_MODEL || 'whisper-1',
  },
  languages: ['en', 'hi', 'as', 'bn'],
};

config.isProd = config.env === 'production';
config.isTest = config.env === 'test';
module.exports = config;
