// Runs before every test file: point the app at separate TEST databases.
require('dotenv').config({ quiet: true });
process.env.NODE_ENV = 'test';
process.env.MONGO_URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/smriti_test';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else if (process.env.DATABASE_URL) process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, '/smriti_test$1');
process.env.OPENAI_API_KEY = ''; // tests always use AI mock mode
process.env.I18N_SERVICE_URL = 'http://127.0.0.1:1'; // force the fallback path
