'use client';
// Leaflet + OpenStreetMap. Client-only (dashboard me dynamic import, ssr:false).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORIES, ASSET_TYPES } from '@/lib/constants';

const LEVEL_COLOR = { low: '#22d3ee', moderate: '#f59e0b', high: '#f59e0b', critical: '#ef4444' }; // red sirf critical
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ASSET_LETTER = { pipeline: 'P', pumping_station: 'S', water_tank: 'T', valve: 'V', sewage_line: 'L' };

export default function MapView({
  center, zoom = 14, mode = 'view', complaints = [], assets = [], incidents = [], watch = [],
  layers = { complaints: true, density: true, assets: true, incidents: true, watch: true },
  selectedId = null, onSelectIncident, pick = null, onPick, className = '',
}) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const groupRef = useRef(null);
  const pickCb = useRef(onPick);
  const selCb = useRef(onSelectIncident);
  pickCb.current = onPick;
  selCb.current = onSelectIncident;

  useEffect(() => {
    const map = L.map(el.current, { center: [center.lat, center.lng], zoom, scrollWheelZoom: mode !== 'pick' });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap contributors',
    }).addTo(map);
    groupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    if (mode === 'pick') map.on('click', (e) => pickCb.current?.(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.invalidateSize(), 100);
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mapRef.current) mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom());
  }, [center.lat, center.lng]);

  useEffect(() => {
    const g = groupRef.current;
    if (!g) return;
    g.clearLayers();

    // Density: 300 m grid me complaints gino, zyada = zyada opaque
    if (layers.density) {
      const cells = new Map();
      for (const c of complaints) {
        if (c.duplicateOf) continue;
        const key = `${Math.round(c.lat / 0.0027)}:${Math.round(c.lng / 0.0031)}`;
        const cell = cells.get(key) || { n: 0, lat: 0, lng: 0 };
        cell.n++; cell.lat += c.lat; cell.lng += c.lng;
        cells.set(key, cell);
      }
      for (const cell of cells.values()) {
        if (cell.n < 2) continue;
        L.circle([cell.lat / cell.n, cell.lng / cell.n], {
          radius: 230, stroke: false, fillColor: '#f59e0b', fillOpacity: Math.min(0.55, 0.1 + cell.n * 0.05), interactive: false,
        }).addTo(g);
      }
    }

    if (layers.complaints) {
      for (const c of complaints) {
        const color = CATEGORIES[c.category]?.color || '#fff';
        L.circleMarker([c.lat, c.lng], {
          radius: 5, color, weight: 1.5, fillColor: color, fillOpacity: c.duplicateOf ? 0 : 0.75,
        }).bindPopup(`<b>${esc(c.id)}</b><br>${esc(CATEGORIES[c.category]?.label || c.category)}${c.duplicateOf ? ' (duplicate of ' + esc(c.duplicateOf) + ')' : ''}<br>${esc(c.description)}${c.simulated ? '<br><i>simulated</i>' : ''}`).addTo(g);
      }
    }

    if (layers.assets) {
      for (const a of assets) {
        const icon = L.divIcon({ className: '', html: `<div class="asset-pin ${a.status}">${ASSET_LETTER[a.type] || 'A'}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] });
        const last = a.lastMaintenanceAt ? new Date(a.lastMaintenanceAt).toLocaleDateString() : 'none recorded';
        L.marker([a.lat, a.lng], { icon }).bindPopup(`<b>${esc(a.id)}</b> · ${esc(ASSET_TYPES[a.type])}<br>${esc(a.name)}<br>Status: ${esc(a.status)}<br>Last maintenance: ${esc(last)}<br><i>SIMULATED asset record</i>`).addTo(g);
      }
    }

    if (layers.watch) {
      for (const w of watch) {
        L.circle([w.center.lat, w.center.lng], { radius: 320, color: '#94a3b8', weight: 1.5, dashArray: '5 6', fillOpacity: 0.04 })
          .bindPopup(`<b>Watching: ${esc(w.localityName)}</b><br>${w.count} complaints (alert at ${w.minComplaints})<br>${esc(w.note)}`).addTo(g);
      }
    }

    if (layers.incidents) {
      for (const i of incidents) {
        if (['dismissed', 'resolved'].includes(i.status)) continue;
        const color = LEVEL_COLOR[i.riskLevel];
        const circle = L.circle([i.center.lat, i.center.lng], {
          radius: Math.max(350, i.radiusM + 100), color, weight: i.id === selectedId ? 4 : 2, fillColor: color, fillOpacity: 0.12,
        }).bindTooltip(`${i.id} · ${i.riskLevel.toUpperCase()} · ${i.count} complaints`, { permanent: false });
        circle.on('click', () => selCb.current?.(i.id));
        circle.addTo(g);
      }
    }

    if (pick) L.marker([pick.lat, pick.lng]).addTo(g);
  }, [complaints, assets, incidents, watch, layers, selectedId, pick]);

  return <div ref={el} className={`map ${className}`} role="application" aria-label="Map" />;
}
