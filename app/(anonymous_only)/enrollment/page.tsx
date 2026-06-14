"use client";

import { Check, LockKeyhole, User, X } from "lucide-react";
import { type SyntheticEvent, useMemo, useState } from "react";
import { redirect, RedirectType, useSearchParams } from "next/navigation";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  EnrollmentEligibilityResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import ErrorTextRenderer from "@/components/error-text-renderer";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import Template from "@/common/auth/template";

export default function SignupPage() {
  const searchParams = useSearchParams();
  const eligibilityToken = searchParams.get("token");

  const [onFocus, setOnFocus] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [enrollmentFields, setEnrollmentFields] = useState<EnrollmentFormState>({
    fullName: "",
    password: "",
    confirmPassword: "",
  });

  const requirements = useMemo(() => [
    { label: "At least 2 lowercase", regex: /(.*[a-z]){2,}/ },
    { label: "At least 2 uppercase", regex: /(.*[A-Z]){2,}/ },
    { label: "At least 2 numbers", regex: /(.*\d){2,}/ },
    { label: "At least 2 symbols", regex: /(.*[!@#$%^&*(),.?":{}|<>]){2,}/ },
  ], []);

  // Fetch data from the API and see if the user is eligible to enroll.
  const { data, error, isLoading } = useSWR<BetterFetchResponse<EnrollmentEligibilityResponse, ApiResponseException>>(
    eligibilityToken ? `/api/enrollment/eligibility?token=${eligibilityToken}` : null,
    $fetch,
  );

  // No token
  if (!eligibilityToken) {
    return (
      <Template>
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-col items-center gap-4 text-center">
              <X className="size-16" />
              <h1 className="text-2xl font-bold">Oops!</h1>
              <p className="text-muted-foreground text-sm text-balance">
                Invalid Token! You need an token for you to enroll.
              </p>
            </div>
          </div>
        </div>
      </Template>
    );
  }

  // Failed or errored.
  if (error || data?.error) {
    return (
      <Template>
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-col items-center gap-4 text-center">
              <X className="size-16" />
              <h1 className="text-2xl font-bold">Oops!</h1>
              <ErrorTextRenderer
                className="text-muted-foreground text-sm text-balance"
                message={data?.error?.details || "Unknown Error Occurred"}
              />
            </div>
          </div>
        </div>
      </Template>
    );
  }

  // Loading...
  if (isLoading) {
    return (
      <Template>
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex flex-col items-center gap-4 text-center">
              <Spinner className="size-16" />
              <p className="text-muted-foreground text-sm text-balance">
                Please wait while we check your invitation...
              </p>
            </div>
          </div>
        </div>
      </Template>
    );
  }

  const handleInput = (e: SyntheticEvent<HTMLInputElement>, key: keyof EnrollmentFormState) => {
    setEnrollmentFields(l => ({ ...l, [key]: (e.target as HTMLInputElement).value }));
  };

  const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSubmitting(true);
    try {
      const result = await $fetch("/api/enrollment/enroll", {
        method: "POST",
        body: {
          fullName: enrollmentFields.fullName,
          password: enrollmentFields.password,
          token: data?.data?.data.token || "",
        },
      });
      if (result.error) {
        alert("Failed to enroll. Please try again.");
        return;
      }

      // Redirect after a successful enrollment
      redirect("/enrollment/pending", RedirectType.replace);
    }
    finally {
      setIsSubmitting(false);
    }
  };

  // Main render.
  return (
    <Template>
      <div className="flex min-h-full items-center justify-center py-10">
        <div className="w-full max-w-[420px]">
          <div className="rounded-2xl border bg-card p-6 shadow-[0_20px_70px_-45px_oklch(0.35_0.08_258)] sm:p-8">
            <form onSubmit={handleSubmit}>
              <FieldGroup className="gap-5">
                <div className="space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight">
                    Enroll your account
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Fill in the form below to complete your municipal account setup.
                  </p>
                </div>

                <Field>
                  <FieldLabel htmlFor="name">Full Name</FieldLabel>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      className="h-10 pl-9"
                      type="text"
                      placeholder="John Doe"
                      value={enrollmentFields.fullName}
                      onInput={e => handleInput(e, "fullName")}
                      disabled={isSubmitting}
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
                      value={enrollmentFields.password}
                      onFocus={() => setOnFocus(true)}
                      onBlur={() => setOnFocus(false)}
                      onInput={e => handleInput(e, "password")}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  {
                    onFocus && (
                      <ul className="grid grid-cols-1 gap-2">
                        {requirements.map((req, index) => {
                          const isMet = req.regex.test(enrollmentFields.password);
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
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      className="h-10 pl-9"
                      type="password"
                      value={enrollmentFields.confirmPassword}
                      onInput={e => handleInput(e, "confirmPassword")}
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <FieldDescription>Please confirm your password.</FieldDescription>
                </Field>

                <Button className="h-10 w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Spinner />}
                  {isSubmitting ? "Creating account..." : "Create Account"}
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

type EnrollmentFormState = {
  fullName: string;
  password: string;
  confirmPassword: string;
};
