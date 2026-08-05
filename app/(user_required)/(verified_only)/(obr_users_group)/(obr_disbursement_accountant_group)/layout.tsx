import {redirect, RedirectType} from 'next/navigation';
import type {ReactNode} from 'react';

import {session as auth, SessionCode} from '@/lib/auth';
import * as permissions from '@/lib/db/permissions';

export default async function ObrDisbursementAccountantGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.verify([permissions.OBR_DISBURSEMENT_ACCOUNTANT_APPROVE]);

  if (session.redirectTo) {
    return redirect(session.redirectTo, RedirectType.replace);
  }

  if (session.code !== SessionCode.Ok) {
    return redirect('/auth/signin');
  }

  return <>{children}</>;
}
