'use client';

import {Ban} from 'lucide-react';
import Link from 'next/link';

import Typography from '@/components/typography';
import {Button} from '@/components/ui/button';

export default function BannedPage() {
  return (
    <div className="h-lvh w-full overflow-hidden bg-red-700 px-24 py-32">
      <Ban className="size-56 mb-8 stroke-white" />
      <Typography variant="h1" className="text-white text-8xl">
        You are currently banned.
      </Typography>
      <Typography variant="h4" className="text-white text-4xl ml-5 mt-2 mb-8">
        If you think this is a mistake, please contact the organization owners.
      </Typography>
      <Button variant="link" className="text-white font-bold text-2xl" asChild>
        <Link href="/auth/signout">Click here to sign-out.</Link>
      </Button>
    </div>
  );
}
