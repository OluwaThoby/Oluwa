import { createNeonAuth } from '@neon/auth/next/server';

function createAuth() {
  return createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
  });
}

// Defer construction until a request actually uses auth. Next.js evaluates
// route modules during build-time page-data collection, where deployment-only
// secrets are intentionally unavailable in GitHub CI.
export const auth = new Proxy({} as ReturnType<typeof createNeonAuth>, {
  get(_target, property) {
    const instance = createAuth();
    const value = Reflect.get(instance, property, instance);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
