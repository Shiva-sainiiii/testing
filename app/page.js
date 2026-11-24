import Link from 'next/link';
import Header from '@/components/Header';
import { SimBanner } from '@/components/ui';

export default function Home() {
  return (
    <>
      <Header />
      <main className="wrap">
        <SimBanner />
        <section className="hero">
          <h1>Detect Patterns. <span style={{ color: 'var(--cyan)' }}>Prevent Public Failures.</span></h1>
          <p>CivicSignal 2.0 correlates complaints, location, timing and maintenance records to flag possible infrastructure incidents early — with a clear explanation for every alert. Alerts are risk signals that always need human verification.</p>
        </section>
        <div className="cards">
          <div className="panel"><h2>Citizen portal</h2><p className="muted">Report dirty water, low pressure, leakage, sewage overflow or waterlogging. Works on low-end phones.</p><Link className="btn" href="/report" style={{ textAlign: 'center', textDecoration: 'none' }}>Report an issue</Link></div>
          <div className="panel"><h2>Administrator dashboard</h2><p className="muted">Map, alerts, incident management, registry and detection settings.</p><Link className="btn ghost" href="/login" style={{ textAlign: 'center', textDecoration: 'none' }}>Staff login</Link></div>
          <div className="panel"><h2>Demo walk-through</h2>
            <ol className="small" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Open <Link href="/report">Report</Link> → click “Demo: fill Green Park report” → Submit.</li>
              <li>Log in as <b>admin@civicsignal.demo</b> / <b>demo123</b> → new alert appears.</li>
              <li>Assign to Officer Meera Rao.</li>
              <li>Log in as <b>officer1@civicsignal.demo</b> → inspect → Verify.</li>
              <li>Admin → record resolution → stats update.</li>
            </ol></div>
        </div>
      </main>
    </>
  );
}
