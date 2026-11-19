import { auth } from '@/lib/auth';

type AuthRouteContext = { params: Promise<{ path: string[] }> };

// Construct the Neon handler only when a request arrives. Forward Next.js'
// route context as required by the Neon Auth adapter.
function handle(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH') {
  return (request: Request, context: AuthRouteContext) =>
    auth.handler()[method](request, context);
}

export const GET = handle('GET');
export const POST = handle('POST');
export const PUT = handle('PUT');
export const DELETE = handle('DELETE');
export const PATCH = handle('PATCH');
