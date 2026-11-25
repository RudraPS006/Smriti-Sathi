// Creates / syncs the PostgreSQL test database schema before the API tests.
require('./setupEnv');
const { execSync } = require('child_process');

execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit', env: process.env });
