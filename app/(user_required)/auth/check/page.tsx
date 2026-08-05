import {redirect, RedirectType} from 'next/navigation';

import {session as auth, SessionCode} from '@/lib/auth';

export default async function CheckPage() {
  const session = await auth.verify();

  // Shadow-banned users are silently redirected to pending to hide their status
  if (session.code === SessionCode.ShadowBanned) {
    redirect('/enrollment/pending', RedirectType.replace);
  }

  if (session.redirectTo) {
    redirect(session.redirectTo, RedirectType.replace);
  }

  redirect('/dashboard');
}
