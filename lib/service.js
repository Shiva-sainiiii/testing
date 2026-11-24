// Saari business logic yahan hai (routes patle rakhe hain). db pehla argument hai taaki tests easy rahein.
import {
  CATEGORIES, ASSET_TYPES, ASSET_STATUSES, LOCALITIES, BASE, OPEN_STATUSES, CLOSED_STATUSES, nearestLocality,
} from './constants.js';
import { haversine } from './geo.js';
import { findDuplicate, mergeConfig, analyze } from './engine.js';
import { runDetection } from './detection.js';
import { verifyPassword } from './auth.js';

export class ServiceError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new ServiceError(400, m);
const forbidden = (m = 'Not allowed for your role') => new ServiceError(403, m);
const notFound = (m = 'Not found') => new ServiceError(404, m);
const pad = (n, w) => String(n).padStart(w, '0');
const isClosed = (inc) => CLOSED_STATUSES.includes(inc.status);
const MAX_IMG = 450000; // chars (client pehle resize kar deta hai)
const FINDINGS = ['leak_found', 'discoloration_observed', 'low_pressure_confirmed', 'no_abnormality', 'inconclusive'];

function checkImage(img) {
  if (img == null || img === '') return null;
  if (typeof img !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(img)) throw bad('Image must be a JPEG/PNG/WebP data URL');
  if (img.length > MAX_IMG) throw bad('Image is too large (max ~330 KB after resize)');
  return img;
}
const num = (v, name, min, max) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} must be a number between ${min} and ${max}`);
  return n;
};
const str = (v, name, min, max) => {
  const s = String(v ?? '').trim();
  if (s.length < min || s.length > max) throw bad(`${name} must be ${min}–${max} characters`);
  return s;
};
function need(actor, ...roles) {
  if (!actor) throw new ServiceError(401, 'Login required');
  if (roles.length && !roles.includes(actor.role)) throw forbidden();
  return actor;
}
const who = (u) => ({ id: u.id, name: u.name, role: u.role });
const publicComplaint = (c) => { const { image, ...rest } = c; return { ...rest, hasImage: !!image }; };

// ---------- Auth ----------
export function login(db, email, password) {
  const u = db.users.find((x) => x.email.toLowerCase() === String(email || '').toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u)) throw new ServiceError(401, 'Invalid email or password');
  return u;
}

// ---------- Complaints ----------
export function createComplaint(db, input, now = new Date()) {
  const category = String(input.category || '');
  if (!CATEGORIES[category]) throw bad('Please choose a valid complaint category');
  const description = str(input.description, 'Description', 10, 1000);
  const lat = Number(input.lat), lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw bad('Please pin the location on the map');
  if (haversine({ lat, lng }, BASE) > 15000) throw bad('Location is outside the demo municipality area');
  const locality = LOCALITIES.some((l) => l.id === input.locality) ? input.locality : nearestLocality({ lat, lng }).id;

  let occurred = now;
  if (input.occurredAt) {
    const d = new Date(input.occurredAt);
    if (Number.isNaN(d.getTime())) throw bad('Invalid date/time');
    if (d.getTime() > now.getTime() + 5 * 60000) throw bad('Date/time cannot be in the future');
    if (d.getTime() < now.getTime() - 30 * 86400000) throw bad('Date/time cannot be older than 30 days');
    occurred = d;
  }
  const anonymous = !!input.anonymous;
  const c = {
    id: `CS-${now.getUTCFullYear()}-${pad(++db.counters.complaint, 6)}`,
    category, description, locality,
    lat: +lat.toFixed(6), lng: +lng.toFixed(6),
    occurredAt: occurred.toISOString(), createdAt: now.toISOString(),
    anonymous, reporterName: anonymous ? null : (String(input.reporterName || '').trim().slice(0, 80) || null),
    image: checkImage(input.image), duplicateOf: null, incidentId: null, source: 'citizen', simulated: false,
  };
  c.duplicateOf = findDuplicate(db.complaints, c, mergeConfig(db.config));
  db.complaints.push(c);
  const det = runDetection(db, now); // submit hote hi engine chalta hai
  return {
    id: c.id, receivedAt: c.createdAt, category: CATEGORIES[category].label, possibleDuplicate: !!c.duplicateOf,
    message: 'Thank you. Your complaint has been received and added to the municipal dashboard.',
    demo: { incidentsCreated: det.created.map((i) => i.id) }, // sirf demo ke liye dikhate hain
  };
}

export function listComplaints(db, actor) {
  need(actor, 'admin', 'field_officer');
  return db.complaints.map(publicComplaint);
}
export function getComplaintImage(db, actor, id) {
  need(actor, 'admin', 'field_officer');
  const c = db.complaints.find((x) => x.id === id);
  if (!c || !c.image) throw notFound('No image');
  return c.image;
}

// ---------- Assets & maintenance ----------
export function listAssets(db, actor) { need(actor, 'admin', 'field_officer'); return db.assets; }
export function listMaintenance(db, actor) { need(actor, 'admin', 'field_officer'); return [...db.maintenance].sort((a, b) => b.date.localeCompare(a.date)); }

export function addAsset(db, input, actor, now = new Date()) {
  need(actor, 'admin');
  const type = String(input.type || '');
  if (!ASSET_TYPES[type]) throw bad('Invalid asset type');
  const status = input.status || 'operational';
  if (!ASSET_STATUSES.includes(status)) throw bad('Invalid status');
  const lat = num(input.lat, 'Latitude', -90, 90), lng = num(input.lng, 'Longitude', -180, 180);
  if (haversine({ lat, lng }, BASE) > 15000) throw bad('Location is outside the demo municipality area');
  const prefix = { pipeline: 'PL', pumping_station: 'PS', water_tank: 'WT', valve: 'VL', sewage_line: 'SL' }[type];
  let n = db.assets.filter((a) => a.type === type).length + 1;
  while (db.assets.some((a) => a.id === `${prefix}-${pad(n, 3)}`)) n++;
  const asset = {
    id: `${prefix}-${pad(n, 3)}`, type, name: str(input.name, 'Name', 3, 120), lat, lng, status,
    lastMaintenanceAt: input.lastMaintenanceAt ? new Date(input.lastMaintenanceAt).toISOString() : null, simulated: true,
  };
  db.assets.push(asset);
  runDetection(db, now);
  return asset;
}

export function addMaintenance(db, input, actor, now = new Date()) {
  need(actor, 'admin', 'field_officer');
  const asset = db.assets.find((a) => a.id === input.assetId);
  if (!asset) throw bad('Unknown asset');
  const type = input.type === 'breakdown' ? 'breakdown' : input.type === 'maintenance' ? 'maintenance' : null;
  if (!type) throw bad('Type must be maintenance or breakdown');
  const when = input.date ? new Date(input.date) : now;
  if (Number.isNaN(when.getTime()) || when.getTime() > now.getTime() + 5 * 60000) throw bad('Invalid or future date');
  const rec = {
    id: `MR-${pad(++db.counters.maintenance, 3)}`, assetId: asset.id, type,
    title: str(input.title, 'Title', 3, 120), description: String(input.description || '').trim().slice(0, 1000),
    date: when.toISOString(), recordedBy: actor.name, simulated: true,
  };
  db.maintenance.push(rec);
  if (type === 'maintenance') {
    if (!asset.lastMaintenanceAt || Date.parse(asset.lastMaintenanceAt) < when.getTime()) asset.lastMaintenanceAt = rec.date;
  }
  const newStatus = input.newStatus || (type === 'breakdown' ? 'under_repair' : null);
  if (newStatus) {
    if (!ASSET_STATUSES.includes(newStatus)) throw bad('Invalid status');
    asset.status = newStatus;
  }
  runDetection(db, now); // naya maintenance record risk signal badal sakta hai
  return rec;
}

// ---------- Incidents ----------
const stripEvidence = (inc) => ({ ...inc, inspections: inc.inspections.map(({ evidence, ...r }) => ({ ...r, hasEvidence: !!evidence })) });

export function listIncidents(db, actor) {
  need(actor, 'admin', 'field_officer');
  const list = actor.role === 'field_officer' ? db.incidents.filter((i) => i.assignedTo === actor.id) : db.incidents;
  return [...list].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).map(stripEvidence);
}

export function getWatch(db, actor, now = new Date()) {
  need(actor, 'admin');
  return analyze(db.complaints, db.assets, db.maintenance, db.config, now).watch;
}

function getInc(db, id) {
  const inc = db.incidents.find((i) => i.id === id);
  if (!inc) throw notFound('Incident not found');
  return inc;
}

export function getIncident(db, id, actor) {
  need(actor, 'admin', 'field_officer');
  const inc = getInc(db, id);
  if (actor.role === 'field_officer' && inc.assignedTo !== actor.id) throw forbidden('This incident is not assigned to you');
  const set = new Set(inc.complaintIds);
  return { ...inc, complaints: db.complaints.filter((c) => set.has(c.id)).map(publicComplaint).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) };
}

function log(inc, actor, action, note, now) {
  inc.history.push({ at: now.toISOString(), by: who(actor), action, note: note || '' });
  inc.updatedAt = now.toISOString();
}

export function assignIncident(db, id, officerId, actor, now = new Date()) {
  need(actor, 'admin');
  const inc = getInc(db, id);
  if (isClosed(inc)) throw bad('Incident is already closed');
  const off = db.users.find((u) => u.id === officerId && u.role === 'field_officer');
  if (!off) throw bad('Please choose a valid field officer');
  inc.assignedTo = off.id; inc.assignedName = off.name;
  if (!inc.assignedAt) inc.assignedAt = now.toISOString(); // pehla assignment = response time
  if (inc.status === 'new') inc.status = 'assigned';
  log(inc, actor, 'assigned', `Assigned to ${off.name}`, now);
  return stripEvidence(inc);
}

export function addInspection(db, id, input, actor, now = new Date()) {
  need(actor, 'field_officer');
  const inc = getInc(db, id);
  if (inc.assignedTo !== actor.id) throw forbidden('This incident is not assigned to you');
  if (isClosed(inc)) throw bad('Incident is already closed');
  const finding = String(input.finding || '');
  if (!FINDINGS.includes(finding)) throw bad('Please choose a finding');
  const ws = input.waterSample || {};
  const sample = {};
  if (ws.turbidityNTU !== '' && ws.turbidityNTU != null) sample.turbidityNTU = num(ws.turbidityNTU, 'Turbidity (NTU)', 0, 10000);
  if (ws.chlorineMgL !== '' && ws.chlorineMgL != null) sample.chlorineMgL = num(ws.chlorineMgL, 'Residual chlorine (mg/L)', 0, 50);
  if (ws.ph !== '' && ws.ph != null) sample.ph = num(ws.ph, 'pH', 0, 14);
  if (ws.notes) sample.notes = String(ws.notes).trim().slice(0, 500);
  const ins = {
    id: `INS-${pad(++db.counters.inspection, 3)}`, at: now.toISOString(), officerId: actor.id, officerName: actor.name,
    observations: str(input.observations, 'Observations', 10, 2000), finding,
    waterSample: Object.keys(sample).length ? sample : null, evidence: checkImage(input.evidence), simulated: true,
  };
  inc.inspections.push(ins);
  if (inc.status === 'assigned') inc.status = 'under_investigation';
  log(inc, actor, 'inspection', `Site inspection ${ins.id}: ${finding.replace(/_/g, ' ')}`, now);
  return stripEvidence(inc);
}

// Verify sirf assigned field officer kar sakta hai (inspection ke baad). Dismiss: officer ya admin.
export function decideIncident(db, id, input, actor, now = new Date()) {
  need(actor, 'admin', 'field_officer');
  const inc = getInc(db, id);
  if (isClosed(inc)) throw bad('Incident is already closed');
  const decision = input.decision;
  const note = String(input.note || '').trim();
  if (decision === 'verified') {
    if (actor.role !== 'field_officer') throw forbidden('Only an authorised field officer can verify an incident');
    if (inc.assignedTo !== actor.id) throw forbidden('This incident is not assigned to you');
    if (inc.status !== 'under_investigation' || !inc.inspections.length) throw bad('Submit a site inspection before verifying');
    inc.status = 'verified'; inc.verifiedAt = now.toISOString(); inc.verifiedBy = who(actor);
    log(inc, actor, 'verified', note || 'Verified after site inspection', now);
  } else if (decision === 'dismissed') {
    if (actor.role === 'field_officer') {
      if (inc.assignedTo !== actor.id) throw forbidden('This incident is not assigned to you');
      if (inc.status !== 'under_investigation') throw bad('Submit a site inspection before dismissing');
    }
    if (inc.status === 'verified') throw bad('A verified incident must be resolved, not dismissed');
    if (note.length < 5) throw bad('Please add a short reason for dismissal');
    inc.status = 'dismissed'; inc.closedAt = now.toISOString(); inc.dismissal = { by: who(actor), note, at: now.toISOString() };
    log(inc, actor, 'dismissed', note, now);
  } else throw bad('Decision must be verified or dismissed');
  return stripEvidence(inc);
}

export function resolveIncident(db, id, input, actor, now = new Date()) {
  need(actor, 'admin');
  const inc = getInc(db, id);
  if (inc.status !== 'verified') throw bad('Only verified incidents can be resolved');
  const text = str(input.resolution, 'Resolution', 10, 1000);
  inc.status = 'resolved'; inc.closedAt = now.toISOString();
  inc.resolution = { by: who(actor), note: text, at: now.toISOString() };
  log(inc, actor, 'resolved', text, now);
  return stripEvidence(inc);
}

// ---------- Config ----------
export function getConfig(db, actor) { need(actor, 'admin'); return mergeConfig(db.config); }
export function updateConfig(db, patch, actor, now = new Date()) {
  need(actor, 'admin');
  const c = { ...mergeConfig(db.config), thresholds: { ...mergeConfig(db.config).thresholds } };
  if (patch.minComplaints != null) c.minComplaints = Math.round(num(patch.minComplaints, 'Minimum complaints', 2, 100));
  if (patch.windowHours != null) c.windowHours = Math.round(num(patch.windowHours, 'Time window (hours)', 1, 336));
  if (patch.radiusM != null) c.radiusM = Math.round(num(patch.radiusM, 'Radius (m)', 100, 10000));
  if (patch.maintenanceLookbackDays != null) c.maintenanceLookbackDays = Math.round(num(patch.maintenanceLookbackDays, 'Maintenance lookback (days)', 1, 90));
  if (patch.baselineDays != null) c.baselineDays = Math.round(num(patch.baselineDays, 'Baseline period (days)', 3, 90));
  if (patch.baselineMultiplier != null) c.baselineMultiplier = num(patch.baselineMultiplier, 'Baseline multiplier', 1, 20);
  if (patch.thresholds) {
    for (const k of ['moderate', 'high', 'critical']) if (patch.thresholds[k] != null) c.thresholds[k] = num(patch.thresholds[k], `Threshold ${k}`, 1, 100);
  }
  if (!(c.thresholds.moderate < c.thresholds.high && c.thresholds.high < c.thresholds.critical)) throw bad('Thresholds must satisfy moderate < high < critical');
  db.config = c;
  runDetection(db, now);
  return c;
}

// ---------- Stats ----------
export function getStats(db, actor) {
  need(actor, 'admin', 'field_officer');
  const incs = db.incidents;
  const active = incs.filter((i) => OPEN_STATUSES.includes(i.status));
  const responded = incs.filter((i) => i.assignedAt);
  const avgResponseMinutes = responded.length
    ? Math.round(responded.reduce((s, i) => s + (Date.parse(i.assignedAt) - Date.parse(i.detectedAt)), 0) / responded.length / 60000) : null;
  const resolved = incs.filter((i) => i.status === 'resolved');
  const avgResolutionHours = resolved.length
    ? Math.round((resolved.reduce((s, i) => s + (Date.parse(i.closedAt) - Date.parse(i.detectedAt)), 0) / resolved.length / 3600000) * 10) / 10 : null;
  const assetStatus = {};
  for (const a of db.assets) assetStatus[a.status] = (assetStatus[a.status] || 0) + 1;
  const overdue = db.assets.filter((a) => !a.lastMaintenanceAt || Date.now() - Date.parse(a.lastMaintenanceAt) > 90 * 86400000).length;
  return {
    totalComplaints: db.complaints.length,
    duplicateComplaints: db.complaints.filter((c) => c.duplicateOf).length,
    activeIncidents: active.length,
    highRiskAlerts: active.filter((i) => i.riskLevel === 'high' || i.riskLevel === 'critical').length,
    verifiedIncidents: incs.filter((i) => i.verifiedAt).length,
    dismissedIncidents: incs.filter((i) => i.status === 'dismissed').length,
    resolvedIncidents: resolved.length,
    avgResponseMinutes, avgResolutionHours,
    assets: { total: db.assets.length, byStatus: assetStatus, maintenanceOverdue: overdue },
    municipality: db.meta.municipality, simulated: true,
  };
}

export function listOfficers(db, actor) {
  need(actor, 'admin');
  return db.users.filter((u) => u.role === 'field_officer').map(who);
}
