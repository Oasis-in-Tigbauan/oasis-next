"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";

type RouteMeta = {
  section: string;
  title: string;
  breadcrumbLabel?: string;
};

const routeMetaList: Array<{
  matcher: string | RegExp;
  meta: RouteMeta;
}> = [
  { matcher: "/dashboard", meta: { section: "Overview", title: "Dashboard", breadcrumbLabel: "Dashboard" } },
  { matcher: "/dashboard/esre", meta: { section: "Worksheets", title: "ESRE", breadcrumbLabel: "ESRE" } },
  { matcher: "/dashboard/supplemental", meta: { section: "Worksheets", title: "Supplemental", breadcrumbLabel: "Supplemental" } },
  { matcher: "/dashboard/aip", meta: { section: "Worksheets", title: "Annual Investment Program", breadcrumbLabel: "AIP" } },
  { matcher: "/dashboard/lbac", meta: { section: "Worksheets", title: "LBAC Dashboard", breadcrumbLabel: "LBAC" } },
  { matcher: "/dashboard/lbac/office", meta: { section: "Worksheets", title: "LBAC Quarterly Reports", breadcrumbLabel: "LBAC Office" } },
  { matcher: "/dashboard/lbac/data", meta: { section: "Worksheets", title: "LBAC Data", breadcrumbLabel: "LBAC Data" } },
  { matcher: "/dashboard/saaob", meta: { section: "Worksheets", title: "SAAOB Dashboard", breadcrumbLabel: "SAAOB" } },
  { matcher: "/dashboard/saaob/office", meta: { section: "Worksheets", title: "SAAOB Office View", breadcrumbLabel: "SAAOB Office" } },
  { matcher: "/dashboard/saaob/data", meta: { section: "Worksheets", title: "SAAOB Management", breadcrumbLabel: "SAAOB Management" } },
  { matcher: "/dashboard/saaob/accounts-summary", meta: { section: "Worksheets", title: "SAAOB Summary Editor", breadcrumbLabel: "SAAOB Summary" } },
  { matcher: "/dashboard/obr", meta: { section: "Worksheets", title: "OBR Dashboard", breadcrumbLabel: "OBR" } },
  { matcher: "/dashboard/obr/requests", meta: { section: "Worksheets", title: "OBR Requests", breadcrumbLabel: "Requests" } },
  { matcher: "/dashboard/obr/approvals", meta: { section: "Worksheets", title: "OBR Approvals", breadcrumbLabel: "Approvals" } },
  { matcher: "/dashboard/obr/disbursement", meta: { section: "Worksheets", title: "OBR Disbursement", breadcrumbLabel: "Disbursement" } },
  { matcher: "/dashboard/obr/disbursement/manage", meta: { section: "Worksheets", title: "Manage Disbursements", breadcrumbLabel: "Manage Disbursements" } },
  { matcher: "/dashboard/obr/management", meta: { section: "Worksheets", title: "Create OBR Items", breadcrumbLabel: "Create Items" } },
  { matcher: "/dashboard/obr/management/manage", meta: { section: "Worksheets", title: "Manage OBR Items", breadcrumbLabel: "Manage Items" } },
  { matcher: "/dashboard/obr/main/create", meta: { section: "Worksheets", title: "Create OBR From Requests", breadcrumbLabel: "Create OBR" } },
  { matcher: "/dashboard/obr/main/manage", meta: { section: "Worksheets", title: "Manage OBR Main Data", breadcrumbLabel: "OBR Main Data" } },
  { matcher: "/dashboard/forms/purchasing", meta: { section: "Office Forms", title: "Purchase Request and Purchase Order", breadcrumbLabel: "PR / PO" } },
  { matcher: "/dashboard/forms/ppmp", meta: { section: "Office Forms", title: "Project Procurement Management Plan", breadcrumbLabel: "PPMP" } },
  { matcher: "/dashboard/forms/elec", meta: { section: "Office Forms", title: "DV-Elec", breadcrumbLabel: "DV-Elec" } },
  { matcher: "/dashboard/forms/travel-order", meta: { section: "Office Forms", title: "Travel Orders", breadcrumbLabel: "Travel Orders" } },
  { matcher: "/dashboard/settings/approvals", meta: { section: "Administration", title: "Account Approvals", breadcrumbLabel: "Approvals" } },
  { matcher: "/dashboard/settings/invitations", meta: { section: "Administration", title: "Invitations", breadcrumbLabel: "Invitations" } },
  { matcher: "/dashboard/settings/users", meta: { section: "Administration", title: "User Management", breadcrumbLabel: "Users" } },
  { matcher: "/dashboard/settings/roles", meta: { section: "Administration", title: "Office and Role Management", breadcrumbLabel: "Roles" } },
  { matcher: /^\/dashboard\/settings\/roles\/.+\/roles$/, meta: { section: "Administration", title: "Office and Role Editor", breadcrumbLabel: "Role Editor" } },
  { matcher: "/dashboard/settings/expense-types", meta: { section: "Data Management", title: "Expense Types", breadcrumbLabel: "Expense Types" } },
  { matcher: "/dashboard/settings/expense-codes", meta: { section: "Data Management", title: "Expense Codes", breadcrumbLabel: "Expense Codes" } },
  { matcher: "/dashboard/settings/office-codes", meta: { section: "Data Management", title: "Office Codes", breadcrumbLabel: "Office Codes" } },
  { matcher: "/dashboard/settings/fund-types", meta: { section: "Data Management", title: "Fund Types", breadcrumbLabel: "Fund Types" } },
  { matcher: "/dashboard/settings/procurement-types", meta: { section: "Data Management", title: "Procurement Types", breadcrumbLabel: "Procurement Types" } },
  { matcher: "/dashboard/settings", meta: { section: "Administration", title: "Settings", breadcrumbLabel: "Settings" } },
];

export default function AppTopbar() {
  const pathname = usePathname();

  const meta = useMemo<RouteMeta>(() => {
    const matchedRoute = routeMetaList.find(({ matcher }) =>
      typeof matcher === "string" ? matcher === pathname : matcher.test(pathname),
    );

    return matchedRoute?.meta ?? {
      section: "Workspace",
      title: "Dashboard",
      breadcrumbLabel: "Dashboard",
    };
  }, [pathname]);

  return (
    <header className="sticky top-0 z-20 border-b mb-4 border-[#D8E2EC] bg-white/92 backdrop-blur supports-backdrop-filter:bg-white/84">
      <div className="flex h-16 items-center gap-3 px-4 md:px-6">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="size-8 rounded-md border border-[#D8E2EC] bg-white text-[#52657A] shadow-none hover:bg-[#F7FAFC] hover:text-[#022551]" />
          <div className="hidden h-5 w-px bg-[#D8E2EC] md:block" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#52657A]">
              {meta.section}
            </span>
            <span className="size-1 rounded-full bg-[#AEBFD0]" />
            <Breadcrumb className="hidden min-w-0 lg:block">
              <BreadcrumbList className="flex-nowrap text-[11px] text-[#52657A]">
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {meta.breadcrumbLabel && meta.breadcrumbLabel !== "Dashboard" && (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="truncate text-[#52657A]">
                        {meta.breadcrumbLabel}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <p className="mt-0.5 truncate text-[1.1rem] font-semibold leading-6 text-[#122033] md:text-[1.2rem]">
            {meta.title}
          </p>
        </div>
      </div>
    </header>
  );
}
