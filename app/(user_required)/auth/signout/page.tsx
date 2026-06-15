"use client";

import { redirect, RedirectType } from "next/navigation";
import { useEffect } from "react";

import { $fetch } from "@/lib/http/client/fetch";
import { Spinner } from "@/components/ui/spinner";
import Image from "next/image";

export default function SignoutPage() {
  useEffect(() => {
    const signOut = async () => {
      await $fetch("/api/auth/sign-out", { method: "POST" });
    };
    signOut()
      .then(() => {
        redirect("/", RedirectType.replace);
      });
  }, []);

  return (
    <main className="grid min-h-svh overflow-x-auto text-foreground lg:grid-cols-[auto_55%] xl:grid-cols-[60%_auto] dark:bg-background">
      <section className="flex min-h-svh flex-col px-6 py-6 sm:px-10 lg:px-14">
        <header className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl border bg-card shadow-sm">
            <Image
              src={process.env.NEXT_PUBLIC_PROJECT_ORG_SEAL as string}
              alt="Organization Seal"
              width={34}
              height={34}
              priority
            />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Oasis Next</p>
            <p className="text-xs text-muted-foreground">{process.env.NEXT_PUBLIC_PROJECT_ORG_NAME}</p>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            <div className="flex flex-col gap-6">
              <div>
                <div className="flex flex-col items-center gap-4 text-center">
                  <Spinner className="size-16" />
                  <h1 className="text-2xl font-bold">Signing out...</h1>
                  <p className="text-muted-foreground text-sm text-balance">
                    Please wait while you are being signed out.
                  </p>
                </div>
              </div>
            </div>
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
