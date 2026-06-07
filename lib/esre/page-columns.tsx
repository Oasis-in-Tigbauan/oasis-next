import type { ReactNode } from "react";

import type { EsreItemResponse } from "@/lib/http/client/responses";
import type { PageColumnDef, PageColumnGroup } from "@/lib/column-visibility";

export const ESRE_PAGE_STORAGE_KEY = "esre";

export type EsrePageColumnKey =
  | "date"
  | "checkNumber"
  | "fundingSource"
  | "dvOrPayrollNumber"
  | "orsBursNumber"
  | "expenseClass"
  | "office"
  | "expenseName"
  | "accountCode"
  | "payee"
  | "natureOfPayment"
  | "amount"
  | "checkStatus"
  | "remarks"
  | "expenseType"
  | "disbursed";

export type EsrePageColumnDef = PageColumnDef<EsrePageColumnKey> & {
  renderCell: (item: EsreItemResponse) => ReactNode;
};

export const ESRE_PAGE_COLUMNS: EsrePageColumnDef[] = [
  {
    key: "date",
    label: "Date",
    pinned: true,
    renderCell: item => formatDate(item.date),
  },
  {
    key: "checkNumber",
    label: "Check Number",
    renderCell: item => item.checkNumber ?? "—",
  },
  {
    key: "fundingSource",
    label: "Funding Source",
    renderCell: item => item.fundingSource.name,
  },
  {
    key: "dvOrPayrollNumber",
    label: "DV/Payroll No.",
    renderCell: item => item.dvOrPayrollNumber ?? "—",
  },
  {
    key: "orsBursNumber",
    label: "ORS/BURS No.",
    renderCell: item => item.obr?.requestNumber ?? "—",
  },
  {
    key: "expenseClass",
    label: "Expense Class",
    renderCell: item => item.obr?.expenseClass.subClassification ?? "—",
  },
  {
    key: "office",
    label: "Office",
    renderCell: item => item.obr?.office.name ?? "—",
  },
  {
    key: "expenseName",
    label: "Expense Name",
    renderCell: item => item.obr?.expenseClass.accountName ?? "—",
  },
  {
    key: "accountCode",
    label: "Account Code",
    renderCell: item => item.obr?.expenseClass.accountCode ?? "—",
  },
  {
    key: "payee",
    label: "Payee",
    pinned: true,
    renderCell: item => item.payee,
  },
  {
    key: "natureOfPayment",
    label: "Nature of Payment",
    renderCell: item => item.natureOfPayment,
  },
  {
    key: "amount",
    label: "Amount",
    numeric: true,
    renderCell: item => item.amount,
  },
  {
    key: "checkStatus",
    label: "Check Status",
    renderCell: item => item.checkStatus ?? "—",
  },
  {
    key: "remarks",
    label: "Remarks",
    renderCell: item => item.remarks ?? "—",
  },
  {
    key: "expenseType",
    label: "Expense Type",
    renderCell: item => item.expenseType?.name ?? "—",
  },
  {
    key: "disbursed",
    label: "Disbursed",
    numeric: true,
    renderCell: item => item.disbursed,
  },
];

export const ESRE_PAGE_COLUMN_GROUPS: PageColumnGroup<EsrePageColumnKey>[] = [
  { group: "Columns", columns: ESRE_PAGE_COLUMNS },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
  });
}
