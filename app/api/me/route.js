import { handler, publicUser } from '@/lib/http';
import { ServiceError } from '@/lib/service';

export const GET = handler(({ user }) => {
  if (!user) throw new ServiceError(401, 'Not logged in');
  return { user: publicUser(user) };
});
