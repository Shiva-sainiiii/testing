// Engine tests: geographic clustering, time-window analysis, risk classification, duplicates
import test from 'node:test';
import assert from 'node:assert/strict';
import { haversine, offsetPoint } from '../lib/geo.js';
import { clusterComplaints, classifyRisk, analyze, markDuplicates } from '../lib/engine.js';
import { DEFAULT_CONFIG, BASE } from '../lib/constants.js';
import { buildSeed } from '../lib/seed.js';

const NOW = new Date('2026-11-24T10:00:00Z');
const H = 3600 * 1000;
let n = 0;
const mk = (category, p, hoursAgo, extra = {}) => ({
  id: `T-${++n}`, category, lat: p.lat, lng: p.lng,
  occurredAt: new Date(NOW.getTime() - hoursAgo * H).toISOString(), ...extra,
});

test('haversine: ~1000 m north offset', () => {
  const d = haversine(BASE, offsetPoint(BASE, 1000, 0));
  assert.ok(Math.abs(d - 1000) < 5, `got ${d}`);
});

test('geographic clustering: two far-apart groups -> two clusters', () => {
  const A = BASE, B = offsetPoint(BASE, 5000, 0);
  const items = [];
  for (let i = 0; i < 5; i++) items.push(mk('dirty_water', offsetPoint(A, i * 40, 0), 5));
  for (let i = 0; i < 4; i++) items.push(mk('dirty_water', offsetPoint(B, i * 40, 0), 5));
  const cl = clusterComplaints(items, 1000);
  assert.equal(cl.length, 2);
  assert.deepEqual(cl.map((c) => c.items.length).sort(), [4, 5]);
});

test('time window: old complaints are excluded from alert count', () => {
  const items = [];
  for (let i = 0; i < 4; i++) items.push(mk('dirty_water', offsetPoint(BASE, i * 100, 0), 5)); // andar
  for (let i = 0; i < 4; i++) items.push(mk('dirty_water', offsetPoint(BASE, i * 100 + 500, 0), 100)); // bahar
  const r = analyze(items, [], [], DEFAULT_CONFIG, NOW);
  assert.equal(r.alerts.length, 0, '4 in-window < min 6');
  items.push(mk('dirty_water', offsetPoint(BASE, 300, 300), 3), mk('low_pressure', offsetPoint(BASE, 200, 200), 3));
  const r2 = analyze(items, [], [], DEFAULT_CONFIG, NOW);
  assert.equal(r2.alerts.length, 1);
  assert.equal(r2.alerts[0].count, 6);
});

test('configurable rules: lowering minComplaints creates an alert', () => {
  const items = [];
  for (let i = 0; i < 3; i++) items.push(mk('sewage_overflow', offsetPoint(BASE, i * 80, 0), 4));
  assert.equal(analyze(items, [], [], DEFAULT_CONFIG, NOW).alerts.length, 0);
  assert.equal(analyze(items, [], [], { ...DEFAULT_CONFIG, minComplaints: 3 }, NOW).alerts.length, 1);
});

test('different category groups are not mixed', () => {
  const items = [];
  for (let i = 0; i < 3; i++) items.push(mk('dirty_water', offsetPoint(BASE, i * 80, 0), 4));
  for (let i = 0; i < 3; i++) items.push(mk('sewage_overflow', offsetPoint(BASE, i * 80 + 20, 10), 4));
  assert.equal(analyze(items, [], [], DEFAULT_CONFIG, NOW).alerts.length, 0);
});

test('near-duplicates are excluded from the count', () => {
  const items = [];
  for (let i = 0; i < 5; i++) items.push(mk('dirty_water', offsetPoint(BASE, i * 200, 0), 5 + i));
  items.push(mk('dirty_water', offsetPoint(items[0], 10, 10), 4.5)); // duplicate of items[0]
  assert.equal(markDuplicates(items, DEFAULT_CONFIG).size, 1);
  assert.equal(analyze(items, [], [], DEFAULT_CONFIG, NOW).alerts.length, 0, '5 unique < 6');
});

test('risk classification thresholds', () => {
  const t = DEFAULT_CONFIG.thresholds;
  assert.equal(classifyRisk(10, t), 'low');
  assert.equal(classifyRisk(35, t), 'moderate');
  assert.equal(classifyRisk(55, t), 'high');
  assert.equal(classifyRisk(75, t), 'critical');
  assert.equal(classifyRisk(100, t), 'critical');
});

test('maintenance nearby raises the experimental score and is explained', () => {
  const items = [];
  for (let i = 0; i < 6; i++) items.push(mk('dirty_water', offsetPoint(BASE, i * 60, 0), 3 + i));
  const asset = { id: 'PL-X', name: 'Test pipe', type: 'pipeline', lat: BASE.lat, lng: BASE.lng, status: 'operational', simulated: true };
  const maint = [{ id: 'MR-X', assetId: 'PL-X', type: 'maintenance', title: 'Repair', date: new Date(NOW.getTime() - 2 * 24 * H).toISOString() }];
  const a = analyze(items, [asset], [], DEFAULT_CONFIG, NOW).alerts[0];
  const b = analyze(items, [asset], maint, DEFAULT_CONFIG, NOW).alerts[0];
  assert.equal(b.score - a.score, DEFAULT_CONFIG.weights.maintenance);
  assert.ok(b.explanation.some((e) => e.includes('PL-X')));
  assert.ok(b.explanation.at(-1).includes('not proof'));
});

test('seed scenario: 2 detected incidents + undetected clusters (reproducible)', () => {
  const db = buildSeed(NOW);
  assert.ok(db.complaints.length >= 100 && db.complaints.length <= 200);
  assert.ok(db.assets.length >= 15 && db.assets.length <= 25);
  assert.ok(db.maintenance.length >= 10 && db.maintenance.length <= 15);
  assert.equal(db.incidents.length, 2);
  const shanti = db.incidents.find((i) => i.localityName === 'Shanti Colony');
  const model = db.incidents.find((i) => i.localityName === 'Model Town East');
  assert.equal(shanti.riskLevel, 'critical');
  assert.ok(shanti.categoryCounts.dirty_water >= 10 && shanti.categoryCounts.low_pressure >= 6);
  assert.ok(shanti.maintenance.length >= 1);
  assert.ok(model.categoryCounts.pipeline_leakage >= 7);
  const w = analyze(db.complaints, db.assets, db.maintenance, db.config, NOW).watch;
  assert.ok(w.some((x) => x.localityName === 'Green Park' && x.count === 5));
  assert.ok(w.some((x) => x.localityName === 'Industrial Sector 7' && x.count === 3));
  // same seed, same output
  const db2 = buildSeed(NOW);
  assert.deepEqual(db.complaints.map((c) => c.lat), db2.complaints.map((c) => c.lat));
});
