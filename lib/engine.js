// Explainable rule-based detection engine.
// Koi black-box nahi: har alert ke saath uska score breakdown aur explanation aata hai.
// NOTE: score ek EXPERIMENTAL risk score hai — probability ya contamination ka proof nahi.
import { haversine, centroid } from './geo.js';
import { CATEGORIES, GROUPS, DEFAULT_CONFIG, ASSET_TYPES, nearestLocality } from './constants.js';

const H = 3600 * 1000;
const D = 24 * H;
const tm = (c) => Date.parse(c.occurredAt);
const byTime = (a, b) => (tm(a) - tm(b)) || a.id.localeCompare(b.id);

export function mergeConfig(cfgIn = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...cfgIn,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(cfgIn.thresholds || {}) },
    weights: { ...DEFAULT_CONFIG.weights, ...(cfgIn.weights || {}) },
  };
}

// Near-duplicate: same category + chhoti distance + chhota time gap
export function findDuplicate(existing, c, cfg) {
  const t = tm(c);
  const hit = existing.find(
    (k) => !k.duplicateOf && k.id !== c.id && k.category === c.category &&
      Math.abs(tm(k) - t) <= cfg.dedupeHours * H && haversine(k, c) <= cfg.dedupeRadiusM,
  );
  return hit ? hit.id : null;
}

// Poori list ke liye duplicates nikalta hai (pehla complaint "original" maana jata hai)
export function markDuplicates(list, cfgIn = {}) {
  const cfg = mergeConfig(cfgIn);
  const keepers = [];
  const dupOf = new Map();
  for (const c of [...list].sort(byTime)) {
    const t = tm(c);
    const match = keepers.find(
      (k) => k.category === c.category && Math.abs(tm(k) - t) <= cfg.dedupeHours * H && haversine(k, c) <= cfg.dedupeRadiusM,
    );
    if (match) dupOf.set(c.id, match.id);
    else keepers.push(c);
  }
  return dupOf;
}

// Greedy centroid clustering: complaint ko us cluster me daalo jiska centroid radius ke andar ho
export function clusterComplaints(items, radiusM) {
  const clusters = [];
  for (const c of [...items].sort(byTime)) {
    let best = null, bd = Infinity;
    for (const cl of clusters) {
      const d = haversine(cl.center, c);
      if (d <= radiusM && d < bd) { best = cl; bd = d; }
    }
    if (best) {
      best.items.push(c);
      best.center = centroid(best.items);
    } else {
      clusters.push({ items: [c], center: { lat: c.lat, lng: c.lng } });
    }
  }
  return clusters;
}

export function classifyRisk(score, thresholds = DEFAULT_CONFIG.thresholds) {
  if (score >= thresholds.critical) return 'critical';
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.moderate) return 'moderate';
  return 'low';
}

// Score = alag-alag signals ke points ka sum (cap 100). Har factor breakdown me dikhta hai.
export function scoreCluster(sig, cfg) {
  const w = cfg.weights;
  const bd = [];
  const add = (factor, points, detail) => bd.push({ factor, points, detail });

  add('Complaint volume',
    Math.round(w.volume * Math.min(1, sig.count / (cfg.minComplaints * 3))),
    `${sig.count} unique complaints (minimum ${cfg.minComplaints})`);
  add('Category similarity',
    sig.categories.length >= 2 ? w.diversity : 0,
    sig.categories.length >= 2 ? `${sig.categories.length} related categories reported together` : 'single category');
  add('Time concentration',
    sig.recentShare >= 0.6 ? w.concentration : 0,
    `${Math.round(sig.recentShare * 100)}% of complaints in the latest half of the window`);
  add('Recent maintenance / breakdown nearby',
    sig.maintenance.length ? w.maintenance : 0,
    sig.maintenance.length ? `${sig.maintenance.length} record(s) within ${cfg.radiusM} m in last ${cfg.maintenanceLookbackDays} d` : 'none found');
  add('Above historical baseline',
    sig.baselineRatio >= cfg.baselineMultiplier ? w.baseline : 0,
    `${sig.baselineRatio.toFixed(1)}x the usual volume (threshold ${cfg.baselineMultiplier}x)`);
  add('Health/hygiene-sensitive category',
    sig.categories.some((c) => c === 'dirty_water' || c === 'sewage_overflow') ? w.severity : 0,
    'dirty water or sewage overflow among complaints');

  const total = Math.min(100, bd.reduce((s, x) => s + x.points, 0));
  return { score: total, breakdown: bd };
}

function recommendAction(group, categoryCounts, maintenance) {
  const steps = [];
  if (categoryCounts.dirty_water) {
    steps.push('Send a field officer to inspect water at 2–3 affected points and collect samples for lab testing (e.g. turbidity, residual chlorine, microbiological). Do not issue a contamination advisory until verified.');
  }
  if (categoryCounts.pipeline_leakage) steps.push('Inspect the nearby pipeline segment for visible leaks and pressure loss; check valve positions.');
  if (categoryCounts.low_pressure || categoryCounts.no_supply) steps.push('Check pressure at the nearest pumping station / tank outlet and look for isolated valves.');
  if (categoryCounts.sewage_overflow || categoryCounts.waterlogging) steps.push('Inspect manholes and the sewage/drainage line for blockage or overflow.');
  if (maintenance.length) {
    const m = maintenance[0];
    steps.push(`Cross-check the recent work on ${m.assetId} (${m.title}) — confirm flushing, valve operations and restoration were completed properly.`);
  }
  if (group === 'water_supply' && !steps.length) steps.push('Verify on site and review pipeline records.');
  return steps.join(' ');
}

function buildAlert({ group, cluster, inGroup, dupMap, complaints, assets, maintenance, cfg, nowMs }) {
  const items = cluster.items;
  const center = cluster.center;
  const count = items.length;

  const categoryCounts = {};
  for (const c of items) categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  const categories = Object.keys(categoryCounts);

  const radiusUsed = Math.round(Math.max(...items.map((c) => haversine(center, c))));
  const halfAgo = nowMs - (cfg.windowHours * H) / 2;
  const recentShare = items.filter((c) => tm(c) >= halfAgo).length / count;

  // Nearby assets (is group ke relevant types)
  const assetTypes = GROUPS[group].assetTypes;
  const nearbyAssets = assets
    .filter((a) => assetTypes.includes(a.type))
    .map((a) => ({ id: a.id, name: a.name, type: a.type, status: a.status, distanceM: Math.round(haversine(center, a)), simulated: a.simulated !== false }))
    .filter((a) => a.distanceM <= cfg.radiusM)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 6);

  // Relevant maintenance / breakdown records
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const relMaint = maintenance
    .map((m) => {
      const a = assetById.get(m.assetId);
      if (!a || !assetTypes.includes(a.type)) return null;
      const distanceM = Math.round(haversine(center, a));
      const ageDays = (nowMs - Date.parse(m.date)) / D;
      if (distanceM > cfg.radiusM || ageDays < 0 || ageDays > cfg.maintenanceLookbackDays) return null;
      return { recordId: m.id, assetId: a.id, assetName: a.name, kind: m.type, title: m.title, date: m.date, ageDays: Math.round(ageDays * 10) / 10, distanceM };
    })
    .filter(Boolean)
    .sort((a, b) => a.ageDays - b.ageDays);

  // Historical baseline: pichhle baselineDays me same area ka average per-window volume
  const prevCount = inGroup.filter((c) => {
    const x = tm(c);
    return x < nowMs - cfg.windowHours * H && x >= nowMs - (cfg.windowHours + cfg.baselineDays * 24) * H && haversine(center, c) <= cfg.radiusM;
  }).length;
  const windows = (cfg.baselineDays * 24) / cfg.windowHours;
  const expected = prevCount / windows;
  const baselineRatio = count / Math.max(expected, 0.5);

  const { score, breakdown } = scoreCluster({ count, categories, recentShare, maintenance: relMaint, baselineRatio }, cfg);
  const riskLevel = classifyRisk(score, cfg.thresholds);

  const dupInArea = complaints.filter((c) => dupMap.has(c.id) && GROUPS[group] && CATEGORIES[c.category]?.group === group &&
    haversine(center, c) <= cfg.radiusM && tm(c) >= nowMs - cfg.windowHours * H).length;

  const loc = nearestLocality(center);
  const breakdownText = categories.map((k) => `${categoryCounts[k]} × ${CATEGORIES[k].label.toLowerCase()}`).join(', ');

  const explanation = [
    `${count} unique complaints (${breakdownText}) fall inside a ${radiusUsed} m spread around the cluster centre within the last ${cfg.windowHours} h` +
      (dupInArea ? ` (${dupInArea} near-duplicate report(s) excluded from the count).` : '.'),
    `${Math.round(recentShare * 100)}% of them arrived in the most recent ${cfg.windowHours / 2} h` + (recentShare >= 0.6 ? ' — a concentrated burst.' : '.'),
  ];
  if (categories.length >= 2) explanation.push(`Several related categories were reported together (${categories.map((k) => CATEGORIES[k].label).join(' + ')}). This is consistent with one shared cause but does not prove it.`);
  if (relMaint.length) {
    const m = relMaint[0];
    explanation.push(`${m.kind === 'breakdown' ? 'Breakdown report' : 'Maintenance record'} "${m.title}" on ${m.assetId} (${m.distanceM} m from the cluster) was logged ${m.ageDays} day(s) ago.`);
  }
  explanation.push(baselineRatio >= cfg.baselineMultiplier
    ? `Volume is ~${baselineRatio.toFixed(1)}x the usual level for this area (expected ≈ ${expected.toFixed(2)} per ${cfg.windowHours} h over the previous ${cfg.baselineDays} d).`
    : `Volume is close to the usual level for this area (${baselineRatio.toFixed(1)}x baseline).`);
  explanation.push('This is a risk signal for verification, not proof of contamination or failure.');

  return {
    group,
    title: `Potential ${GROUPS[group].label.toLowerCase()} incident — ${loc.name}`,
    center,
    radiusM: radiusUsed,
    localityId: loc.id,
    localityName: loc.name,
    count,
    complaintIds: items.map((c) => c.id),
    items,
    categoryCounts,
    score,
    scoreBreakdown: breakdown,
    riskLevel,
    explanation,
    nearbyAssets,
    maintenance: relMaint,
    recommendedAction: recommendAction(group, categoryCounts, relMaint),
    baseline: { expectedPerWindow: Math.round(expected * 100) / 100, ratio: Math.round(baselineRatio * 10) / 10 },
    windowHours: cfg.windowHours,
  };
}

// Main entry: complaints/assets/maintenance -> alerts (threshold cross) + watch (threshold se neeche clusters)
export function analyze(complaints, assets, maintenance, cfgIn = {}, now = new Date()) {
  const cfg = mergeConfig(cfgIn);
  const nowMs = now.getTime();
  const dupMap = markDuplicates(complaints, cfg);
  const clean = complaints.filter((c) => !dupMap.has(c.id));
  const alerts = [];
  const watch = [];

  for (const group of Object.keys(GROUPS)) {
    const inGroup = clean.filter((c) => CATEGORIES[c.category]?.group === group);
    const windowed = inGroup.filter((c) => {
      const x = tm(c);
      return x <= nowMs + 5 * 60000 && x >= nowMs - cfg.windowHours * H;
    });
    for (const cluster of clusterComplaints(windowed, cfg.radiusM)) {
      if (cluster.items.length >= cfg.minComplaints) {
        alerts.push(buildAlert({ group, cluster, inGroup, dupMap, complaints, assets, maintenance, cfg, nowMs }));
      } else if (cluster.items.length >= 2) {
        const categoryCounts = {};
        for (const c of cluster.items) categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
        watch.push({
          group, center: cluster.center, count: cluster.items.length, categoryCounts,
          complaintIds: cluster.items.map((c) => c.id), minComplaints: cfg.minComplaints,
          localityName: nearestLocality(cluster.center).name,
          note: `Below threshold (${cluster.items.length}/${cfg.minComplaints}) — not alerted, but being watched.`,
        });
      }
    }
  }
  alerts.sort((a, b) => b.score - a.score);
  return { alerts, watch, duplicates: [...dupMap.entries()].map(([id, of]) => ({ id, of })), config: cfg };
}

export { ASSET_TYPES };
