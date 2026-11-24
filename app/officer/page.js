'use client';
// Field officer workspace: sirf apne assigned incidents
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import IncidentPanel from '@/components/IncidentPanel';
import Registry from '@/components/Registry';
import { SimBanner, ErrorBox, RiskBadge, StatusBadge } from '@/components/ui';
import { api, fmtDate } from '@/lib/client';
import { BASE } from '@/lib/constants';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });

export default function Officer() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [assets, setAssets] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, a, m] = await Promise.all([api('/api/incidents'), api('/api/assets'), api('/api/maintenance')]);
      setIncidents(i.incidents); setAssets(a.assets); setMaintenance(m.maintenance); setErr('');
    } catch (e) { if (e.status === 401) router.replace('/login'); else setErr(e.message); }
  }, [router]);

  useEffect(() => {
    api('/api/me').then((r) => {
      if (r.user.role !== 'field_officer') return router.replace('/dashboard');
      setMe(r.user); load();
    }).catch(() => router.replace('/login'));
  }, [router, load]);
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  if (!me) return <><Header /><main className="wrap"><p className="muted">Loading…</p></main></>;
  const center = sel ? incidents.find((i) => i.id === sel)?.center || BASE : incidents[0]?.center || BASE;

  return (
    <>
      <Header user={me} />
      <main className="wrap">
        <SimBanner />
        <ErrorBox msg={err} />
        <div className="grid g-main">
          <div className="panel">
            <h2>My assigned incidents</h2>
            <div className="list">
              {incidents.length === 0 && <div className="empty">Nothing assigned to you yet. The administrator will assign incidents after the engine flags them.</div>}
              {incidents.map((i) => (
                <button key={i.id} className={`item ${sel === i.id ? 'sel' : ''}`} onClick={() => setSel(i.id)}>
                  <div><RiskBadge level={i.riskLevel} /> <StatusBadge status={i.status} /></div>
                  <div className="t">{i.title.replace('Potential ', '')}</div>
                  <div className="small muted">{i.id} · {i.count} complaints · assigned {fmtDate(i.assignedAt)}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <h2>Map</h2>
            <MapView className="small" center={center} zoom={14} incidents={incidents} assets={assets} layers={{ complaints: false, density: false, assets: true, incidents: true, watch: false }} selectedId={sel} onSelectIncident={setSel} />
          </div>
        </div>
        {sel && <div style={{ marginTop: 14 }}><IncidentPanel key={sel} incidentId={sel} user={me} onChanged={load} /></div>}
        <div style={{ marginTop: 14 }}><Registry assets={assets} maintenance={maintenance} user={me} onChanged={load} /></div>
      </main>
    </>
  );
}
