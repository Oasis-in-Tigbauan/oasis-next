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
    if (pathname === "/dashboard/settings/expense-codes") return "Data: Expense Types Management";
    if (pathname === "/dashboard/settings/fund-types") return "Data: Fund Types Management";
    if (pathname === "/dashboard/settings/office-codes") return "Data: Office Codes Management";
    if (pathname === "/dashboard/obr") return "OBR: Dashboard";
    if (pathname === "/dashboard/obr/requests") return "OBR: Requests";
    if (pathname === "/dashboard/obr/approvals") return "OBR: Approvals";
    if (pathname === "/dashboard/obr/disbursement") return "OBR: Disbursement";
    if (pathname === "/dashboard/obr/disbursement/manage") return "OBR: Manage Disbursements";
    if (pathname === "/dashboard/obr/management") return "OBR: Create OBR Items";
    if (pathname === "/dashboard/obr/management/manage") return "OBR: Manage OBR Items";
    if (pathname === "/dashboard/obr/main/create") return "OBR: Create OBR from Requests";
    if (pathname === "/dashboard/obr/main/manage") return "OBR: Manage OBR Main Data";
    if (pathname === "/dashboard/supplemental") return "Supplemental";
    if (pathname === "/dashboard/aip") return "Annual Investment Program";
    if (pathname === "/dashboard/lbac") return "LBAC: Dashboard";
    if (pathname === "/dashboard/lbac/office") return "LBAC: Quarterly Reports";
    if (pathname === "/dashboard/lbac/data") return "LBAC: Data";
    if (pathname === "/dashboard/saaob") return "STATUS OF APPROPRIATION, ALLOTMENTS, OBLIGATION AND BALANCES";
    if (pathname === "/dashboard/saaob/office") return "STATUS OF APPROPRIATION, ALLOTMENTS, OBLIGATION AND BALANCES: Office View";
    if (pathname === "/dashboard/saaob/data") return "STATUS OF APPROPRIATION, ALLOTMENTS, OBLIGATION AND BALANCES: Management";
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
