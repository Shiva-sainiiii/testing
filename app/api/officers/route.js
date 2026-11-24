import { handler } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user }) => ({ officers: svc.listOfficers(db, user) }));
