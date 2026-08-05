'use client';

import {KeyRound, ShieldCheck} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {redirect, RedirectType} from 'next/navigation';
import {type SyntheticEvent, useState} from 'react';

import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Field, FieldContent, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {$fetch} from '@/lib/http/client/fetch';

export default function TwoFactorPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);

  const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const {error} = await $fetch('/api/auth/two-factor', {
        method: 'POST',
        body: {
          code,
          trustDevice,
        },
      });

      if (error) {
        setErrorMessage('The verification code you entered is incorrect.');
        return;
      }

      redirect('/auth/check', RedirectType.replace);
    } finally {
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
              Two-factor verification
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-[0_20px_70px_-45px_oklch(0.35_0.08_258)] sm:p-8">
              <form onSubmit={onSubmit}>
                <FieldGroup className="gap-5">
                  <div className="space-y-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      Enter verification code
                    </h1>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Open your authenticator app and enter the 6-digit code to continue.
                    </p>
                  </div>

                  {errorMessage && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                      {errorMessage}
                    </div>
                  )}

                  <Field>
                    <FieldLabel htmlFor="totp-code">Authentication code</FieldLabel>
                    <div className="relative">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="totp-code"
                        className="h-10 pl-9 tracking-widest"
                        placeholder="000000"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        autoComplete="one-time-code"
                        value={code}
                        onInput={(e) =>
                          setCode(
                            (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6),
                          )
                        }
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </Field>

                  <Field orientation="horizontal" className="gap-2">
                    <Checkbox
                      id="trust-device"
                      name="trust-device"
                      checked={trustDevice}
                      onCheckedChange={() => setTrustDevice((prev) => !prev)}
                      disabled={isLoading}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="trust-device" className="text-sm font-normal">
                        Trust this device for 30 days
                      </FieldLabel>
                    </FieldContent>
                  </Field>

                  <Button className="h-10 w-full" disabled={isLoading || code.length !== 6}>
                    {isLoading && <Spinner />}
                    {isLoading ? 'Verifying...' : 'Verify'}
                  </Button>
                </FieldGroup>
                <Button className="mt-4 ml-auto mr-auto text-center w-full" variant="link" asChild>
                  <Link href="/auth/signin">Back to sign in</Link>
                </Button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              Access is limited to authorized municipal personnel.
            </p>
          </div>
        </div>
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
