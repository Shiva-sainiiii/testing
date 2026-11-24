import { handler } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user }) => ({
  incidents: svc.listIncidents(db, user),
  watch: user.role === 'admin' ? svc.getWatch(db, user) : [], // threshold se neeche clusters
}));
