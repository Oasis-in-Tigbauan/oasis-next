'use client';

import Image from 'next/image';
import type {ReactNode} from 'react';

export default function Template({children}: {children: ReactNode}) {
  return (
    <main className="grid h-svh min-h-svh overflow-hidden bg-[oklch(0.985_0.006_255)] text-foreground lg:grid-cols-[auto_55%] xl:grid-cols-[60%_auto] dark:bg-background">
      <section className="flex h-svh min-h-0 flex-col overflow-hidden px-6 py-6 sm:px-10 lg:px-14">
        <header className="flex shrink-0 items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Image
              src="/assets/tigbauan-seal.png"
              alt="Organization Seal"
              width={34}
              height={34}
              priority
            />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Oasis Next</p>
            <p className="text-xs text-muted-foreground">Municipality of Tigbauan</p>
          </div>
        </header>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </div>
      </section>

      <section className="relative hidden h-svh min-h-svh max-h-svh shrink-0 lg:block">
        <Image
          src="/assets/company-banner.svg"
          alt="Municipal operations banner"
          loading="eager"
          width={672}
          height={878}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </section>
    </main>
  );
}
