import { handler, readBody } from '@/lib/http';
import * as svc from '@/lib/service';
import { ServiceError } from '@/lib/service';

// Citizens ke liye simple in-memory rate limit (per IP)
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 30;
}

export const GET = handler(({ db, user }) => ({ complaints: svc.listComplaints(db, user) }));

// PUBLIC: citizen complaint submit (login nahi chahiye)
export const POST = handler(async ({ request, db }) => {
  const ip = request.headers.get('x-forwarded-for') || 'local';
  if (limited(ip)) throw new ServiceError(429, 'Too many submissions. Please try again in a few minutes.');
  return svc.createComplaint(db, await readBody(request));
});
