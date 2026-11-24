// Saare constants ek jagah: categories, localities, default config
import { haversine, offsetPoint } from './geo.js';

export const CATEGORIES = {
  dirty_water:      { label: 'Dirty water',        group: 'water_supply',    color: '#22d3ee' },
  low_pressure:     { label: 'Low water pressure', group: 'water_supply',    color: '#60a5fa' },
  no_supply:        { label: 'No water supply',    group: 'water_supply',    color: '#a78bfa' },
  pipeline_leakage: { label: 'Pipeline leakage',   group: 'water_supply',    color: '#fbbf24' },
  sewage_overflow:  { label: 'Sewage overflow',    group: 'sewage_drainage', color: '#94a3b8' },
  waterlogging:     { label: 'Waterlogging',       group: 'sewage_drainage', color: '#2dd4bf' },
};

// Category groups: engine inhi groups ke andar cluster banata hai
export const GROUPS = {
  water_supply:    { label: 'Water supply network', assetTypes: ['pipeline', 'pumping_station', 'water_tank', 'valve'] },
  sewage_drainage: { label: 'Sewage & drainage',    assetTypes: ['sewage_line', 'pumping_station'] },
};

export const ASSET_TYPES = {
  pipeline: 'Water pipeline',
  pumping_station: 'Pumping station',
  water_tank: 'Water tank',
  valve: 'Valve',
  sewage_line: 'Sewage line',
};
export const ASSET_STATUSES = ['operational', 'degraded', 'under_repair', 'offline'];

// FICTIONAL municipality — coordinates sirf demo ke liye hain, real infra nahi
export const MUNICIPALITY = 'Demonagar Municipal Council (SIMULATED)';
export const BASE = { lat: 29.3909, lng: 76.9635 };

export const LOCALITIES = [
  { id: 'shanti-colony', name: 'Shanti Colony',       ...offsetPoint(BASE, 0, 0) },
  { id: 'model-town',    name: 'Model Town East',     ...offsetPoint(BASE, 2200, 1800) },
  { id: 'green-park',    name: 'Green Park',          ...offsetPoint(BASE, -2300, 1500) },
  { id: 'industrial-7',  name: 'Industrial Sector 7', ...offsetPoint(BASE, -1800, -2400) },
  { id: 'old-bazaar',    name: 'Old Bazaar',          ...offsetPoint(BASE, 1600, -2000) },
];

export function nearestLocality(p) {
  let best = null, bd = Infinity;
  for (const l of LOCALITIES) {
    const d = haversine(p, l);
    if (d < bd) { bd = d; best = l; }
  }
  return bd <= 3000 ? best : { id: 'other', name: 'Other' };
}

// Rules configurable hain (dashboard > Detection settings)
export const DEFAULT_CONFIG = {
  minComplaints: 6,            // cluster me kam se kam itne unique complaints
  windowHours: 48,             // time window
  radiusM: 1000,               // geographic radius
  maintenanceLookbackDays: 7,  // itne din purana maintenance/breakdown relevant maana jayega
  baselineDays: 14,            // historical baseline period
  baselineMultiplier: 2,       // baseline se kitna zyada ho to signal
  dedupeRadiusM: 50,           // near-duplicate: same category + itni distance
  dedupeHours: 6,              //   ... aur itne ghante ke andar
  closedCooldownHours: 72,
  thresholds: { moderate: 35, high: 55, critical: 75 }, // EXPERIMENTAL score cut-offs
  weights: { volume: 35, diversity: 10, concentration: 10, maintenance: 15, baseline: 15, severity: 5 },
};

export const OPEN_STATUSES = ['new', 'assigned', 'under_investigation', 'verified'];
export const CLOSED_STATUSES = ['dismissed', 'resolved'];
