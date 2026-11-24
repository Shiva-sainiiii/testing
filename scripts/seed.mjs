// `npm run seed` — fresh simulated database data/db.json me likhta hai
import fs from 'node:fs';
import path from 'node:path';
import { buildSeed } from '../lib/seed.js';

const file = process.env.CIVIC_DB_PATH || path.join(process.cwd(), 'data', 'db.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = buildSeed(new Date());
fs.writeFileSync(file, JSON.stringify(db));
console.log(`Seeded ${db.complaints.length} complaints, ${db.assets.length} assets, ${db.maintenance.length} maintenance records, ${db.incidents.length} incidents -> ${file}`);
