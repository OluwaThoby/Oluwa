import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import SystemReadiness from './system-readiness';

export const dynamic = 'force-dynamic';

export default async function SystemPage() {
  let user;
  try {
    const { data } = await auth.getSession();
    user = data?.user;
  } catch {
    return <main className="auth-shell"><section className="auth-card"><h1>Session needs refreshing</h1><p className="muted">AgencyOS could not verify this session on the system health page. Please return to the sign-in page and sign in again.</p><a className="btn" href="/">Return to sign in</a></section></main>;
  }
  if (!user) redirect('/');
  if (user.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    return <main className="auth-shell"><section className="auth-card"><h1>Access restricted</h1><p className="muted">This private workspace is reserved for its owner.</p></section></main>;
  }
  return <SystemReadiness />;
}
