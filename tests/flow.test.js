// End-to-end demo flow (service layer): citizen -> engine -> assign -> inspect -> verify -> resolve -> stats
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed } from '../lib/seed.js';
import * as svc from '../lib/service.js';
import { LOCALITIES } from '../lib/constants.js';

const NOW = new Date('2026-11-24T10:00:00Z');
const at = (min) => new Date(NOW.getTime() + min * 60000);

test('full demo scenario + role checks + no duplicate incidents', () => {
  const db = buildSeed(NOW);
  const admin = db.users.find((u) => u.role === 'admin');
  const off1 = db.users.find((u) => u.id === 'u-off1');
  const off2 = db.users.find((u) => u.id === 'u-off2');
  const green = LOCALITIES.find((l) => l.id === 'green-park');
  const before = svc.getStats(db, admin);
  assert.equal(before.activeIncidents, 2);
  assert.equal(before.verifiedIncidents, 0);

  // STEP 1-4: citizen complaint (6th unique near Green Park) -> naya incident
  const ack = svc.createComplaint(db, { category: 'dirty_water', description: 'Brown water coming from the tap since morning.', lat: green.lat + 0.0005, lng: green.lng - 0.0004, locality: 'green-park', anonymous: true }, at(1));
  assert.match(ack.id, /^CS-2026-\d{6}$/);
  assert.equal(ack.demo.incidentsCreated.length, 1);
  const inc = db.incidents.find((i) => i.id === ack.demo.incidentsCreated[0]);
  assert.equal(inc.localityName, 'Green Park');
  assert.equal(inc.status, 'new');
  assert.ok(inc.explanation.length >= 4);

  // duplicate incident nahi banna chahiye (same complaint cluster phir se run)
  const again = svc.updateConfig(db, {}, admin, at(2));
  assert.equal(db.incidents.filter((i) => i.localityName === 'Green Park').length, 1);

  // STEP 6: assign (sirf admin)
  assert.throws(() => svc.assignIncident(db, inc.id, off1.id, off1, at(3)), /not allowed/i);
  svc.assignIncident(db, inc.id, off1.id, admin, at(10));
  assert.equal(db.incidents.find((i) => i.id === inc.id).status, 'assigned');

  // verify bina inspection ke nahi; admin verify nahi kar sakta; doosra officer nahi kar sakta
  assert.throws(() => svc.decideIncident(db, inc.id, { decision: 'verified' }, admin, at(11)), /Only an authorised field officer/);
  assert.throws(() => svc.decideIncident(db, inc.id, { decision: 'verified' }, off1, at(11)), /inspection/i);
  assert.throws(() => svc.addInspection(db, inc.id, { observations: 'x'.repeat(20), finding: 'leak_found' }, off2, at(12)), /not assigned/i);

  // STEP 7: inspection (water sample + validation)
  assert.throws(() => svc.addInspection(db, inc.id, { observations: 'short', finding: 'leak_found' }, off1, at(20)));
  svc.addInspection(db, inc.id, { observations: 'Brown discolouration at 3 taps; valve chamber found partially open.', finding: 'discoloration_observed', waterSample: { turbidityNTU: 12.5, chlorineMgL: 0.1, ph: 7.2 } }, off1, at(60));
  assert.equal(db.incidents.find((i) => i.id === inc.id).status, 'under_investigation');

  // STEP 8: verify (officer) -> resolve (admin)
  svc.decideIncident(db, inc.id, { decision: 'verified', note: 'Confirmed on site' }, off1, at(70));
  assert.equal(db.incidents.find((i) => i.id === inc.id).status, 'verified');
  assert.throws(() => svc.resolveIncident(db, inc.id, { resolution: 'short' }, admin, at(80)));
  svc.resolveIncident(db, inc.id, { resolution: 'Valve chamber closed, mains flushed and chlorine restored.' }, admin, at(120));

  // STEP 9: stats update
  const after = svc.getStats(db, admin);
  assert.equal(after.verifiedIncidents, 1);
  assert.equal(after.resolvedIncidents, 1);
  assert.equal(after.avgResponseMinutes, 9); // detect at +1 min, assign at +10
  assert.equal(after.activeIncidents, 2);
  const final = db.incidents.find((i) => i.id === inc.id);
  assert.ok(final.history.length >= 5);

  // closed incident ke complaints se phir naya incident nahi banna chahiye (cooldown)
  svc.createComplaint(db, { category: 'dirty_water', description: 'Another brown water report nearby.', lat: green.lat, lng: green.lng, locality: 'green-park' }, at(130));
  assert.equal(db.incidents.filter((i) => i.localityName === 'Green Park').length, 1);

  // officer sirf apne incidents dekhta hai
  assert.equal(svc.listIncidents(db, off2).length, 0);
});

test('dismiss flow needs a reason; input validation', () => {
  const db = buildSeed(NOW);
  const admin = db.users.find((u) => u.role === 'admin');
  const id = db.incidents[0].id;
  assert.throws(() => svc.decideIncident(db, id, { decision: 'dismissed', note: '' }, admin, at(1)), /reason/);
  svc.decideIncident(db, id, { decision: 'dismissed', note: 'Planned flushing, verified by phone' }, admin, at(2));
  assert.equal(db.incidents.find((i) => i.id === id).status, 'dismissed');
  assert.throws(() => svc.createComplaint(db, { category: 'nope', description: 'valid length description', lat: 1, lng: 1 }, at(3)), /category/i);
  assert.throws(() => svc.createComplaint(db, { category: 'dirty_water', description: 'short', lat: 29.39, lng: 76.96 }, at(3)), /Description/);
  assert.throws(() => svc.createComplaint(db, { category: 'dirty_water', description: 'long enough description', lat: 10, lng: 10 }, at(3)), /outside/);
  assert.throws(() => svc.login(db, 'admin@civicsignal.demo', 'wrong'), /Invalid/);
  assert.equal(svc.login(db, 'admin@civicsignal.demo', 'demo123').role, 'admin');
});
