"use client";

import Link from "next/link";
import {
  ArrowRight,
  FolderCog,
} from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  UserResponse,
} from "@/lib/http/client/responses";
import * as permissions from "@/lib/db/permissions";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";
import SaaobReadOnlySummary from "./saaob-read-only-summary";

export default function Page() {
  const { data, error, isLoading } = useSWR<BetterFetchResponse<UserResponse, ApiResponseException>>(
    "/api/account/me",
    $fetch,
  );

  if (isLoading) {
    return (<Loading />);
  }

  if (error || data?.error || !data?.data?.data) {
    return (<DeadHamster />);
  }

  const permissionSet = new Set(data.data.data.office.role.permissions);
  const canReadSaaobData = permissionSet.has(permissions.SAAOB_DATA_READ);

  const menuItems = allMenuItems.filter(item =>
    item.required.every(required => permissionSet.has(required)),
  );

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4">
        <Typography variant="h3" className="mb-4 grow">SAAOB Dashboard</Typography>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {
          menuItems.map(item => {
            const Icon = item.icon;

            return (
              <Card key={item.title} className="justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <CardTitle>{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                    <div className="rounded-md border p-2 text-muted-foreground">
                      <Icon className="size-5" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <Badge variant="secondary">Available</Badge>
                </CardContent>
                <CardFooter className="flex flex-row gap-2">
                  <Button asChild className="grow">
                    <Link href={item.href}>
                      {item.primaryLabel ?? "Go to page"}
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  {item.secondaryHref && (
                    <Button asChild variant="outline" className="grow">
                      <Link href={item.secondaryHref}>
                        {item.secondaryLabel ?? item.secondaryHref}
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })
        }
      </div>

      {
        menuItems.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No Available SAAOB Modules</CardTitle>
              <CardDescription>
                You do not currently have permissions for any SAAOB pages. Contact an administrator if access is expected.
              </CardDescription>
            </CardHeader>
          </Card>
        )
      }

      {canReadSaaobData && (
        <div className="mt-6">
          <Typography variant="h4" className="mb-3">Summary of Accounts</Typography>
          <SaaobReadOnlySummary />
        </div>
      )}
    </div>
  );
}

const allMenuItems: Array<MenuItem> = [
  {
    title: "Office",
    description: "View office specific SAAOB for your office.",
    href: "/dashboard/saaob/office",
    icon: FolderCog,
    required: [
      permissions.SAAOB_OFFICE_READ,
    ],
  },
  {
    title: "Main Data",
    description: "Manage SAAOB Data",
    href: "/dashboard/saaob/data",
    icon: FolderCog,
    required: [
      permissions.SAAOB_DATA_READ,
      permissions.SAAOB_DATA_WRITE,
    ],
  },
  {
    title: "Summary of Accounts",
    description: "Manage Summary of Accounts aggregates",
    href: "/dashboard/saaob/accounts-summary",
    icon: FolderCog,
    required: [
      permissions.SAAOB_DATA_READ,
      permissions.SAAOB_DATA_WRITE,
    ],
  },
];

type MenuItem = {
  title: string;
  description: string;
  href: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  required: permissions.Permissions[];
}
