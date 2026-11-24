'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

export default function Header({ user }) {
  const router = useRouter();
  async function logout() {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    router.push('/login');
  }
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        Civic<b>Signal</b> 2.0
        <small>DETECT PATTERNS. PREVENT PUBLIC FAILURES.</small>
      </Link>
      <nav aria-label="Main">
        <Link href="/report">Report an issue</Link>
        {user ? (
          <>
            <span className="muted small">{user.name} · {user.role === 'admin' ? 'Administrator' : 'Field officer'}</span>
            <button className="btn ghost sm" onClick={logout}>Log out</button>
          </>
        ) : (
          <Link href="/login">Staff login</Link>
        )}
      </nav>
    </header>
  );
}
