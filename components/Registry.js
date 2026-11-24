'use client';
// Infrastructure & Maintenance registry (admin: asset add; admin+officer: maintenance/breakdown add)
import { useState } from 'react';
import { api, fmtDate } from '@/lib/client';
import { ASSET_TYPES, ASSET_STATUSES, BASE } from '@/lib/constants';
import { ErrorBox } from '@/components/ui';

export default function Registry({ assets, maintenance, user, onChanged }) {
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [selAsset, setSelAsset] = useState('');
  const [af, setAf] = useState({ type: 'pipeline', name: '', lat: BASE.lat.toFixed(5), lng: BASE.lng.toFixed(5), status: 'operational' });
  const [mf, setMf] = useState({ assetId: '', type: 'maintenance', title: '', description: '' });

  async function submit(path, body, reset) {
    setErr(''); setMsg('');
    try { await api(path, { method: 'POST', body }); setMsg('Saved.'); reset?.(); onChanged?.(); }
    catch (e) { setErr(e.message); }
  }
  const history = maintenance.filter((m) => m.assetId === selAsset);

  return (
    <section className="panel" aria-label="Infrastructure registry">
      <h2>Infrastructure &amp; maintenance registry <span className="badge b-moderate">simulated</span></h2>
      <ErrorBox msg={err} />{msg && <div className="okbox">{msg}</div>}
      <div className="tablewrap"><table>
        <thead><tr><th>ID</th><th>Type</th><th>Name</th><th>Status</th><th>Last maintenance</th><th></th></tr></thead>
        <tbody>{assets.map((a) => (
          <tr key={a.id}><td className="mono">{a.id}</td><td>{ASSET_TYPES[a.type]}</td><td>{a.name}</td><td>{a.status.replace('_', ' ')}</td>
            <td>{a.lastMaintenanceAt ? fmtDate(a.lastMaintenanceAt) : 'none'}</td>
            <td><button className="btn ghost sm" onClick={() => setSelAsset(a.id)}>History</button></td></tr>
        ))}</tbody></table></div>
      {selAsset && (
        <div style={{ marginTop: 10 }}>
          <h3>Maintenance history — {selAsset}</h3>
          {history.length ? <ul>{history.map((m) => <li key={m.id}><span className="mono">{m.id}</span> {fmtDate(m.date)} · <b>{m.type}</b> · {m.title} <span className="muted">({m.recordedBy})</span></li>)}</ul> : <p className="muted">No records.</p>}
        </div>
      )}

      <details>
        <summary>Add maintenance record / breakdown report</summary>
        <div className="row">
          <div><label htmlFor="m-asset">Asset</label>
            <select id="m-asset" value={mf.assetId} onChange={(e) => setMf({ ...mf, assetId: e.target.value })}>
              <option value="">Select asset…</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.id} — {a.name}</option>)}</select></div>
          <div><label htmlFor="m-type">Type</label>
            <select id="m-type" value={mf.type} onChange={(e) => setMf({ ...mf, type: e.target.value })}>
              <option value="maintenance">Maintenance</option><option value="breakdown">Breakdown report</option></select></div>
        </div>
        <label htmlFor="m-title">Title</label><input id="m-title" value={mf.title} onChange={(e) => setMf({ ...mf, title: e.target.value })} />
        <label htmlFor="m-desc">Description</label><textarea id="m-desc" value={mf.description} onChange={(e) => setMf({ ...mf, description: e.target.value })} />
        <button className="btn" style={{ marginTop: 8 }} onClick={() => submit('/api/maintenance', mf, () => setMf({ assetId: '', type: 'maintenance', title: '', description: '' }))}>Save record</button>
      </details>

      {user?.role === 'admin' && (
        <details>
          <summary>Register new (simulated) asset</summary>
          <div className="row">
            <div><label htmlFor="a-type">Type</label><select id="a-type" value={af.type} onChange={(e) => setAf({ ...af, type: e.target.value })}>
              {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label htmlFor="a-status">Status</label><select id="a-status" value={af.status} onChange={(e) => setAf({ ...af, status: e.target.value })}>
              {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>
          </div>
          <label htmlFor="a-name">Name</label><input id="a-name" value={af.name} onChange={(e) => setAf({ ...af, name: e.target.value })} />
          <div className="row">
            <div><label htmlFor="a-lat">Latitude</label><input id="a-lat" value={af.lat} onChange={(e) => setAf({ ...af, lat: e.target.value })} /></div>
            <div><label htmlFor="a-lng">Longitude</label><input id="a-lng" value={af.lng} onChange={(e) => setAf({ ...af, lng: e.target.value })} /></div>
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => submit('/api/assets', af, () => setAf({ ...af, name: '' }))}>Register asset</button>
        </details>
      )}
    </section>
  );
}
