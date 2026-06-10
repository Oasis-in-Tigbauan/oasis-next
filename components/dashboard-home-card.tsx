"use client";

import Link from "next/link";
import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

const cardClassName =
  "flex flex-col items-center gap-3 rounded-xl border border-gray-200/80 bg-card p-6 text-center shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50/90";

const iconTones = {
  primary: {
    box: "bg-[#29639F]/12",
    icon: "text-[#29639F]",
  },
  accent: {
    box: "bg-[#FFB30F]/18 ring-1 ring-[#FFB30F]/30",
    icon: "text-[#FFB30F]",
  },
} as const;

type DashboardHomeCardProps = {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  iconTone?: DashboardHomeIconTone;
};

export default function DashboardHomeCard({
  title,
  description,
  icon: Icon,
  href,
  iconTone = "primary",
}: DashboardHomeCardProps) {
  const tone = iconTones[iconTone];

  const content = (
    <>
      <div className="flex items-center justify-center gap-2.5">
        <div className={cn("shrink-0 rounded-lg p-2", tone.box)}>
          <Icon className={cn("size-8", tone.icon)} />
        </div>
        <div className="text-left">
          <h3 className="font-semibold text-[#022551]">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>   
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cardClassName}>
        {content}
      </Link>
    );
  }

  return <div className={cardClassName}>{content}</div>;
}

export type DashboardHomeIconTone = keyof typeof iconTones;
