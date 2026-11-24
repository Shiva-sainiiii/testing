// API route helpers: auth, error handling, JSON
import { NextResponse } from 'next/server';
import { getDb, persist } from './db.js';
import { COOKIE, readSession } from './auth.js';
import { ServiceError } from './service.js';

export const publicUser = (u) => u && { id: u.id, name: u.name, role: u.role, email: u.email };

export function currentUser(request, db) {
  const s = readSession(request.cookies.get(COOKIE)?.value);
  return s ? db.users.find((u) => u.id === s.uid) || null : null;
}

export async function readBody(request) {
  try { return await request.json(); } catch { throw new ServiceError(400, 'Invalid JSON body'); }
}

// Har route isse wrap hota hai: db + user inject, errors JSON me, non-GET pe persist
export function handler(fn) {
  return async (request, ctx) => {
    try {
      const db = getDb();
      const out = await fn({ request, db, params: ctx?.params || {}, user: currentUser(request, db) });
      if (out instanceof Response) return out;
      if (request.method !== 'GET') persist(db);
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ServiceError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'Something went wrong on the server' }, { status: 500 });
    }
  };
}
