import { handler, readBody } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user }) => ({ maintenance: svc.listMaintenance(db, user) }));
export const POST = handler(async ({ request, db, user }) => ({ record: svc.addMaintenance(db, await readBody(request), user) }));
