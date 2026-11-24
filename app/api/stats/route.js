import { handler } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user }) => ({ stats: svc.getStats(db, user) }));
