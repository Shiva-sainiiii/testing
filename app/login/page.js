'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { SimBanner, ErrorBox } from '@/components/ui';
import { api } from '@/lib/client';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const { user } = await api('/api/login', { method: 'POST', body: { email, password } });
      router.push(user.role === 'admin' ? '/dashboard' : '/officer');
    } catch (er) { setErr(er.message); setBusy(false); }
  }
  const fill = (e, p) => { setEmail(e); setPassword(p); };

  return (
    <>
      <Header />
      <main className="wrap narrow">
        <SimBanner />
        <div className="panel">
          <h1 style={{ fontSize: '1.3rem' }}>Staff login</h1>
          <form onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <ErrorBox msg={err} />
            <button className="btn block" style={{ marginTop: 14 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="small muted" style={{ marginTop: 14 }}>Demo accounts (password <span className="mono">demo123</span>):</p>
          <div className="row">
            <button className="btn ghost sm" type="button" onClick={() => fill('admin@civicsignal.demo', 'demo123')}>Administrator</button>
            <button className="btn ghost sm" type="button" onClick={() => fill('officer1@civicsignal.demo', 'demo123')}>Officer Meera Rao</button>
            <button className="btn ghost sm" type="button" onClick={() => fill('officer2@civicsignal.demo', 'demo123')}>Officer Arjun Sen</button>
          </div>
        </div>
      </main>
    </>
  );
}
