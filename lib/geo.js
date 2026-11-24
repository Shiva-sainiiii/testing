// Geo helpers — sab distance meters me hai
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Haversine distance (meters) do points ke beech
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Points ka simple average (chhote area ke liye accurate enough hai)
export function centroid(points) {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lng: points.reduce((s, p) => s + p.lng, 0) / n,
  };
}

// base point se north/east meters aage ka point
export function offsetPoint(base, northM, eastM) {
  return {
    lat: base.lat + northM / 111320,
    lng: base.lng + eastM / (111320 * Math.cos(rad(base.lat))),
  };
}

// center ke around random point (seeded rand function pass karo)
export function jitterPoint(rand, center, radiusM) {
  const r = radiusM * Math.sqrt(rand());
  const th = rand() * 2 * Math.PI;
  return offsetPoint(center, r * Math.cos(th), r * Math.sin(th));
}
