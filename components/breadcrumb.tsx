"use client";

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

export default function BreadcrumbComponent() {
  const pathname = usePathname();

  const routeName = useMemo(() => {
    if (pathname === "/dashboard") return "Home";
    if (pathname === "/dashboard/esre") return "Electronic Statement of Receipts and Expenditures (ESRE)";
    if (pathname === "/dashboard/settings/approvals") return "Account Approvals";
    if (pathname === "/dashboard/settings/roles") return "Offices & Role Management";
    if (pathname === "/dashboard/settings/invitations") return "Invitations";
    if (pathname === "/dashboard/settings/users") return "User Management";
    if (pathname === "/dashboard/settings/expense-types") return "Data: Expense Types Management";
    if (pathname === "/dashboard/settings/fund-types") return "Data: Fund Types Management";
    if (pathname === "/dashboard/settings/office-codes") return "Data: Office Codes Management";
    if (/^\/dashboard\/settings\/roles\/.+\/roles$/.test(pathname)) return "Office & Role Editor";
  }, [pathname]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/dashboard">
            Dashboard
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage>{routeName}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
