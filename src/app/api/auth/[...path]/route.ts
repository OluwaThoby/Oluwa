import { auth } from '@/lib/auth';

// Build route handlers lazily so Neon Auth secrets are read only when a
// request reaches this endpoint, never while Next.js collects route metadata.
export const GET = (request: Request) => auth.handler().GET(request);
export const POST = (request: Request) => auth.handler().POST(request);
export const PUT = (request: Request) => auth.handler().PUT(request);
export const DELETE = (request: Request) => auth.handler().DELETE(request);
export const PATCH = (request: Request) => auth.handler().PATCH(request);
