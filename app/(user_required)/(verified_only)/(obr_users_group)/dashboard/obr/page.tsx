"use client";

import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardList,
  FolderCog,
  Wallet,
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

  const menuItems = allMenuItems.filter(item =>
    item.required.some(required => permissionSet.has(required)),
  );

  return (
    <div className="p-4 pt-0 w-full">
      <div className="w-full flex gap-4">
        <Typography variant="h3" className="mb-4 grow">OBR Dashboard</Typography>
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
              <CardTitle>No Available OBR Modules</CardTitle>
              <CardDescription>
                You do not currently have permissions for any OBR pages. Contact an administrator if access is expected.
              </CardDescription>
            </CardHeader>
          </Card>
        )
      }
    </div>
  );
}

const allMenuItems: Array<MenuItem> = [
  {
    title: "Requests",
    description: "View and create OBR requests for your office.",
    href: "/dashboard/obr/requests",
    icon: ClipboardList,
    required: [
      permissions.OBR_REQUEST_READ,
      permissions.OBR_REQUEST_CREATE,
    ],
  },
  {
    title: "Approvals",
    description: "Review pending requests and update approval states.",
    href: "/dashboard/obr/approvals",
    icon: BadgeCheck,
    required: [
      permissions.OBR_APPROVER_BASIC_READ,
      permissions.OBR_APPROVER_BASIC_WRITE,
      permissions.OBR_APPROVER_ADVANCED_READ,
      permissions.OBR_APPROVER_ADVANCED_WRITE,
      permissions.OBR_APPROVER_BASIC_HIGH_WRITE,
    ],
  },
  {
    title: "Disbursements",
    description: "Create and maintain disbursement vouchers from approved requests.",
    href: "/dashboard/obr/disbursement",
    primaryLabel: "Create",
    secondaryHref: "/dashboard/obr/disbursement/manage",
    secondaryLabel: "Manage",
    icon: Wallet,
    required: [
      permissions.OBR_DISBURSEMENT_CREATE,
    ],
  },
  {
    title: "Management",
    description: "Open OBR office-only and worksheet management tools.",
    href: "/dashboard/obr/management",
    primaryLabel: "Create",
    secondaryHref: "/dashboard/obr/management/manage",
    secondaryLabel: "Manage",
    icon: FolderCog,
    required: [
      permissions.OBR_APPROVER_BASIC_READ,
    ],
  },
  {
    title: "Main Data",
    description: "Open OBR administrative and worksheet management tools.",
    href: "/dashboard/obr/main/create",
    primaryLabel: "Create",
    secondaryHref: "/dashboard/obr/main/manage",
    secondaryLabel: "Manage",
    icon: FolderCog,
    required: [
      permissions.OBR_MANAGEMENT_READ,
      permissions.OBR_MANAGEMENT_WRITE,
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
