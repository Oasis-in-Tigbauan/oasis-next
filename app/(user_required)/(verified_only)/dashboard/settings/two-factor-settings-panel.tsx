'use client';

import {Copy, Eye, EyeOff, ShieldCheck, ShieldOff} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {useEffect, useState} from 'react';

import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {Field, FieldContent, FieldDescription, FieldGroup, FieldLabel} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import type {User} from '@/lib/accounts';
import {$fetch} from '@/lib/http/client/fetch';
import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

type SetupStep = 'idle' | 'password' | 'verify' | 'backup-codes' | 'disable';

type SetupData = {
  totpURI: string;
};

export default function TwoFactorSettingsPanel() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [step, setStep] = useState<SetupStep>('idle');
  const [password, setPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [code, setCode] = useState('');
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      setIsLoading(true);
      try {
        const {data, error} = await $fetch<GenericOkResponse<User>>('/api/account/me', {
          method: 'GET',
        });

        if (error || !data?.data) {
          setErrorMessage('Unable to load your account settings.');
          return;
        }

        setTwoFactorEnabled(data.data.twoFactorEnabled);
      } finally {
        setIsLoading(false);
      }
    };

    void loadStatus();
  }, []);

  const resetForm = () => {
    setPassword('');
    setCode('');
    setSetupData(null);
    setBackupCodes([]);
    setStep('idle');
    setErrorMessage(null);
  };

  const onSetupStart = () => {
    resetForm();
    setSuccessMessage(null);
    setStep('password');
  };

  const onDisableStart = () => {
    resetForm();
    setSuccessMessage(null);
    setStep('disable');
  };

  const onSetupPasswordSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const {data, error} = await $fetch<GenericOkResponse<SetupData>>(
        '/api/account/two-factor/setup',
        {
          method: 'POST',
          body: {password},
        },
      );

      const payload = data?.data;
      if (error || !payload?.totpURI) {
        setErrorMessage(
          typeof error?.message === 'string' && error.message.length > 0
            ? error.message
            : 'Unable to start two-factor setup. Check your password and try again.',
        );
        return;
      }

      setSetupData({totpURI: payload.totpURI});
      setStep('verify');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onVerifySubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const {data, error} = await $fetch<GenericOkResponse<{backupCodes: string[]}>>(
        '/api/account/two-factor/setup/verify',
        {
          method: 'POST',
          body: {code},
        },
      );

      if (error || !data?.data) {
        setErrorMessage('The verification code you entered is incorrect.');
        return;
      }

      setTwoFactorEnabled(true);
      setSetupData(null);
      setCode('');
      setBackupCodes(data.data.backupCodes ?? []);
      setStep('backup-codes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDisableSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const {error} = await $fetch('/api/account/two-factor/setup/disable', {
        method: 'POST',
        body: {password},
      });

      if (error) {
        setErrorMessage(
          typeof error?.message === 'string' && error.message.length > 0
            ? error.message
            : 'Unable to disable two-factor authentication. Check your password and try again.',
        );
        return;
      }

      setTwoFactorEnabled(false);
      setSuccessMessage('Two-factor authentication has been disabled.');
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const onBackupCodesDone = () => {
    setSuccessMessage(
      'Two-factor authentication has been enabled. Store your backup codes in a safe place.',
    );
    resetForm();
  };

  const copyBackupCodes = async () => {
    if (!backupCodes.length) return;

    await navigator.clipboard.writeText(backupCodes.join('\n'));
    setSuccessMessage('Backup codes copied to clipboard.');
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading two-factor settings...
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-3xl grid-cols-[11rem_minmax(0,1fr)] gap-x-6 gap-y-5">
      <div className="col-span-2 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          Add an extra layer of security using a time-based one-time password from an authenticator
          app.
        </p>
      </div>

      <div className="col-span-2 flex items-center gap-2">
        {twoFactorEnabled ? (
          <Badge variant="default" className="gap-1">
            <ShieldCheck className="size-3.5" />
            Enabled
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1">
            <ShieldOff className="size-3.5" />
            Disabled
          </Badge>
        )}
      </div>

      {successMessage && step !== 'backup-codes' && (
        <div className="col-span-2 rounded-lg border border-green-300 bg-green-200 px-3 py-2 text-sm text-foreground">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="col-span-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {step === 'idle' && !twoFactorEnabled && (
        <div className="col-span-2">
          <Button type="button" onClick={onSetupStart}>
            Set up two-factor authentication
          </Button>
        </div>
      )}

      {step === 'idle' && twoFactorEnabled && (
        <div className="col-span-2">
          <Button type="button" variant="destructive" onClick={onDisableStart}>
            Disable two-factor authentication
          </Button>
        </div>
      )}

      {step === 'password' && (
        <FieldGroup className="col-span-2 contents">
          <Field orientation="horizontal" className="contents">
            <FieldLabel
              htmlFor="setup-password"
              className="w-auto shrink-0 self-start pt-2 text-sm font-normal"
            >
              Current password
            </FieldLabel>
            <FieldContent className="min-w-0">
              <div className="relative">
                <Input
                  id="setup-password"
                  className="pr-9"
                  type={showCurrentPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  disabled={isSubmitting}
                  aria-label={
                    showCurrentPassword ? 'Hide current password' : 'Show current password'
                  }
                >
                  {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <FieldDescription>
                Confirm your password to generate a new authenticator setup.
              </FieldDescription>
            </FieldContent>
          </Field>
          <div className="col-start-2 flex gap-2">
            <Button
              type="button"
              onClick={() => void onSetupPasswordSubmit()}
              disabled={isSubmitting || password.length === 0}
            >
              {isSubmitting && <Spinner />}
              Continue
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </FieldGroup>
      )}

      {step === 'verify' && setupData && (
        <FieldGroup className="col-span-2 contents">
          <div className="col-span-2 space-y-4 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app, then enter the 6-digit code to confirm
              setup.
            </p>
            <div className="flex justify-center rounded-lg border bg-white p-4">
              <QRCodeSVG value={setupData.totpURI} size={180} />
            </div>
          </div>

          <Field orientation="horizontal" className="contents">
            <FieldLabel
              htmlFor="verify-code"
              className="w-auto shrink-0 self-center text-sm font-normal"
            >
              Verification code
            </FieldLabel>
            <FieldContent className="min-w-0">
              <Input
                id="verify-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="000000"
                className="tracking-widest"
                value={code}
                onInput={(e) =>
                  setCode((e.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6))
                }
                disabled={isSubmitting}
                required
              />
            </FieldContent>
          </Field>

          <div className="col-start-2 flex gap-2">
            <Button
              type="button"
              onClick={() => void onVerifySubmit()}
              disabled={isSubmitting || code.length !== 6}
            >
              {isSubmitting && <Spinner />}
              Enable two-factor authentication
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </FieldGroup>
      )}

      {step === 'backup-codes' && (
        <div className="col-span-2 space-y-4">
          <div className="rounded-lg border border-green-300/50 bg-green-50 px-4 py-3 dark:bg-green-950/20">
            <p className="text-sm font-medium">Two-factor authentication is enabled</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Save your backup codes below. Each code can only be used once. They will not be shown
              again.
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
            {backupCodes.map((backupCode) => (
              <li key={backupCode} className="rounded border bg-background px-2 py-1">
                {backupCode}
              </li>
            ))}
          </ul>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyBackupCodes()}
            >
              <Copy className="size-4" />
              Copy backup codes
            </Button>
            <Button type="button" onClick={onBackupCodesDone}>
              Done
            </Button>
          </div>
        </div>
      )}

      {step === 'disable' && (
        <FieldGroup className="col-span-2 contents">
          <Field orientation="horizontal" className="contents">
            <FieldLabel
              htmlFor="disable-password"
              className="w-auto shrink-0 self-start pt-2 text-sm font-normal"
            >
              Current password
            </FieldLabel>
            <FieldContent className="min-w-0">
              <div className="relative">
                <Input
                  id="disable-password"
                  className="pr-9"
                  type={showCurrentPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
                  disabled={isSubmitting}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  disabled={isSubmitting}
                  aria-label={
                    showCurrentPassword ? 'Hide current password' : 'Show current password'
                  }
                >
                  {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <FieldDescription>
                Confirm your password to disable two-factor authentication.
              </FieldDescription>
            </FieldContent>
          </Field>
          <div className="col-start-2 flex gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => void onDisableSubmit()}
              disabled={isSubmitting || password.length === 0}
            >
              {isSubmitting && <Spinner />}
              Disable two-factor authentication
            </Button>
            <Button type="button" variant="outline" onClick={resetForm} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </FieldGroup>
      )}
    </div>
  );
}
