import {ArrowLeft, Home} from 'lucide-react';
import Link from 'next/link';

import {Button} from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F7FAFC] px-6 py-10">
      <section className="w-full max-w-xl rounded-lg border border-[#D8E2EC] bg-[#FBFCFE] px-8 py-9 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#5D7390]">404</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#122033]">
          Page not found
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#52657A]">
          The page may have moved, or your account may not have access to this workspace area.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard">
              <Home className="size-4" />
              Dashboard
            </Link>
          </Button>
          <Button asChild>
            <Link href="/">
              <ArrowLeft className="size-4" />
              Start over
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
