import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import type {ReactNode} from 'react';

import {auth} from '@/lib/auth';

export default async function AuthenticatedLayout({children}: {children: ReactNode}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // No account found.
  if (!session) return redirect('/auth/signin');

  return <>{children}</>;
}
