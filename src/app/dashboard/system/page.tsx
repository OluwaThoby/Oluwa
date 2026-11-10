import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import SystemReadiness from './system-readiness';

export const dynamic = 'force-dynamic';

export default async function SystemPage() {
  const { data } = await auth.getSession();
  const user = data?.user;
  if (!user) redirect('/');
  if (user.email?.toLowerCase() !== process.env.OWNER_EMAIL?.toLowerCase()) {
    return <main className="auth-shell"><section className="auth-card"><h1>Access restricted</h1><p className="muted">This private workspace is reserved for its owner.</p></section></main>;
  }
  return <SystemReadiness />;
}
