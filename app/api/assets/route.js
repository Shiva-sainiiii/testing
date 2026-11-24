import { handler, readBody } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user }) => ({ assets: svc.listAssets(db, user) }));
export const POST = handler(async ({ request, db, user }) => ({ asset: svc.addAsset(db, await readBody(request), user) }));
