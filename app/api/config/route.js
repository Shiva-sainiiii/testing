import { handler, readBody } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user }) => ({ config: svc.getConfig(db, user) }));
export const PUT = handler(async ({ request, db, user }) => ({ config: svc.updateConfig(db, await readBody(request), user) }));
