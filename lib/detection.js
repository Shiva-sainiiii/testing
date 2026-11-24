// Engine ke result ko incidents me convert karta hai (create / update, duplicate nahi banata)
import { analyze } from './engine.js';
import { haversine } from './geo.js';
import { CLOSED_STATUSES } from './constants.js';

const pad = (n, w) => String(n).padStart(w, '0');

export function runDetection(db, now = new Date()) {
  const res = analyze(db.complaints, db.assets, db.maintenance, db.config, now);
  const cfg = res.config;
  const created = [];
  const updated = [];
  const iso = now.toISOString();

  // engine ke hisaab se duplicates ko complaints pe mark karo
  const dupMap = new Map(res.duplicates.map((d) => [d.id, d.of]));
  for (const c of db.complaints) c.duplicateOf = dupMap.get(c.id) || null;

  for (const cand of res.alerts) {
    const open = db.incidents.find((i) => i.group === cand.group && !CLOSED_STATUSES.includes(i.status) && haversine(i.center, cand.center) <= cfg.radiusM);
    const apply = (inc) => {
      inc.center = cand.center; inc.radiusM = cand.radiusM; inc.localityId = cand.localityId; inc.localityName = cand.localityName;
      inc.count = cand.count; inc.complaintIds = cand.complaintIds; inc.categoryCounts = cand.categoryCounts;
      inc.score = cand.score; inc.scoreBreakdown = cand.scoreBreakdown; inc.riskLevel = cand.riskLevel;
      inc.explanation = cand.explanation; inc.nearbyAssets = cand.nearbyAssets; inc.maintenance = cand.maintenance;
      inc.recommendedAction = cand.recommendedAction; inc.baseline = cand.baseline; inc.updatedAt = iso;
    };

    if (open) {
      const changed = open.count !== cand.count || open.riskLevel !== cand.riskLevel;
      apply(open);
      if (changed) {
        open.history.push({ at: iso, by: 'system', action: 'auto_update', note: `Re-evaluated: ${cand.count} complaints, risk ${cand.riskLevel}.` });
        updated.push(open);
      }
      for (const c of cand.items) c.incidentId = open.id;
      continue;
    }

    // Recently closed incident ke complaints se naya incident mat banao (duplicate creation avoid)
    const cooldownMs = cfg.closedCooldownHours * 3600 * 1000;
    const closed = db.incidents.find((i) => i.group === cand.group && CLOSED_STATUSES.includes(i.status) &&
      haversine(i.center, cand.center) <= cfg.radiusM && now.getTime() - Date.parse(i.closedAt || i.updatedAt) < cooldownMs);
    if (closed) {
      const fresh = cand.complaintIds.filter((id) => !closed.complaintIds.includes(id));
      if (fresh.length < cfg.minComplaints) continue;
    }

    const inc = {
      id: `INC-${pad(++db.counters.incident, 4)}`,
      group: cand.group, title: cand.title, status: 'new', windowHours: cand.windowHours,
      detectedAt: iso, assignedTo: null, assignedName: null, assignedAt: null,
      inspections: [], verifiedAt: null, verifiedBy: null, closedAt: null, resolution: null, dismissal: null,
      history: [{ at: iso, by: 'system', action: 'detected', note: `Detection engine flagged ${cand.count} complaints (risk ${cand.riskLevel}). Needs human verification.` }],
    };
    apply(inc);
    for (const c of cand.items) c.incidentId = inc.id;
    db.incidents.push(inc);
    created.push(inc);
  }
  return { created, updated, watch: res.watch };
}
