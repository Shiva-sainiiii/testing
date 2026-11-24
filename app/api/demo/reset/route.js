import { handler } from '@/lib/http';
import { resetDb } from '@/lib/db';
import { ServiceError } from '@/lib/service';

// Demo data reset (sirf admin) — fresh seed, ab "Green Park" scenario dubara chala sakte ho
export const POST = handler(({ user }) => {
  if (!user) throw new ServiceError(401, 'Login required');
  if (user.role !== 'admin') throw new ServiceError(403, 'Not allowed for your role');
  resetDb(new Date());
  return { ok: true };
});
