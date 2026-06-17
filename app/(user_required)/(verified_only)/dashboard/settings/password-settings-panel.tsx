"use client";

import { Check, Eye, EyeOff, X } from "lucide-react";
import { type SyntheticEvent, useMemo, useState } from "react";

import { $fetch } from "@/lib/http/client/fetch";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const PASSWORD_REQUIREMENTS = [
  { label: "At least 8 characters", test: (value: string) => value.length >= 8 },
  { label: "At least 2 lowercase", regex: /(.*[a-z]){2,}/ },
  { label: "At least 2 uppercase", regex: /(.*[A-Z]){2,}/ },
  { label: "At least 2 numbers", regex: /(.*\d){2,}/ },
  { label: "At least 2 symbols", regex: /(.*[!@#$%^&*(),.?":{}|<>]){2,}/ },
] as const;

function isStrongPassword(value: string): boolean {
  if (!value || value.trim().length === 0 || value.length < 8) {
    return false;
  }

  return (
    (value.match(/[a-z]/g) ?? []).length >= 2
    && (value.match(/[A-Z]/g) ?? []).length >= 2
    && (value.match(/[0-9]/g) ?? []).length >= 2
    && (value.match(/[!"#$%&'()*+,-./:;<=>?@[\\\]^_`{|}~]/g) ?? []).length >= 2
  );
}

export default function PasswordSettingsPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [onNewPasswordFocus, setOnNewPasswordFocus] = useState(false);
  const [credentials, setCredentials] = useState<ChangePasswordFormState>({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const requirements = useMemo(
    () => PASSWORD_REQUIREMENTS.map((req) => ({
      label: req.label,
      isMet: "test" in req
        ? req.test(credentials.newPassword)
        : req.regex.test(credentials.newPassword),
    })),
    [credentials.newPassword],
  );

  const onFieldUpdate = (
    e: SyntheticEvent<HTMLInputElement>,
    key: keyof ChangePasswordFormState,
  ) => {
    setCredentials((prev) => ({
      ...prev,
      [key]: (e.target as HTMLInputElement).value,
    }));
  };

  const onSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (credentials.newPassword !== credentials.confirmPassword) {
      setErrorMessage("New password and confirmation do not match.");
      return;
    }

    if (!isStrongPassword(credentials.newPassword)) {
      setErrorMessage(
        "Password must contain at least 2 lowercase, uppercase, numbers and symbols.",
      );
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await $fetch("/api/account/change-password", {
        method: "POST",
        body: {
          oldPassword: credentials.oldPassword,
          newPassword: credentials.newPassword,
        },
      });

      if (error) {
        setSuccessMessage(null);
        setErrorMessage(
          typeof error.message === "string" && error.message.length > 0
            ? error.message
            : "Unable to change your password. Please try again.",
        );
        return;
      }

      setCredentials({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setSuccessMessage("Your password has been changed successfully.");
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="grid w-full max-w-3xl grid-cols-[11rem_minmax(0,1fr)] gap-x-6 gap-y-5"
    >
      <div className="col-span-2 space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Change password</h2>
        <p className="text-sm text-muted-foreground">
          Update your password. You will be signed out of all devices after saving.
        </p>
      </div>

      {successMessage && (
        <div className="col-span-2 rounded-lg border border-green-300 bg-green-200 px-3 py-2 text-sm text-foreground">
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="col-span-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <FieldGroup className="contents">
        <Field orientation="horizontal" className="contents">
          <FieldLabel
            htmlFor="old-password"
            className="w-auto shrink-0 self-center text-sm font-normal"
          >
            Current password
          </FieldLabel>
          <FieldContent className="min-w-0">
            <div className="relative">
              <Input
                id="old-password"
                className="pr-9"
                type={showCurrentPassword ? "text" : "password"}
                autoComplete="current-password"
                value={credentials.oldPassword}
                onInput={(e) => onFieldUpdate(e, "oldPassword")}
                disabled={isLoading}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => setShowCurrentPassword((v) => !v)}
                disabled={isLoading}
                aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
              >
                {showCurrentPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </FieldContent>
        </Field>

        <Field orientation="horizontal" className="contents">
          <FieldLabel
            htmlFor="new-password"
            className="w-auto shrink-0 self-start pt-2 text-sm font-normal"
          >
            New password
          </FieldLabel>
          <FieldContent className="min-w-0">
            <div className="relative">
              <Input
                id="new-password"
                className="pr-9"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                value={credentials.newPassword}
                onFocus={() => setOnNewPasswordFocus(true)}
                onBlur={() => setOnNewPasswordFocus(false)}
                onInput={(e) => onFieldUpdate(e, "newPassword")}
                disabled={isLoading}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => setShowNewPassword((v) => !v)}
                disabled={isLoading}
                aria-label={showNewPassword ? "Hide new password" : "Show new password"}
              >
                {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {onNewPasswordFocus && (
              <ul className="mt-2 grid grid-cols-1 gap-1.5">
                {requirements.map((req) => (
                  <li
                    key={req.label}
                    className="flex items-center gap-2 text-sm transition-colors"
                  >
                    {req.isMet ? (
                      <Check className="size-4 text-green-500" />
                    ) : (
                      <X className="size-4 text-muted-foreground/50" />
                    )}
                    <span
                      className={
                        req.isMet ? "text-foreground" : "text-muted-foreground"
                      }
                    >
                      {req.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </FieldContent>
        </Field>

        <Field orientation="horizontal" className="contents">
          <FieldLabel
            htmlFor="confirm-password"
            className="w-auto shrink-0 self-start pt-2 text-sm font-normal"
          >
            Confirm new password
          </FieldLabel>
          <FieldContent className="min-w-0">
            <div className="relative">
              <Input
                id="confirm-password"
                className="pr-9"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                value={credentials.confirmPassword}
                onInput={(e) => onFieldUpdate(e, "confirmPassword")}
                disabled={isLoading}
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                onClick={() => setShowConfirmPassword((v) => !v)}
                disabled={isLoading}
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <FieldDescription>
              Re-enter your new password to confirm.
            </FieldDescription>
          </FieldContent>
        </Field>
      </FieldGroup>

      <div className="col-start-2">
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Spinner />}
          {isLoading ? "Saving..." : "Change password"}
        </Button>
      </div>
    </form>
  );
}

type ChangePasswordFormState = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};
