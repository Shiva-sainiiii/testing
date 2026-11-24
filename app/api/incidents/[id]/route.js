import { handler } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user, params }) => ({ incident: svc.getIncident(db, params.id, user) }));
