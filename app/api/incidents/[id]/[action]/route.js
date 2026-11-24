import { handler, readBody } from '@/lib/http';
import * as svc from '@/lib/service';
import { ServiceError } from '@/lib/service';

// POST /api/incidents/:id/assign | inspection | decision | resolve
export const POST = handler(async ({ request, db, user, params }) => {
  const b = await readBody(request);
  const { id, action } = params;
  switch (action) {
    case 'assign': return { incident: svc.assignIncident(db, id, b.officerId, user) };
    case 'inspection': return { incident: svc.addInspection(db, id, b, user) };
    case 'decision': return { incident: svc.decideIncident(db, id, b, user) };
    case 'resolve': return { incident: svc.resolveIncident(db, id, b, user) };
    default: throw new ServiceError(404, 'Unknown action');
  }
});
