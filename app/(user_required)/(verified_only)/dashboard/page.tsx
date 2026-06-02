"use client";

import {
  Banknote,
  FileText,
  Globe,
  HandHeart,
  Map,
  Siren,
  UserPlus,
  Users,
} from "lucide-react";
import useSWR from "swr";

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

type HomeCard = {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconTone: DashboardHomeIconTone;
  href?: string;
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

  return (
    <div className="relative flex min-h-[calc(100svh-4rem)] flex-1 flex-col -mt-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/assets/bg-gray-waves.png')] bg-cover bg-center bg-no-repeat"
      />
      <div className="relative z-10 flex flex-1 flex-col gap-6 p-4 pt-4 md:p-6">
        <section className="mx-auto w-full max-w-5xl space-y-3 mt-4">
          <div className="flex flex-col gap-1 text-center">
            <Typography variant="h2" className="text-[#022551]">Welcome {roleName}!</Typography>
            <Typography variant="p" className="text-muted-foreground">
              Priority request movement for {roleName}. Review actions that need attention before moving into worksheet work.
            </Typography>
          </div>

          <DashboardNotifications />
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {homeCards.map((card) => (
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
      </div>
    </div>
  );
}

const homeCards: HomeCard[] = [
  {
    title: "DV",
    description: "Review and authorize departmental fiscal requests.",
    icon: Banknote,
    iconTone: "primary",
  },
  {
    title: "OBR",
    description: "Oversee urban development and infrastructure projects.",
    icon: Map,
    iconTone: "accent",
  },
  {
    title: "DV-ELEC",
    description: "Coordinate with local leaders and resident initiatives.",
    icon: HandHeart,
    iconTone: "primary",
  },
  {
    title: "DV-ENGR",
    description: "Monitor public safety and crisis response protocols.",
    icon: Siren,
    iconTone: "accent",
  },
  {
    title: "PR",
    description: "Prepare agendas and record minutes for council sessions.",
    icon: Users,
    iconTone: "accent",
  },
  {
    title: "Travel/Order",
    description: "Audit municipal bylaws and legislative updates.",
    icon: FileText,
    iconTone: "primary",
  },
  {
    title: "Pass",
    description: "Manage department hiring and personnel adjustments.",
    icon: UserPlus,
    iconTone: "accent",
  },
  {
    title: "Leave",
    description: "Review press releases and media inquiries.",
    icon: Globe,
    iconTone: "primary",
  },
];
