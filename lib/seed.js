// Reproducible SIMULATED demo data (seeded PRNG). Sab kuch fictional hai — real complaints/infra nahi.
import { BASE, LOCALITIES, DEFAULT_CONFIG, MUNICIPALITY } from './constants.js';
import { jitterPoint, offsetPoint } from './geo.js';
import { hashPassword } from './auth.js';
import { runDetection } from './detection.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H = 3600 * 1000;
const D = 24 * H;
const pad = (n, w) => String(n).padStart(w, '0');

const TEXT = {
  dirty_water: ['Tap water is brown/yellowish since morning.', 'Water has a muddy colour and a strange smell.', 'Dirty water coming from the tap, cannot use for drinking.', 'Water looks cloudy with particles floating.'],
  low_pressure: ['Water pressure is very low, tank barely fills.', 'Only a trickle from the tap since last night.', 'Pressure dropped a lot compared to usual.'],
  no_supply: ['No water supply in our lane today.', 'Supply has not come since early morning.'],
  pipeline_leakage: ['Water leaking from the main pipe on the road.', 'Pipeline leak near the junction, water flowing on the street.', 'Visible leakage from a joint, road is wet.'],
  sewage_overflow: ['Sewage overflowing from the manhole.', 'Drain is blocked and dirty water is coming out on the road.'],
  waterlogging: ['Water has collected on the road and is not draining.', 'Waterlogging in front of the school gate.'],
};

export function buildSeed(now = new Date(), seedNum = 20260101) {
  const rand = mulberry32(seedNum);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const nowMs = now.getTime();
  const iso = (msAgo) => new Date(nowMs - msAgo).toISOString();
  const loc = Object.fromEntries(LOCALITIES.map((l) => [l.id, l]));
  const shanti = loc['shanti-colony'], model = loc['model-town'], green = loc['green-park'], indus = loc['industrial-7'], bazaar = loc['old-bazaar'];

  const db = {
    meta: { municipality: MUNICIPALITY, simulated: true, seededAt: now.toISOString(), seed: seedNum },
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    counters: { complaint: 0, incident: 0, maintenance: 0, inspection: 0, asset: 0 },
    users: [], complaints: [], assets: [], maintenance: [], incidents: [],
  };

  // ---- Users (demo credentials; sab simulated) ----
  const mkUser = (id, name, role, email, pw) => {
    const salt = `salt-${id}`;
    return { id, name, role, email, salt, passwordHash: hashPassword(pw, salt) };
  };
  db.users.push(
    mkUser('u-admin', 'Municipal Admin (demo)', 'admin', 'admin@civicsignal.demo', 'demo123'),
    mkUser('u-off1', 'Officer Meera Rao (demo)', 'field_officer', 'officer1@civicsignal.demo', 'demo123'),
    mkUser('u-off2', 'Officer Arjun Sen (demo)', 'field_officer', 'officer2@civicsignal.demo', 'demo123'),
  );

  // ---- Assets (20, simulated) ----
  const prefix = { pipeline: 'PL', pumping_station: 'PS', water_tank: 'WT', valve: 'VL', sewage_line: 'SL' };
  const addAsset = (type, name, base, n, e, status, lastMaintDaysAgo) => {
    const p = offsetPoint(base, n, e);
    const count = db.assets.filter((a) => a.type === type).length + 1;
    db.assets.push({
      id: `${prefix[type]}-${pad(count, 3)}`, type, name, lat: p.lat, lng: p.lng, status,
      lastMaintenanceAt: lastMaintDaysAgo == null ? null : iso(lastMaintDaysAgo * D), simulated: true,
    });
  };
  addAsset('pipeline', 'Shanti Colony feeder main (SIM)', shanti, 120, -80, 'operational', 2);
  addAsset('pipeline', 'Shanti distribution line B (SIM)', shanti, -250, 300, 'operational', 60);
  addAsset('pumping_station', 'Shanti booster pump (SIM)', shanti, 400, 200, 'operational', 35);
  addAsset('water_tank', 'Shanti overhead tank (SIM)', shanti, -350, -250, 'operational', 80);
  addAsset('valve', 'Shanti sector valve (SIM)', shanti, 50, 250, 'operational', 90);
  addAsset('pipeline', 'Model Town trunk main (SIM)', model, 80, 60, 'degraded', 120);
  addAsset('valve', 'Model Town junction valve (SIM)', model, -120, 150, 'under_repair', 3);
  addAsset('water_tank', 'Model Town ground tank (SIM)', model, 380, -200, 'operational', 50);
  addAsset('pumping_station', 'Model Town pump house (SIM)', model, -300, -350, 'operational', 45);
  addAsset('pipeline', 'Green Park service line (SIM)', green, 60, -90, 'operational', 20);
  addAsset('pumping_station', 'Green Park pump station (SIM)', green, 200, 150, 'operational', 1);
  addAsset('water_tank', 'Green Park overhead tank (SIM)', green, -300, 100, 'operational', 70);
  addAsset('valve', 'Green Park valve chamber (SIM)', green, -100, -200, 'operational', 100);
  addAsset('sewage_line', 'Industrial Sector 7 sewer trunk (SIM)', indus, 40, 30, 'degraded', 150);
  addAsset('sewage_line', 'Industrial Sector 7 branch sewer (SIM)', indus, -250, 200, 'operational', 95);
  addAsset('pumping_station', 'Industrial sewage lift station (SIM)', indus, 300, -150, 'operational', 28);
  addAsset('pipeline', 'Old Bazaar main (SIM)', bazaar, 20, 20, 'operational', 40);
  addAsset('valve', 'Old Bazaar valve (SIM)', bazaar, -200, 250, 'operational', 66);
  addAsset('sewage_line', 'Old Bazaar drain line (SIM)', bazaar, 150, -300, 'operational', 33);
  addAsset('water_tank', 'Old Bazaar storage tank (SIM)', bazaar, 350, 300, 'operational', 200);
  db.counters.asset = db.assets.length;

  // ---- Maintenance records (12, simulated) ----
  const addMaint = (assetId, type, title, desc, daysAgo) => {
    db.maintenance.push({
      id: `MR-${pad(++db.counters.maintenance, 3)}`, assetId, type, title, description: desc,
      date: iso(daysAgo * D), recordedBy: 'Seed (simulated)', simulated: true,
    });
  };
  addMaint('PL-001', 'maintenance', 'Pipeline repair', 'Joint replaced on feeder main; line re-pressurised (simulated record).', 2);
  addMaint('VL-002', 'breakdown', 'Valve breakdown reported', 'Junction valve stuck partially open; crew pending (simulated record).', 3);
  addMaint('PS-003', 'maintenance', 'Pump station servicing', 'Routine servicing and valve exercise (simulated record).', 1);
  addMaint('PS-001', 'maintenance', 'Booster pump overhaul', 'Bearing replaced (simulated record).', 35);
  addMaint('WT-001', 'maintenance', 'Tank cleaning', 'Annual cleaning (simulated record).', 80);
  addMaint('SL-001', 'maintenance', 'Sewer desilting', 'Desilting of trunk sewer (simulated record).', 150);
  addMaint('PL-002', 'maintenance', 'Leak patch', 'Minor leak patched (simulated record).', 60);
  addMaint('VL-001', 'maintenance', 'Valve greasing', 'Routine (simulated record).', 90);
  addMaint('PL-004', 'maintenance', 'Pipeline inspection', 'Visual inspection, no defects (simulated record).', 20);
  addMaint('PS-004', 'maintenance', 'Lift station check', 'Pump run test (simulated record).', 28);
  addMaint('PL-005', 'maintenance', 'Main flushing', 'Flushing carried out (simulated record).', 40);
  addMaint('SL-003', 'breakdown', 'Drain collapse (minor)', 'Minor collapse repaired (simulated record).', 33);

  // ---- Complaints ----
  const addComplaint = (category, p, hoursAgo, localityId, extra = {}) => {
    const t = iso(hoursAgo * H);
    db.complaints.push({
      id: `CS-${now.getUTCFullYear()}-${pad(++db.counters.complaint, 6)}`,
      category, description: pick(TEXT[category]), locality: localityId,
      lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6), occurredAt: t, createdAt: t,
      anonymous: rand() < 0.4, reporterName: null, image: null,
      duplicateOf: null, incidentId: null, source: 'seed', simulated: true, ...extra,
    });
  };

  // 1) Simulated DIRTY-WATER cluster: Shanti Colony (12 dirty + 7 low pressure, last ~44h)
  for (let i = 0; i < 12; i++) addComplaint('dirty_water', jitterPoint(rand, shanti, 550), 2 + rand() * 40, shanti.id);
  for (let i = 0; i < 7; i++) addComplaint('low_pressure', jitterPoint(rand, shanti, 550), 2 + rand() * 40, shanti.id);
  // near-duplicates (same category, ~15 m door, ~1h baad)
  for (let i = 0; i < 4; i++) {
    const src = db.complaints[i * 2];
    addComplaint(src.category, offsetPoint(src, rand() * 20 - 10, rand() * 20 - 10), Math.max(0.2, (nowMs - Date.parse(src.occurredAt)) / H - 1), shanti.id);
  }

  // 2) Simulated PIPELINE-LEAKAGE cluster: Model Town East (8 leakage + 2 low pressure, last ~28h)
  for (let i = 0; i < 8; i++) addComplaint('pipeline_leakage', jitterPoint(rand, model, 600), 1 + rand() * 20, model.id);
  for (let i = 0; i < 2; i++) addComplaint('low_pressure', jitterPoint(rand, model, 600), 1 + rand() * 20, model.id);
  // ek aur near-duplicate
  { const src = db.complaints.find((c) => c.category === 'pipeline_leakage' && c.locality === model.id); addComplaint('pipeline_leakage', offsetPoint(src, 8, -6), Math.max(0.2, (nowMs - Date.parse(src.occurredAt)) / H - 0.5), model.id); }

  // 3) PRE-THRESHOLD cluster: Green Park (5 complaints < min 6) — live demo me ek aur citizen complaint isse incident bana dega
  for (let i = 0; i < 4; i++) addComplaint('dirty_water', jitterPoint(rand, green, 350), 1 + rand() * 12, green.id);
  addComplaint('low_pressure', jitterPoint(rand, green, 350), 3 + rand() * 6, green.id);

  // 4) Undetected cluster: Industrial Sector 7 (3 sewage overflow) + 2 purane waterlogging
  for (let i = 0; i < 3; i++) addComplaint('sewage_overflow', jitterPoint(rand, indus, 300), 2 + rand() * 20, indus.id);
  for (let i = 0; i < 2; i++) addComplaint('waterlogging', jitterPoint(rand, indus, 300), 100 + rand() * 200, indus.id);

  // 5) Individual recent complaints (Old Bazaar, alag alag categories, scattered)
  addComplaint('no_supply', jitterPoint(rand, bazaar, 700), 5 + rand() * 30, bazaar.id);
  addComplaint('waterlogging', jitterPoint(rand, bazaar, 700), 5 + rand() * 30, bazaar.id);
  addComplaint('low_pressure', jitterPoint(rand, bazaar, 700), 5 + rand() * 30, bazaar.id);
  addComplaint('sewage_overflow', jitterPoint(rand, bazaar, 700), 5 + rand() * 30, bazaar.id);

  // 6) Background history (30 din) — baseline ke liye, last 60h ke baad
  const weights = ['dirty_water', 'low_pressure', 'low_pressure', 'no_supply', 'pipeline_leakage', 'sewage_overflow', 'waterlogging', 'waterlogging'];
  for (let i = 0; i < 80; i++) {
    const l = pick(LOCALITIES);
    addComplaint(pick(weights), jitterPoint(rand, l, 900), 60 + rand() * (30 * 24 - 60), l.id);
  }

  // Engine ko ek baar chalao: seed me do incidents ban jayenge (Shanti + Model Town)
  runDetection(db, now);
  return db;
}
