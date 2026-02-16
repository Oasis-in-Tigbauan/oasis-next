"use client";

import { Check, X } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import Image from "next/image";

export default function SignupPage() {
    const searchParams = useSearchParams();
    const eligibilityToken = searchParams.get("token");

    const [onFocus, setOnFocus] = useState(false);
    const [enrollmentFields, setEnrollmentFields] = useState<EnrollmentFormState>({
        fullName: "",
        email: "",
        password: "",
        confirmPassword: "",
        positionId: "unassigned",
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
        );
    }

    // Failed or errored.
    if (error || data?.error) {
        return (
            <div className="flex flex-col gap-6">
                <div>
                    <div className="flex flex-col items-center gap-4 text-center">
                        <X className="size-16" />
                        <h1 className="text-2xl font-bold">Oops!</h1>
                        <p className="text-muted-foreground text-sm text-balance">
                            {
                                (data?.error?.errors || [{ message: "Something went wrong!" }]).map((x, i) => (
                                    <span key={i}>{(x as { message: string }).message}</span>
                                ))
                            }
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Loading...
    if (isLoading) {
        return (
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
        );
    }

    const handleInput = (e: SyntheticEvent<HTMLInputElement>, key: keyof EnrollmentFormState) => {
        setEnrollmentFields(l => ({ ...l, [key]: (e.target as HTMLInputElement).value }));
    };

    const handleSubmit = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();

        const result = await $fetch("/api/enrollment/enroll", {
            method: "POST",
            body: {
                fullName: enrollmentFields.fullName,
                email: enrollmentFields.email,
                password: enrollmentFields.password,
                token: data?.data?.data.token || "",
                positionId: enrollmentFields.positionId,
            },
        });
        if (result.error) {
            alert("Failed to enroll. Please try again.");
            return;
        }

        // Redirect after a successful enrollment
        redirect("/enrollment/pending", RedirectType.replace);
    };

    // Main render.
    return (
        <div className="grid min-h-svh lg:grid-cols-[60%_auto]">
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex justify-center gap-2 md:justify-start">
                    <a href="#" className="flex items-center gap-2 font-medium">
                        <div className="flex size-8 items-center justify-center rounded-md">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">
                                <path d="M489.1 129.8C449.2 129.8 415.8 155.5 405.4 194.1C387.2 136 339.9 129.8 320.4 129.8C300.6 129.8 253.6 136.1 235.1 194.1C224.7 155.5 191.7 129.8 151.4 129.8C102.4 129.8 63.9 163.7 63.9 207C63.9 236 68.1 240.3 141.1 440.5C163.5 501.1 208.9 509.9 233.8 509.9C273 509.9 303.8 490.4 319.7 455.9C335.6 490.7 366.4 510.2 405.6 510.2C430.6 510.2 476 501.1 498.3 440.5C574.9 231.9 575.8 234.9 575.8 213.3C576.4 165 539.8 129.8 488.9 129.8zM515.4 244.6L449.9 421.1C442 442.6 428.7 458.3 403.7 458.3C380.3 458.3 366.3 445.9 359.7 424.4L320.4 307L319.4 307L280.1 424.4C273.1 445.9 259.2 458 236.1 458C211.1 458 197.8 442.3 189.9 420.8L124.9 245.6C119.5 230.8 117 221.7 117 211.1C117 194.8 132.8 181.7 155.3 181.7C174 181.7 187.3 193.5 191.4 210.8L235.4 350.6L236.4 350.6L281.1 213.8C287.1 194.1 297.6 181.7 320.1 181.7C342.6 181.7 353 193.8 359.1 213.8L403.8 350.6L404.8 350.6L448.8 210.8C452.9 193.6 466.2 181.7 484.9 181.7C507.1 181.7 523.2 195 523.2 217.4C522.9 225.3 519.1 233.4 515.6 244.6z" />
                            </svg>
                        </div>
                        Wisdomous Solutions
                    </a>
                </div>
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
                            <FieldGroup>
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <h1 className="text-2xl font-bold">Enroll Your Account</h1>
                                    <p className="text-muted-foreground text-sm text-balance">
                                        Fill in the form below to enroll
                                    </p>
                                </div>
                                <Field>
                                    <FieldLabel htmlFor="officeName">Office you are assigned</FieldLabel>
                                    <Input
                                        id="officeName"
                                        type="text"
                                        value={data?.data?.data?.officeName}
                                        readOnly={true}
                                        className="text-muted-foreground/95"
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="positionId">Position to fill</FieldLabel>
                                    <Select
                                        value={enrollmentFields.positionId}
                                        onValueChange={v => setEnrollmentFields(l => ({ ...l, positionId: v }))}
                                    >
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select a Position to fill" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {
                                                (data?.data?.data?.assignablePositions || []).map((pos, i) => (
                                                    <SelectItem key={i} value={pos.id}>{pos.name}</SelectItem>
                                                ))
                                            }
                                        </SelectContent>
                                    </Select>
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="name">Full Name</FieldLabel>
                                    <Input
                                        id="name"
                                        type="text"
                                        placeholder="John Doe"
                                        value={enrollmentFields.fullName}
                                        onInput={e => handleInput(e, "fullName")}
                                        required
                                    />
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="email">Email</FieldLabel>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="m@example.com"
                                        value={enrollmentFields.email}
                                        onInput={e => handleInput(e, "email")}
                                        required
                                    />
                                    <FieldDescription>
                                        Please use the same email address you used to receive the invitation.
                                    </FieldDescription>
                                </Field>
                                <Field>
                                    <FieldLabel htmlFor="password">Password</FieldLabel>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={enrollmentFields.password}
                                        onFocus={() => setOnFocus(true)}
                                        onBlur={() => setOnFocus(false)}
                                        onInput={e => handleInput(e, "password")}
                                        required
                                    />
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
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        value={enrollmentFields.confirmPassword}
                                        onInput={e => handleInput(e, "confirmPassword")}
                                        required
                                    />
                                    <FieldDescription>Please confirm your password.</FieldDescription>
                                </Field>
                                <Field>
                                    <Button type="submit">
                                        Create Account
                                    </Button>
                                </Field>
                            </FieldGroup>
                        </form>
                    </div>
                </div>
            </div>
            <div className="bg-muted relative hidden lg:block">
                <Image
                    src="/assets/company-banner.svg"
                    alt="Image"
                    loading="eager"
                    width={672}
                    height={878}
                    className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
                />
            </div>
        </div>
    );
}

type EnrollmentFormState = {
    fullName: string;
    email: string;
    password: string;
    confirmPassword: string;
    positionId: string;
};
