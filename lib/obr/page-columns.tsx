import type { ReactNode } from "react";

import type { ObrMainDataItemResponse } from "@/lib/http/client/responses";
import type { PageColumnDef, PageColumnGroup } from "@/lib/column-visibility";

export const OBR_MAIN_MANAGE_PAGE_STORAGE_KEY = "obr.main.manage";

export type ObrMainManagePageColumnKey =
  | "obrNumber"
  | "alobs"
  | "date"
  | "payee"
  | "address"
  | "responsibilityCenter"
  | "expenseName"
  | "accountCode"
  | "prNumber"
  | "particulars"
  | "obligated"
  | "prAmount"
  | "disbursed"
  | "varianceDisbursed"
  | "varObrVsF4"
  | "quarter";

export type ObrMainManagePageColumnDef = PageColumnDef<ObrMainManagePageColumnKey> & {
  renderCell: (item: ObrMainDataItemResponse) => ReactNode;
};

export const OBR_MAIN_MANAGE_PAGE_COLUMNS: ObrMainManagePageColumnDef[] = [
  {
    key: "obrNumber",
    label: "OBR",
    pinned: true,
    headerClassName: "min-w-32",
    cellClassName: "font-medium",
    renderCell: item => item.obrNumber,
  },
  {
    key: "alobs",
    label: "ALOBS",
    headerClassName: "min-w-48",
    renderCell: item => item.alobs,
  },
  {
    key: "date",
    label: "Date",
    headerClassName: "min-w-28",
    renderCell: item => formatDate(item.date),
  },
  {
    key: "payee",
    label: "Payee",
    headerClassName: "w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words",
    cellClassName: "w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words align-top",
    renderCell: item => item.payee ?? "-",
  },
  {
    key: "address",
    label: "Address",
    headerClassName: "w-[220px] min-w-[220px] max-w-[220px] whitespace-normal break-words",
    cellClassName: "w-[220px] min-w-[220px] max-w-[220px] whitespace-normal break-words align-top",
    renderCell: item => item.address,
  },
  {
    key: "responsibilityCenter",
    label: "Responsibility Center",
    headerClassName: "min-w-44",
    renderCell: item => item.responsibilityCenter.name,
  },
  {
    key: "expenseName",
    label: "Expense Name",
    headerClassName: "w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words",
    cellClassName: "w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words align-top",
    renderCell: item => item.expenseCode.expenseName,
  },
  {
    key: "accountCode",
    label: "Account Code",
    headerClassName: "min-w-36",
    renderCell: item => item.expenseCode.accountCode ?? "-",
  },
  {
    key: "prNumber",
    label: "PR #",
    headerClassName: "min-w-28",
    renderCell: item => item.prNumber || "-",
  },
  {
    key: "particulars",
    label: "Particulars",
    headerClassName: "w-[360px] min-w-[360px] max-w-[360px] whitespace-normal break-words",
    cellClassName: "w-[360px] min-w-[360px] max-w-[360px] whitespace-normal break-words align-top",
    renderCell: item => item.particulars,
  },
  {
    key: "obligated",
    label: "Obligated",
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
    numeric: true,
    renderCell: item => formatCurrency(item.obligated),
  },
  {
    key: "prAmount",
    label: "PR Amount",
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
    numeric: true,
    renderCell: item => formatCurrency(item.prAmount),
  },
  {
    key: "disbursed",
    label: "Disbursed",
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
    numeric: true,
    renderCell: item => formatCurrency(item.disbursed),
  },
  {
    key: "varianceDisbursed",
    label: "Variance Disbursed",
    headerClassName: "min-w-40 text-right",
    cellClassName: "text-right font-mono",
    numeric: true,
    renderCell: item => formatCurrency(item.varianceDisbursed),
  },
  {
    key: "varObrVsF4",
    label: "VAR OBR VS F4",
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
    numeric: true,
    renderCell: item => formatCurrency(item.varObrVsF4),
  },
  {
    key: "quarter",
    label: "Quarter",
    headerClassName: "min-w-28",
    renderCell: item => `Quarter ${item.quarter}`,
  },
];

export const OBR_MAIN_MANAGE_PAGE_COLUMN_GROUPS: PageColumnGroup<ObrMainManagePageColumnKey>[] = [
  { group: "Columns", columns: OBR_MAIN_MANAGE_PAGE_COLUMNS },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
  });
}

function formatCurrency(value: string): string {
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
