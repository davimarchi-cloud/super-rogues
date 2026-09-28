// Loads .env.local (DATABASE_URL, ADMIN_KEY) for the tools that talk to the production database.
const fs = require('fs'), path = require('path');
const f = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.DATABASE_URL) { console.error('No DATABASE_URL: run `vercel env pull .env.local` (see CLAUDE.md).'); process.exit(2); }
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
module.exports = { q: (text, params = []) => sql.query(text, params), SCHEMA: require('../api/_store').SCHEMA };
