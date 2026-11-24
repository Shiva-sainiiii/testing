'use client';
// Administrator operations dashboard
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Charts from '@/components/Charts';
import IncidentPanel from '@/components/IncidentPanel';
import Registry from '@/components/Registry';
import { SimBanner, ErrorBox, RiskBadge, StatusBadge } from '@/components/ui';
import { api, fmtDate, fmtMinutes } from '@/lib/client';
import { CATEGORIES, LOCALITIES, BASE } from '@/lib/constants';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });

export default function Dashboard() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ stats: null, complaints: [], incidents: [], watch: [], assets: [], maintenance: [], officers: [], config: null });
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null);
  const [flt, setFlt] = useState({ category: 'all', locality: 'all', days: 30 });
  const [layers, setLayers] = useState({ complaints: true, density: true, assets: true, incidents: true, watch: true });
  const [cfgDraft, setCfgDraft] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    try {
      const [stats, complaints, inc, assets, maint, officers, config] = await Promise.all([
        api('/api/stats'), api('/api/complaints'), api('/api/incidents'), api('/api/assets'), api('/api/maintenance'), api('/api/officers'), api('/api/config'),
      ]);
      setData({ stats: stats.stats, complaints: complaints.complaints, incidents: inc.incidents, watch: inc.watch, assets: assets.assets, maintenance: maint.maintenance, officers: officers.officers, config: config.config });
      setCfgDraft((d) => d || config.config);
      setErr('');
    } catch (e) {
      if (e.status === 401 || e.status === 403) router.replace('/login'); else setErr(e.message);
    }
  }, [router]);

  useEffect(() => {
    api('/api/me').then((r) => {
      if (r.user.role !== 'admin') return router.replace('/officer');
      setMe(r.user); load();
    }).catch(() => router.replace('/login'));
  }, [router, load]);

  // har 20 sec me auto-refresh (naye alerts dikhne ke liye)
  useEffect(() => { const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const cutoff = flt.days ? Date.now() - flt.days * 86400000 : 0;
  const complaints = useMemo(() => data.complaints.filter((c) =>
    (flt.category === 'all' || c.category === flt.category) &&
    (flt.locality === 'all' || c.locality === flt.locality) &&
    Date.parse(c.occurredAt) >= cutoff), [data.complaints, flt, cutoff]);
  const incidents = useMemo(() => data.incidents.filter((i) => flt.locality === 'all' || i.localityId === flt.locality), [data.incidents, flt.locality]);

  const hotspots = useMemo(() => {
    const m = {};
    for (const c of complaints) if (!c.duplicateOf) m[c.locality] = (m[c.locality] || 0) + 1;
    const max = Math.max(1, ...Object.values(m));
    return LOCALITIES.map((l) => ({ ...l, n: m[l.id] || 0, pct: ((m[l.id] || 0) / max) * 100 })).sort((a, b) => b.n - a.n);
  }, [complaints]);

  const timeline = useMemo(() => data.incidents.flatMap((i) => i.history.map((h) => ({ ...h, inc: i.id })))
    .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12), [data.incidents]);

  const mapCenter = flt.locality === 'all' ? BASE : LOCALITIES.find((l) => l.id === flt.locality);
  const s = data.stats;

  async function detect() { try { const r = await api('/api/detect', { method: 'POST' }); setMsg(`Detection run: ${r.created.length} new, ${r.updated.length} updated.`); load(); } catch (e) { setErr(e.message); } }
  async function reset() { if (!confirm('Reset all demo data to the original seed?')) return; try { await api('/api/demo/reset', { method: 'POST' }); setSel(null); setCfgDraft(null); setMsg('Demo data reset.'); load(); } catch (e) { setErr(e.message); } }
  async function saveCfg() {
    try {
      const d = cfgDraft;
      await api('/api/config', { method: 'PUT', body: { minComplaints: d.minComplaints, windowHours: d.windowHours, radiusM: d.radiusM, maintenanceLookbackDays: d.maintenanceLookbackDays, baselineDays: d.baselineDays, baselineMultiplier: d.baselineMultiplier, thresholds: d.thresholds } });
      setMsg('Settings saved and detection re-run.'); load();
    } catch (e) { setErr(e.message); }
  }

  if (!me) return <><Header /><main className="wrap"><p className="muted">Loading…</p></main></>;

  return (
    <>
      <Header user={me} />
      <main className="wrap">
        <SimBanner />
        <ErrorBox msg={err} />{msg && <div className="okbox" role="status">{msg}</div>}

        <div className="grid g-kpi" aria-label="Key figures">
          <div className="kpi"><div className="l">Total complaints</div><div className="v">{s?.totalComplaints ?? '—'}</div><div className="small muted">{s?.duplicateComplaints ?? 0} near-duplicates</div></div>
          <div className="kpi cyan"><div className="l">Active incidents</div><div className="v">{s?.activeIncidents ?? '—'}</div></div>
          <div className="kpi amber"><div className="l">High-risk alerts</div><div className="v">{s?.highRiskAlerts ?? '—'}</div></div>
          <div className="kpi"><div className="l">Verified incidents</div><div className="v">{s?.verifiedIncidents ?? '—'}</div></div>
          <div className="kpi"><div className="l">Avg response time</div><div className="v">{fmtMinutes(s?.avgResponseMinutes)}</div><div className="small muted">detection → assignment</div></div>
          <div className="kpi"><div className="l">Resolved / dismissed</div><div className="v">{s ? `${s.resolvedIncidents} / ${s.dismissedIncidents}` : '—'}</div></div>
          <div className="kpi"><div className="l">Assets needing attention</div><div className="v">{s ? (s.assets.byStatus.degraded || 0) + (s.assets.byStatus.under_repair || 0) + (s.assets.byStatus.offline || 0) : '—'}</div><div className="small muted">{s?.assets.maintenanceOverdue ?? 0} overdue (&gt;90 d)</div></div>
        </div>

        <div className="panel" style={{ marginTop: 14 }}>
          <div className="row">
            <div><label htmlFor="f-cat">Category</label><select id="f-cat" value={flt.category} onChange={(e) => setFlt({ ...flt, category: e.target.value })}><option value="all">All categories</option>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
            <div><label htmlFor="f-loc">Locality</label><select id="f-loc" value={flt.locality} onChange={(e) => setFlt({ ...flt, locality: e.target.value })}><option value="all">All localities</option>{LOCALITIES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
            <div><label htmlFor="f-days">Date range</label><select id="f-days" value={flt.days} onChange={(e) => setFlt({ ...flt, days: Number(e.target.value) })}><option value={2}>Last 48 hours</option><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option><option value={0}>All time</option></select></div>
            <div style={{ flex: 'none' }}><button className="btn ghost" onClick={load}>Refresh</button> <button className="btn" onClick={detect}>Run detection</button></div>
          </div>
        </div>

        <div className="grid g-main" style={{ marginTop: 14 }}>
          <div className="panel">
            <h2>Geographic intelligence <span className="muted small">({complaints.length} complaints shown)</span></h2>
            <div className="layers" role="group" aria-label="Map layers">
              {[['complaints', 'Complaints'], ['density', 'Density'], ['assets', 'Assets (sim.)'], ['incidents', 'Incident clusters'], ['watch', 'Below-threshold clusters']].map(([k, label]) => (
                <label key={k}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{label}</label>
              ))}
            </div>
            <MapView center={mapCenter} zoom={flt.locality === 'all' ? 13 : 15} complaints={complaints} assets={data.assets} incidents={incidents} watch={data.watch} layers={layers} selectedId={sel} onSelectIncident={setSel} />
            <p className="small muted">Hollow dots = near-duplicate reports. Dashed grey circles = clusters watched but below alert threshold. Squares = simulated assets.</p>
          </div>

          <div className="panel">
            <h2>Recent alerts</h2>
            <div className="list">
              {incidents.length === 0 && <div className="empty">No incidents yet. Alerts appear here when the engine detects a pattern.</div>}
              {incidents.map((i) => (
                <button key={i.id} className={`item ${sel === i.id ? 'sel' : ''}`} onClick={() => setSel(i.id)}>
                  <div><RiskBadge level={i.riskLevel} /> <StatusBadge status={i.status} /></div>
                  <div className="t">{i.title.replace('Potential ', '')}</div>
                  <div className="small muted">{i.id} · {i.count} complaints · {fmtDate(i.detectedAt)}</div>
                </button>
              ))}
            </div>
            <h2 style={{ marginTop: 16 }}>Geographic hotspots</h2>
            {hotspots.map((h) => (<div key={h.id} style={{ marginBottom: 8 }}><div className="small" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{h.name}</span><b>{h.n}</b></div><div className="bar"><i style={{ width: `${h.pct}%` }} /></div></div>))}
          </div>
        </div>

        {sel && <div style={{ marginTop: 14 }}><IncidentPanel key={sel} incidentId={sel} user={me} officers={data.officers} onChanged={load} /></div>}

        <div style={{ marginTop: 14 }}><Charts complaints={complaints} days={flt.days && flt.days <= 30 ? Math.max(flt.days, 7) : 30} /></div>

        <div className="grid g-2" style={{ marginTop: 14 }}>
          <section className="panel"><h2>Incident timeline</h2>
            {timeline.length === 0 ? <div className="empty">No events yet.</div> : (
              <ul className="timeline">{timeline.map((h, i) => (<li key={i}><b>{h.inc}</b> · {h.action.replace(/_/g, ' ')} <span className="muted small">· {fmtDate(h.at)} · {h.by === 'system' ? 'system' : h.by.name}</span><div className="small">{h.note}</div></li>))}</ul>)}
          </section>
          <section className="panel"><h2>Detection settings (configurable rules)</h2>
            {cfgDraft && (<>
              <div className="row">
                {[['minComplaints', 'Min. complaints'], ['windowHours', 'Time window (h)'], ['radiusM', 'Radius (m)'], ['maintenanceLookbackDays', 'Maintenance lookback (d)'], ['baselineDays', 'Baseline period (d)'], ['baselineMultiplier', 'Baseline multiplier (×)']].map(([k, label]) => (
                  <div key={k}><label htmlFor={`c-${k}`}>{label}</label><input id={`c-${k}`} type="number" value={cfgDraft[k]} onChange={(e) => setCfgDraft({ ...cfgDraft, [k]: e.target.value })} /></div>))}
              </div>
              <div className="row">
                {['moderate', 'high', 'critical'].map((k) => (<div key={k}><label htmlFor={`t-${k}`}>Score ≥ {k}</label><input id={`t-${k}`} type="number" value={cfgDraft.thresholds[k]} onChange={(e) => setCfgDraft({ ...cfgDraft, thresholds: { ...cfgDraft.thresholds, [k]: e.target.value } })} /></div>))}
              </div>
              <p className="small muted">Score is an <b>experimental</b> rule-based indicator, not a validated probability.</p>
              <button className="btn" onClick={saveCfg}>Save &amp; re-run detection</button> <button className="btn danger" onClick={reset}>Reset demo data</button>
            </>)}
          </section>
        </div>

        <div style={{ marginTop: 14 }}><Registry assets={data.assets} maintenance={data.maintenance} user={me} onChanged={load} /></div>
      </main>
    </>
  );
}
