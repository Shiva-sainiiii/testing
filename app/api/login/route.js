import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { COOKIE, signSession } from '@/lib/auth';
import * as svc from '@/lib/service';
import { publicUser } from '@/lib/http';

export async function POST(request) {
  try {
    const b = await request.json();
    const u = svc.login(getDb(), b.email, b.password);
    const res = NextResponse.json({ user: publicUser(u) });
    res.cookies.set(COOKIE, signSession({ uid: u.id, exp: Date.now() + 8 * 3600 * 1000 }), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600, secure: process.env.NODE_ENV === 'production',
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.status ? e.message : 'Login failed' }, { status: e.status || 400 });
  }
}
