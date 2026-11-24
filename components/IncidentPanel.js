'use client';
// Incident detail: kya hua, kahan, kyun flag hua, evidence, kya verify karna hai + role-based actions
import { useCallback, useEffect, useState } from 'react';
import { api, fmtDate, fileToDataUrl } from '@/lib/client';
import { CATEGORIES, ASSET_TYPES } from '@/lib/constants';
import { RiskBadge, StatusBadge, ErrorBox } from '@/components/ui';

const FINDINGS = {
  leak_found: 'Leak found', discoloration_observed: 'Water discolouration observed', low_pressure_confirmed: 'Low pressure confirmed',
  no_abnormality: 'No abnormality found', inconclusive: 'Inconclusive',
};

export default function IncidentPanel({ incidentId, user, officers = [], onChanged }) {
  const [inc, setInc] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [officerId, setOfficerId] = useState('');
  const [note, setNote] = useState('');
  const [insp, setInsp] = useState({ observations: '', finding: 'discoloration_observed', turbidityNTU: '', chlorineMgL: '', ph: '', sampleNotes: '', evidence: null });

  const load = useCallback(async () => {
    try { setErr(''); setInc((await api(`/api/incidents/${incidentId}`)).incident); }
    catch (e) { setErr(e.message); setInc(null); }
  }, [incidentId]);
  useEffect(() => { load(); }, [load]);

  async function act(action, body, after) {
    setBusy(true); setErr('');
    try {
      await api(`/api/incidents/${incidentId}/${action}`, { method: 'POST', body });
      after?.();
      await load();
      onChanged?.();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function onFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    try { setInsp((s) => ({ ...s, evidence: null })); const url = await fileToDataUrl(f); setInsp((s) => ({ ...s, evidence: url })); }
    catch (er) { setErr(er.message); }
  }

  if (err && !inc) return <div className="panel"><ErrorBox msg={err} /></div>;
  if (!inc) return <div className="panel muted">Loading incident…</div>;

  const isAdmin = user?.role === 'admin';
  const isMine = user?.role === 'field_officer' && inc.assignedTo === user.id;
  const open = !['dismissed', 'resolved'].includes(inc.status);

  return (
    <section className="panel" aria-label={`Incident ${inc.id}`}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div>
          <div className="muted small mono">{inc.id} · detected {fmtDate(inc.detectedAt)}</div>
          <h2 style={{ fontSize: '1.2rem' }}>{inc.title}</h2>
        </div>
        <div style={{ flex: 'none' }}><RiskBadge level={inc.riskLevel} /> <StatusBadge status={inc.status} /></div>
      </div>
      <p className="sticky-note">Automated alert = risk signal, not proof of contamination or failure. Human verification required.</p>
      <ErrorBox msg={err} />

      <div className="grid g-2" style={{ marginTop: 12 }}>
        <div>
          <h3>1. What happened?</h3>
          <p>{inc.count} unique complaints clustered together: {Object.entries(inc.categoryCounts).map(([k, n]) => `${n} × ${CATEGORIES[k]?.label || k}`).join(', ')}.</p>
          <h3>2. Where?</h3>
          <p>{inc.localityName} — about {inc.radiusM} m spread around ({inc.center.lat.toFixed(4)}, {inc.center.lng.toFixed(4)}). Window: last {inc.windowHours} h.</p>
          <h3>3. Why did the system flag it?</h3>
          <ul>{inc.explanation.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <details>
            <summary>Experimental risk score: {inc.score}/100 (not a probability)</summary>
            <table><thead><tr><th>Factor</th><th>Pts</th><th>Detail</th></tr></thead>
              <tbody>{inc.scoreBreakdown.map((b) => <tr key={b.factor}><td>{b.factor}</td><td>{b.points}</td><td className="muted">{b.detail}</td></tr>)}</tbody></table>
          </details>
        </div>
        <div>
          <h3>4. Supporting evidence</h3>
          <p className="small muted">Nearby infrastructure (simulated):</p>
          {inc.nearbyAssets.length ? <ul>{inc.nearbyAssets.map((a) => <li key={a.id}><span className="mono">{a.id}</span> {ASSET_TYPES[a.type]} · {a.distanceM} m · {a.status}</li>)}</ul> : <p className="muted">None within radius.</p>}
          <p className="small muted">Relevant maintenance / breakdown records:</p>
          {inc.maintenance.length ? <ul>{inc.maintenance.map((m) => <li key={m.recordId}><span className="mono">{m.assetId}</span> {m.title} ({m.kind}) · {m.ageDays} d ago · {m.distanceM} m</li>)}</ul> : <p className="muted">None in lookback window.</p>}
          <h3>5. What should the officer verify next?</h3>
          <p>{inc.recommendedAction}</p>
        </div>
      </div>

      <details>
        <summary>Contributing complaints ({inc.complaints.length})</summary>
        <div className="tablewrap"><table>
          <thead><tr><th>ID</th><th>Category</th><th>When</th><th>Description</th></tr></thead>
          <tbody>{inc.complaints.map((c) => (
            <tr key={c.id}><td className="mono">{c.id}{c.duplicateOf ? ' (dup)' : ''}</td><td>{CATEGORIES[c.category]?.label}</td><td>{fmtDate(c.occurredAt)}</td>
              <td>{c.description}{c.hasImage && <> · <a href={`/api/complaints/${c.id}/image`} target="_blank" rel="noreferrer">photo</a></>}</td></tr>
          ))}</tbody></table></div>
      </details>

      {inc.inspections.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>Site inspections</h3>
          {inc.inspections.map((s) => (
            <div key={s.id} className="panel" style={{ background: 'var(--panel2)' }}>
              <div className="small muted">{s.id} · {fmtDate(s.at)} · {s.officerName} · <b>{FINDINGS[s.finding]}</b></div>
              <p>{s.observations}</p>
              {s.waterSample && <p className="small">Water sample: {Object.entries(s.waterSample).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
              {s.evidence && <img className="ev" src={s.evidence} alt="Inspection evidence" />}
            </div>
          ))}
        </div>
      )}

      {/* ---------- Actions ---------- */}
      {open && isAdmin && (
        <div className="panel" style={{ background: 'var(--panel2)', marginTop: 12 }}>
          <h3>Administrator actions</h3>
          <div className="row">
            <div><label htmlFor="officer">Assign to field officer</label>
              <select id="officer" value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
                <option value="">Select officer…</option>
                {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select></div>
            <button className="btn" disabled={busy || !officerId} onClick={() => act('assign', { officerId })}>
              {inc.assignedTo ? 'Re-assign' : 'Assign'}</button>
          </div>
          {inc.assignedName && <p className="small muted">Currently assigned to {inc.assignedName}.</p>}
          {inc.status === 'verified' && (
            <>
              <label htmlFor="res">Final resolution (what was done)</label>
              <textarea id="res" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Valve chamber closed, mains flushed, chlorine restored." />
              <button className="btn amber" disabled={busy} onClick={() => act('resolve', { resolution: note }, () => setNote(''))}>Record resolution &amp; close</button>
            </>
          )}
          {inc.status !== 'verified' && (
            <>
              <label htmlFor="dis">Dismiss (reason required)</label>
              <input id="dis" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Planned flushing confirmed by phone" />
              <button className="btn danger" style={{ marginTop: 8 }} disabled={busy} onClick={() => act('decision', { decision: 'dismissed', note }, () => setNote(''))}>Dismiss incident</button>
            </>
          )}
        </div>
      )}

      {open && isMine && (
        <div className="panel" style={{ background: 'var(--panel2)', marginTop: 12 }}>
          <h3>Field inspection (simulated report)</h3>
          <label htmlFor="obs">Observations</label>
          <textarea id="obs" value={insp.observations} onChange={(e) => setInsp({ ...insp, observations: e.target.value })} placeholder="What did you see on site?" />
          <label htmlFor="fnd">Finding</label>
          <select id="fnd" value={insp.finding} onChange={(e) => setInsp({ ...insp, finding: e.target.value })}>
            {Object.entries(FINDINGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="row">
            <div><label htmlFor="ntu">Turbidity (NTU)</label><input id="ntu" inputMode="decimal" value={insp.turbidityNTU} onChange={(e) => setInsp({ ...insp, turbidityNTU: e.target.value })} /></div>
            <div><label htmlFor="cl">Residual chlorine (mg/L)</label><input id="cl" inputMode="decimal" value={insp.chlorineMgL} onChange={(e) => setInsp({ ...insp, chlorineMgL: e.target.value })} /></div>
            <div><label htmlFor="ph">pH</label><input id="ph" inputMode="decimal" value={insp.ph} onChange={(e) => setInsp({ ...insp, ph: e.target.value })} /></div>
          </div>
          <label htmlFor="sn">Sample notes (optional)</label>
          <input id="sn" value={insp.sampleNotes} onChange={(e) => setInsp({ ...insp, sampleNotes: e.target.value })} />
          <label htmlFor="evi">Evidence photo (optional)</label>
          <input id="evi" type="file" accept="image/*" onChange={onFile} />
          {insp.evidence && <img className="ev" src={insp.evidence} alt="Evidence preview" />}
          <div style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy} onClick={() => act('inspection', {
              observations: insp.observations, finding: insp.finding, evidence: insp.evidence,
              waterSample: { turbidityNTU: insp.turbidityNTU, chlorineMgL: insp.chlorineMgL, ph: insp.ph, notes: insp.sampleNotes },
            }, () => setInsp({ ...insp, observations: '', evidence: null }))}>Submit inspection</button>
          </div>
          {inc.status === 'under_investigation' && (
            <>
              <hr style={{ borderColor: 'var(--line)' }} />
              <h3>Decision (only authorised officers can verify)</h3>
              <label htmlFor="dn">Note</label>
              <input id="dn" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn" disabled={busy} onClick={() => act('decision', { decision: 'verified', note }, () => setNote(''))}>Mark VERIFIED</button>
                <button className="btn danger" disabled={busy} onClick={() => act('decision', { decision: 'dismissed', note }, () => setNote(''))}>Dismiss</button>
              </div>
            </>
          )}
        </div>
      )}

      {inc.resolution && <div className="okbox"><b>Resolution:</b> {inc.resolution.note} <span className="small">({inc.resolution.by.name}, {fmtDate(inc.resolution.at)})</span></div>}
      {inc.dismissal && <div className="sticky-note"><b>Dismissed:</b> {inc.dismissal.note} ({inc.dismissal.by.name})</div>}

      <h3 style={{ marginTop: 14 }}>Event history</h3>
      <ul className="timeline">
        {[...inc.history].reverse().map((h, i) => (
          <li key={i}><b>{h.action.replace(/_/g, ' ')}</b> <span className="muted small">· {fmtDate(h.at)} · {h.by === 'system' ? 'system' : h.by.name}</span><div className="small">{h.note}</div></li>
        ))}
      </ul>
    </section>
  );
}
