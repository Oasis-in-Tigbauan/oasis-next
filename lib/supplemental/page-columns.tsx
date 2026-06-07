import type { ReactNode } from "react";

import type { SupplementalItemResponse } from "@/lib/http/client/responses";
import type { PageColumnDef, PageColumnGroup } from "@/lib/column-visibility";

export const SUPPLEMENTAL_PAGE_STORAGE_KEY = "supplemental";

export type SupplementalPageColumnKey =
  | "date"
  | "supplementalAugmentation"
  | "lessSourceOfFunds"
  | "addObjectOfExpenditures"
  | "quarter"
  | "aipCode"
  | "aipDescription";

export type SupplementalPageColumnDef = PageColumnDef<SupplementalPageColumnKey> & {
  renderCell: (item: SupplementalItemResponse) => ReactNode;
};

export const SUPPLEMENTAL_PAGE_COLUMNS: SupplementalPageColumnDef[] = [
  {
    key: "date",
    label: "Date",
    pinned: true,
    headerClassName: "w-40 min-w-40",
    cellClassName: "w-40 min-w-40",
    renderCell: item => formatDate(item.date),
  },
  {
    key: "supplementalAugmentation",
    label: "Supplemental/Augmentation",
    pinned: true,
    headerClassName: "w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words",
    cellClassName: "w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words",
    renderCell: item => item.supplementalOrAugmentation ?? "—",
  },
  {
    key: "lessSourceOfFunds",
    label: "Less: Source of Funds",
    headerClassName: "w-44 min-w-44",
    cellClassName: "w-44 min-w-44 text-right font-mono",
    numeric: true,
    renderCell: item =>
      item.supplementalType === "less" ? formatMoney(item.amount) : "—",
  },
  {
    key: "addObjectOfExpenditures",
    label: "Add: Object of Expenditures",
    headerClassName: "w-48 min-w-48",
    cellClassName: "w-48 min-w-48 text-right font-mono",
    numeric: true,
    renderCell: item =>
      item.supplementalType === "add" ? formatMoney(item.amount) : "—",
  },
  {
    key: "quarter",
    label: "Quarter",
    headerClassName: "w-28 min-w-28",
    cellClassName: "w-28 min-w-28",
    renderCell: item => item.quarter,
  },
  {
    key: "aipCode",
    label: "AIP Code",
    headerClassName: "w-28 min-w-28",
    cellClassName: "w-28 min-w-28",
    renderCell: item => item.aipCode?.aipRefCode ?? "—",
  },
  {
    key: "aipDescription",
    label: "AIP Description",
    headerClassName: "w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words",
    cellClassName: "w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words",
    renderCell: item => item.aipCode?.description ?? "—",
  },
];

export const SUPPLEMENTAL_PAGE_COLUMN_GROUPS: PageColumnGroup<SupplementalPageColumnKey>[] = [
  { group: "Columns", columns: SUPPLEMENTAL_PAGE_COLUMNS },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
  });
}

function formatMoney(value: string): string {
  const parsed = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
