// Load the demo data into the LIVE databases (e.g. MongoDB Atlas + Render PostgreSQL)
// from your own computer. Render's free plan has no shell, so seeding runs here.
//
//   1. Create a file named .env.remote (it is git-ignored) with:
//        MONGO_URI=<Atlas connection string>
//        DATABASE_URL=<Render PostgreSQL "External Database URL">
//   2. npm run seed:remote -- --yes
//
// WARNING: this deletes everything in those databases first.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const file = path.join(__dirname, '..', '.env.remote');
if (!fs.existsSync(file)) {
  console.error('Missing .env.remote — see the instructions at the top of scripts/seed-remote.js');
  process.exit(1);
}
require('dotenv').config({ path: file, override: true, quiet: true });
for (const key of ['MONGO_URI', 'DATABASE_URL']) {
  if (!process.env[key]) { console.error(`.env.remote has no ${key}`); process.exit(1); }
}

// Show where it will write, without printing passwords
const host = (url) => { try { return new URL(url).host; } catch { return '(unreadable URL)'; } };
console.log(`MongoDB:    ${host(process.env.MONGO_URI)}`);
console.log(`PostgreSQL: ${host(process.env.DATABASE_URL)}`);
if (!process.argv.includes('--yes')) {
  console.log('\nThis REPLACES all data in both databases with the demo data.');
  console.log('Run again with:  npm run seed:remote -- --yes');
  process.exit(0);
}

process.env.NODE_ENV = 'development'; // seed.js refuses to run with NODE_ENV=production
console.log('\nCreating PostgreSQL tables…');
execSync('npx prisma db push --skip-generate', { stdio: 'inherit', env: process.env, cwd: path.join(__dirname, '..') });
require('./seed');
