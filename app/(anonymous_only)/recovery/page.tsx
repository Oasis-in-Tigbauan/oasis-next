"use client";

import Image from "next/image";
import React, { type SyntheticEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import Link from "next/link";

import { $fetch } from "@/lib/http/client/fetch";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export default function RecoveryPage() {
  const searchParams = useSearchParams();
  const recoveryToken = searchParams.get("token");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<RecoveryRequestPageState>({
    password: "",
    confirmPassword: "",
  });
  const [onFocus, setOnFocus] = useState(false);

  const requirements = useMemo(() => [
    { label: "At least 2 lowercase", regex: /(.*[a-z]){2,}/ },
    { label: "At least 2 uppercase", regex: /(.*[A-Z]){2,}/ },
    { label: "At least 2 numbers", regex: /(.*\d){2,}/ },
    { label: "At least 2 symbols", regex: /(.*[!@#$%^&*(),.?":{}|<>]){2,}/ },
  ], []);

  const onFieldUpdate = (e: SyntheticEvent<HTMLInputElement>, key: keyof RecoveryRequestPageState) => {
    setCredentials(l => ({ ...l, [key]: (e.target as HTMLInputElement).value }));
  };

  const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await $fetch<{ data: { message: string }}>("/api/auth/reset-password", {
        method: "POST",
        body: {
          password: credentials.password,
          token: recoveryToken,
        },
      });

      if (error) {
        setSuccessMessage(null);
        setErrorMessage("Invalid request. Check if the email is correct.");
        return;
      }

      if (data !== null && data !== undefined) {
        setErrorMessage(null);
        setSuccessMessage(data.data.message);
      }
    }
    finally {
      setIsLoading(false);
    }
  };

  if (!recoveryToken) {
    return (
      <Template>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[420px]">
            <div className="rounded-2xl border bg-card p-6 shadow-[0_20px_70px_-45px_oklch(0.35_0.08_258)] sm:p-8">
              <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Invalid token.
              </div>
            </div>
          </div>
        </div>
      </Template>
    );
  }

  return (
    <Template>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border bg-card p-6 shadow-[0_20px_70px_-45px_oklch(0.35_0.08_258)] sm:p-8">
            <form onSubmit={onSubmit}>
              <FieldGroup className="gap-5">
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Recover your Account
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Setup a new password for your account
                  </p>
                </div>

                {errorMessage && (
                  <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {errorMessage}
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-lg border border-green-300 bg-green-200 px-3 py-2 text-sm text-black">
                    {successMessage}<br />
                    Try logging in&nbsp;
                    <Button className="mt-4 ml-auto mr-auto text-center w-full" variant="link" asChild>
                      <Link href="/auth/signin">Sign-in</Link>
                    </Button>&nbsp;here.
                  </div>
                )}

                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    value={credentials.password}
                    onFocus={() => setOnFocus(true)}
                    onBlur={() => setOnFocus(false)}
                    onInput={e => onFieldUpdate(e, "password")}
                    required
                  />
                  {
                    onFocus && (
                      <ul className="grid grid-cols-1 gap-2">
                        {requirements.map((req, index) => {
                          const isMet = req.regex.test(credentials.password);
                          return (
                            <li key={index} className="flex items-center gap-2 text-sm transition-colors">
                              {isMet ? (
                                <Check className="w-4 h-4 text-green-500" />
                              ) : (
                                <X className="w-4 h-4 text-muted-foreground/50" />
                              )}
                              <span className={isMet ? "text-foreground" : "text-muted-foreground"}>
                                {req.label}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  }
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={credentials.confirmPassword}
                    onInput={e => onFieldUpdate(e, "confirmPassword")}
                    required
                  />
                  <FieldDescription>Please confirm your password.</FieldDescription>
                </Field>

                <Button className="h-10 w-full" disabled={isLoading}>
                  {isLoading && <Spinner />}
                  {isLoading ? "Setting..." : "Set a new password"}
                </Button>
              </FieldGroup>
            </form>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
            Access is limited to authorized municipal personnel.
          </p>
        </div>
      </div>
    </Template>
  );
}

function Template({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-svh overflow-x-auto bg-[oklch(0.985_0.006_255)] text-foreground lg:grid-cols-[auto_55%] xl:grid-cols-[60%_auto] dark:bg-background">
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

        {children}
      </section>

      <section className="relative hidden min-h-svh shrink-0 lg:block">
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

type RecoveryRequestPageState = {
  password: string;
  confirmPassword: string;
};
