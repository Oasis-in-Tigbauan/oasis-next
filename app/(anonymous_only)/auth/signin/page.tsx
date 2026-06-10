"use client";

import Image from "next/image";
import { redirect, RedirectType } from "next/navigation";
import { type SyntheticEvent, useState } from "react";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";

import { $fetch } from "@/lib/http/client/fetch";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";

export default function SigninPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<SigninPageState>({
    email: "",
    password: "",
    rememberMe: false,
  });

  const onFieldUpdate = (e: SyntheticEvent<HTMLInputElement>, key: keyof SigninPageState) => {
    setCredentials(l => ({ ...l, [key]: (e.target as HTMLInputElement).value }));
  };

  const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await $fetch("/api/auth/sign-in", {
        method: "POST",
        body: credentials,
      });

      if (error) {
        setErrorMessage("The email or password you entered is incorrect.");
        return;
      }

      if ((data as SignInApiResponse | null)?.data?.twoFactorRequired) {
        redirect("/auth/two-factor", RedirectType.replace);
      }

      redirect("/auth/check", RedirectType.replace);
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="grid min-h-svh overflow-x-auto bg-[oklch(0.985_0.006_255)] text-foreground lg:grid-cols-[auto_55%] xl:grid-cols-[60%_auto] dark:bg-background">
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
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              <ShieldCheck className="size-3.5 text-[oklch(0.48_0.1_258)]" />
              Secure office portal
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-[0_20px_70px_-45px_oklch(0.35_0.08_258)] sm:p-8">
              <form onSubmit={onSubmit}>
                <FieldGroup className="gap-5">
                  <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Sign in to your account
                    </h1>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Use your registered municipal account to continue to the dashboard.
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </div>
                  )}

                  <Field>
                    <FieldLabel htmlFor="email">Email address</FieldLabel>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        className="h-10 pl-9"
                        placeholder="name@example.com"
                        type="email"
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect="off"
                        value={credentials.email}
                        onInput={e => onFieldUpdate(e, "email")}
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        className="h-10 pl-9"
                        type="password"
                        autoComplete="current-password"
                        value={credentials.password}
                        onInput={e => onFieldUpdate(e, "password")}
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </Field>

                  <div className="flex items-center justify-between gap-3">
                    <Field orientation="horizontal" className="gap-2">
                      <Checkbox
                        id="remember-me"
                        name="remember-me"
                        checked={credentials.rememberMe}
                        onCheckedChange={() => {
                          setCredentials(l => ({ ...l, rememberMe: !l.rememberMe }));
                        }}
                        disabled={isLoading}
                      />
                      <FieldContent>
                        <FieldLabel htmlFor="remember-me" className="text-sm font-normal">
                          Remember me
                        </FieldLabel>
                      </FieldContent>
                    </Field>
                  </div>

                  <Button className="h-10 w-full" disabled={isLoading}>
                    {isLoading && <Spinner />}
                    {isLoading ? "Signing in..." : "Sign in"}
                  </Button>
                </FieldGroup>
                <Button className="mt-4 ml-auto mr-auto text-center w-full" variant="link" asChild>
                  <Link href="/reset-password">Reset Password</Link>
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              Access is limited to authorized municipal personnel.
            </p>
          </div>
        </div>
      </section>

      <section className="relative hidden min-h-svh max-h-svh shrink-0 lg:block">
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

type SigninPageState = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type SignInApiResponse = {
  ok: true;
  data: {
    twoFactorRequired?: boolean;
  };
};
