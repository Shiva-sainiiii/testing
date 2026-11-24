import { handler } from '@/lib/http';
import { runDetection } from '@/lib/detection';
import { ServiceError } from '@/lib/service';

// Admin manually detection chala sakta hai (re-evaluate)
export const POST = handler(({ db, user }) => {
  if (!user) throw new ServiceError(401, 'Login required');
  if (user.role !== 'admin') throw new ServiceError(403, 'Not allowed for your role');
  const r = runDetection(db, new Date());
  return { created: r.created.map((i) => i.id), updated: r.updated.map((i) => i.id) };
});
