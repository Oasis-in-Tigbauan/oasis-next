"use client";

import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function PendingPage() {
    // Main render.
    return (
        <div className="flex flex-col gap-6">
            <div>
                <div className="flex flex-col items-center gap-4 text-center">
                    <Spinner className="size-16" />
                    <h1 className="text-2xl font-bold">Approval in Progress...</h1>
                    <p className="text-muted-foreground text-sm text-balance mb-4">
                        Please wait until your account is approved by administrator.
                    </p>
                    <Button
                        className="w-full bg-red-600 hover:bg-red-700 text-white hover:text-white"
                        variant="outline"
                        onClick={() => redirect("/auth/signout")}
                    >
                        Sign-out
                    </Button>
                </div>
            </div>
        </div>
    );
}
