import { handler } from '@/lib/http';
import * as svc from '@/lib/service';

export const GET = handler(({ db, user, params }) => {
  const dataUrl = svc.getComplaintImage(db, user, params.id);
  const [meta, b64] = dataUrl.split(',');
  const type = meta.match(/data:(.*?);/)[1];
  return new Response(Buffer.from(b64, 'base64'), { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=300' } });
});
