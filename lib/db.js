// Lightweight prototype DB: in-memory + JSON file persistence (PostgreSQL/PostGIS ki jagah, README me documented).
// Vercel jaise serverless pe file /tmp me jati hai — wahan data ephemeral hota hai.
import fs from 'node:fs';
import path from 'node:path';
import { buildSeed } from './seed.js';

const FILE = process.env.CIVIC_DB_PATH || (process.env.VERCEL ? '/tmp/civicsignal-db.json' : path.join(process.cwd(), 'data', 'db.json'));

export function persist(db = globalThis.__civicDb) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db));
  } catch { /* read-only filesystem: in-memory pe chalta rahega */ }
}

function load() {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { /* corrupt file: reseed */ }
  const db = buildSeed(new Date());
  persist(db);
  return db;
}

export function getDb() {
  if (!globalThis.__civicDb) globalThis.__civicDb = load();
  return globalThis.__civicDb;
}

export function resetDb(now = new Date()) {
  globalThis.__civicDb = buildSeed(now);
  persist(globalThis.__civicDb);
  return globalThis.__civicDb;
}
