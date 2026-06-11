"use client";

import {
  CalendarDays,
  Car,
  PlugZap,
  ShoppingBasket,
  ShoppingCart,
} from "lucide-react";
import useSWR from "swr";

import * as permissions from "@/lib/db/permissions";
import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  UserResponse,
} from "@/lib/http/client/responses";

import DashboardHomeCard, { type DashboardHomeIconTone } from "@/components/dashboard-home-card";
import DashboardNotifications from "@/components/dashboard-notifications";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

type HomeCardDefinition = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconTone: DashboardHomeIconTone;
  href: string;
  isVisible: (permissionSet: Set<permissions.Permissions>) => boolean;
};

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

  const roleName = data.data.data.office.role.name;
  const permissionSet = new Set(data.data.data.office.role.permissions);
  const visibleCards = homeCardDefinitions.filter((card) => card.isVisible(permissionSet));

  return (
    <div className="relative flex h-[calc(100svh-4rem-1px)] min-h-0 shrink-0 flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/assets/bg-gray-waves.png')] bg-cover bg-center bg-no-repeat"
      />
      <div className="relative z-10 flex flex-1 flex-col gap-6 p-4 pt-4 md:p-6">
        <section className="mx-auto mt-4 w-full max-w-5xl space-y-6">
          <div className="flex flex-col gap-1 text-center">
            <Typography variant="h2" className="text-[#022551]">Welcome {roleName}!</Typography>
            <Typography variant="p" className="text-muted-foreground">
              Priority request movement for {roleName}. Review actions that need attention before moving into worksheet work.
            </Typography>
          </div>

          <DashboardNotifications />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCards.map((card) => (
              <DashboardHomeCard
                key={card.title}
                title={card.title}
                description={card.description}
                icon={card.icon}
                iconTone={card.iconTone}
                href={card.href}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

const homeCardDefinitions: HomeCardDefinition[] = [
  {
    title: "Leave Application",
    description: "Leave requests & approvals",
    icon: CalendarDays,
    iconTone: "primary",
    href: "/dashboard/forms/leave",
    isVisible: () => true,
  },
  {
    title: "PR/PO Form",
    description: "Purchase requisitions & orders",
    icon: ShoppingBasket,
    iconTone: "accent",
    href: "/dashboard/forms/purchasing",
    isVisible: (permissionSet) => permissionSet.has(permissions.PURCHASING_REQUEST_MANAGE),
  },
  {
    title: "PPMP",
    description: "Project procurement planning",
    icon: ShoppingCart,
    iconTone: "primary",
    href: "/dashboard/forms/ppmp",
    isVisible: (permissionSet) => permissionSet.has(permissions.PPMP_READ),
  },
  {
    title: "DV-Elec",
    description: "Electricity disbursement vouchers",
    icon: PlugZap,
    iconTone: "accent",
    href: "/dashboard/forms/elec",
    isVisible: (permissionSet) => permissionSet.has(permissions.OBR_DISBURSEMENT_CREATE),
  },
  {
    title: "Travel Orders",
    description: "Travel requests & itineraries",
    icon: Car,
    iconTone: "primary",
    href: "/dashboard/forms/travel-order",
    isVisible: (permissionSet) =>
      permissionSet.has(permissions.TRAVEL_READ)
      || permissionSet.has(permissions.TRAVEL_WRITE)
      || permissionSet.has(permissions.TRAVEL_APPROVER),
  },
];
