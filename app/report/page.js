'use client';
// Citizen complaint portal — mobile-first, simple, accessible labels
import { useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import { SimBanner, ErrorBox } from '@/components/ui';
import { api, fileToDataUrl, fmtDate } from '@/lib/client';
import { CATEGORIES, LOCALITIES } from '@/lib/constants';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false, loading: () => <div className="map-loading">Loading map…</div> });

const localNow = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export default function Report() {
  const [f, setF] = useState({ category: '', description: '', locality: LOCALITIES[0].id, occurredAt: localNow(), anonymous: false, reporterName: '', image: null });
  const [pin, setPin] = useState({ lat: LOCALITIES[0].lat, lng: LOCALITIES[0].lng });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const loc = LOCALITIES.find((l) => l.id === f.locality);

  const setLocality = (id) => { const l = LOCALITIES.find((x) => x.id === id); setF({ ...f, locality: id }); setPin({ lat: l.lat, lng: l.lng }); };

  // Demo shortcut: Green Park ka 6th complaint (threshold cross karega)
  function demoFill() {
    const g = LOCALITIES.find((l) => l.id === 'green-park');
    setF({ ...f, category: 'dirty_water', locality: g.id, description: 'Brown, dirty water coming from the tap since this morning. Smells bad.', anonymous: true });
    setPin({ lat: g.lat + 0.0006, lng: g.lng - 0.0004 });
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { setF({ ...f, image: await fileToDataUrl(file) }); } catch (er) { setErr(er.message); }
  }

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await api('/api/complaints', { method: 'POST', body: { ...f, lat: pin.lat, lng: pin.lng, occurredAt: new Date(f.occurredAt).toISOString() } });
      setDone(res);
    } catch (er) { setErr(er.message); }
    setBusy(false);
  }

  if (done) {
    return (
      <>
        <Header />
        <main className="wrap narrow">
          <div className="okbox" role="status">
            <h1 style={{ fontSize: '1.2rem' }}>Complaint received ✔</h1>
            <p>Your complaint ID: <b className="mono" style={{ fontSize: '1.2rem' }}>{done.id}</b></p>
            <p>{done.message}</p>
            <p className="small">Received: {fmtDate(done.receivedAt)} · Category: {done.category}{done.possibleDuplicate ? ' · Similar report nearby already exists; yours is linked to it.' : ''}</p>
          </div>
          {done.demo.incidentsCreated.length > 0 && <div className="sticky-note">Demo info: the detection engine created incident {done.demo.incidentsCreated.join(', ')} from this complaint. Check the administrator dashboard.</div>}
          <p><button className="btn ghost" onClick={() => { setDone(null); setF({ ...f, description: '', image: null }); }}>Submit another</button></p>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="wrap narrow">
        <SimBanner />
        <form className="panel" onSubmit={submit} noValidate>
          <h1 style={{ fontSize: '1.3rem' }}>Report a water / drainage problem</h1>
          <p className="muted small">Takes about a minute. You can report anonymously.</p>
          <button type="button" className="btn ghost sm" onClick={demoFill}>Demo: fill Green Park report</button>

          <label htmlFor="cat">What is the problem?</label>
          <select id="cat" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} required>
            <option value="">Choose…</option>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <label htmlFor="desc">Describe what you see</label>
          <textarea id="desc" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="e.g. Water is brown since morning" maxLength={1000} required />

          <label htmlFor="loc">Your area</label>
          <select id="loc" value={f.locality} onChange={(e) => setLocality(e.target.value)}>
            {LOCALITIES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>

          <label>Tap on the map to mark the exact spot</label>
          <MapView mode="pick" className="small" center={pin} zoom={15} pick={pin} onPick={(lat, lng) => setPin({ lat, lng })} />
          <p className="small muted">Pin: {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)} ({loc?.name})</p>

          <label htmlFor="when">When did it start?</label>
          <input id="when" type="datetime-local" value={f.occurredAt} onChange={(e) => setF({ ...f, occurredAt: e.target.value })} />

          <label htmlFor="img">Photo (optional)</label>
          <input id="img" type="file" accept="image/*" capture="environment" onChange={onFile} />
          {f.image && <img className="ev" src={f.image} alt="Preview of your photo" />}

          <div className="check"><input id="anon" type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} /><label htmlFor="anon" style={{ margin: 0 }}>Submit anonymously</label></div>
          {!f.anonymous && (<><label htmlFor="nm">Your name (optional)</label><input id="nm" value={f.reporterName} onChange={(e) => setF({ ...f, reporterName: e.target.value })} maxLength={80} /></>)}

          <ErrorBox msg={err} />
          <button className="btn block" style={{ marginTop: 14 }} disabled={busy}>{busy ? 'Sending…' : 'Submit complaint'}</button>
        </form>
      </main>
    </>
  );
}
