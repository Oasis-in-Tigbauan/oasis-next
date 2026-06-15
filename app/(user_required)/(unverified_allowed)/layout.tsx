import Image from "next/image";
import type { ReactNode } from "react";
import { redirect, RedirectType } from "next/navigation";

import { session as auth, SessionCode } from "@/lib/auth";

export default async function UnverifiedLayout({ children }: { children: ReactNode}) {
  const session = await auth.verify();

  // No valid session → sign in
  if (session.code === SessionCode.SessionInvalid) {
    return redirect("/auth/signin");
  }

  // Banned users have their own page
  if (session.code === SessionCode.Banned) {
    return redirect("/banned", RedirectType.replace);
  }

  // Shadow-banned users are silently allowed through to appear as pending

  // Activated users don't belong here
  if (session.user?.activated) {
    return redirect("/auth/check", RedirectType.replace);
  }

  return (
    <main className="grid min-h-svh overflow-x-auto text-foreground lg:grid-cols-[auto_55%] xl:grid-cols-[60%_auto] dark:bg-background">
      <section className="flex min-h-svh flex-col px-6 py-6 sm:px-10 lg:px-14">
        <header className="flex items-center gap-3">
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

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            {children}
          </div>
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
