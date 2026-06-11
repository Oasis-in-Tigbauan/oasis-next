import type { ReactNode } from "react";

import type { AipNodeResponse } from "@/lib/http/client/responses";
import type { PageColumnDef, PageColumnGroup } from "@/common/column-visibility";

export const AIP_PAGE_STORAGE_KEY = "aip";

export type AipPageColumnKey =
  | "select"
  | "aipReferenceCode"
  | "description"
  | "implementingOffice"
  | "implementationStart"
  | "implementationCompletion"
  | "expectedOutputs"
  | "fundingSource"
  | "amountPS"
  | "amountMOOE"
  | "amountCO"
  | "amountTotal"
  | "amountThousandsPS"
  | "amountThousandsMOOE"
  | "amountThousandsCO"
  | "amountThousandsTotal"
  | "amountCCAdapt"
  | "amountCCMitigate"
  | "ccTopologyCode"
  | "gadable"
  | "gadAmount";

export type AipPageColumnDef = PageColumnDef<AipPageColumnKey> & {
  headerRow1?: string;
  headerRow2?: string;
  renderCell?: (ctx: AipPageCellContext) => ReactNode;
};

export type AipPageCellContext = {
  node: AipNodeResponse;
  depth: number;
  isGroup: boolean;
  isExpanded: boolean;
  isChecked: boolean;
  amountPS: number;
  amountMOOE: number;
  amountCO: number;
  amountTotal: number;
  amountCCAdapt: number;
  amountCCMitigate: number;
  gadAmount: number;
  toggleExpanded: (id: string) => void;
  toggleChecked: (id: string, checked: boolean) => void;
};

export const AIP_PAGE_COLUMNS: AipPageColumnDef[] = [
  { key: "select", label: "", pinned: true, headerRow1: "", headerRow2: "" },
  {
    key: "aipReferenceCode",
    label: "AIP Reference Code",
    pinned: true,
    headerRow1: "AIP Reference Code",
    headerRow2: "",
    headerClassName: "min-w-64 text-center",
  },
  {
    key: "description",
    label: "Program/Project/Activity Description",
    pinned: true,
    headerRow1: "Program/Project/Activity Description",
    headerRow2: "",
    headerClassName: "min-w-80 text-center",
    cellClassName: "whitespace-normal wrap-break-word",
  },
  {
    key: "implementingOffice",
    label: "Implementing Office",
    headerRow1: "Implementing Office",
    headerRow2: "",
    headerClassName: "min-w-56 text-center",
    cellClassName: "whitespace-normal wrap-break-word",
  },
  {
    key: "implementationStart",
    label: "Start",
    headerRow1: "Schedule of Implementation",
    headerRow2: "Start",
    headerClassName: "text-center",
    cellClassName: "text-center",
  },
  {
    key: "implementationCompletion",
    label: "Completion",
    headerRow1: "Schedule of Implementation",
    headerRow2: "Completion",
    headerClassName: "text-center",
    cellClassName: "text-center",
  },
  {
    key: "expectedOutputs",
    label: "Expected Outputs",
    headerRow1: "Expected Outputs",
    headerRow2: "",
    headerClassName: "min-w-72 text-center",
    cellClassName: "whitespace-normal wrap-break-word",
  },
  {
    key: "fundingSource",
    label: "Funding Source",
    headerRow1: "Funding Source",
    headerRow2: "",
    headerClassName: "min-w-56 text-center",
    cellClassName: "whitespace-normal wrap-break-word",
  },
  {
    key: "amountPS",
    label: "PS",
    numeric: true,
    headerRow1: "Amount",
    headerRow2: "PS",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountMOOE",
    label: "MOOE",
    numeric: true,
    headerRow1: "Amount",
    headerRow2: "MOOE",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountCO",
    label: "CO",
    numeric: true,
    headerRow1: "Amount",
    headerRow2: "CO",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountTotal",
    label: "Total",
    numeric: true,
    headerRow1: "Amount",
    headerRow2: "Total",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono font-medium",
  },
  {
    key: "amountThousandsPS",
    label: "PS (Thousands)",
    numeric: true,
    headerRow1: "Amount In Thousands",
    headerRow2: "PS",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountThousandsMOOE",
    label: "MOOE (Thousands)",
    numeric: true,
    headerRow1: "Amount In Thousands",
    headerRow2: "MOOE",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountThousandsCO",
    label: "CO (Thousands)",
    numeric: true,
    headerRow1: "Amount In Thousands",
    headerRow2: "CO",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountThousandsTotal",
    label: "Total (Thousands)",
    numeric: true,
    headerRow1: "Amount In Thousands",
    headerRow2: "Total",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono font-medium",
  },
  {
    key: "amountCCAdapt",
    label: "Climate Change Adaption",
    numeric: true,
    headerRow1: "Amount of Climate Change PPAs",
    headerRow2: "Climate Change Adaption",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "amountCCMitigate",
    label: "Climate Change Mitigation",
    numeric: true,
    headerRow1: "Amount of Climate Change PPAs",
    headerRow2: "Climate Change Mitigation",
    headerClassName: "text-center",
    cellClassName: "text-right font-mono",
  },
  {
    key: "ccTopologyCode",
    label: "CC Topology Code",
    headerRow1: "CC Topology Code",
    headerRow2: "",
    headerClassName: "min-w-48 text-center",
  },
  {
    key: "gadable",
    label: "Gadable",
    headerRow1: "Gadable",
    headerRow2: "",
    headerClassName: "min-w-24 text-center",
  },
  {
    key: "gadAmount",
    label: "GAD Amount",
    numeric: true,
    headerRow1: "GAD Amount",
    headerRow2: "",
    headerClassName: "min-w-40 text-center",
    cellClassName: "text-right font-mono",
  },
];

export const AIP_PAGE_COLUMN_GROUPS: PageColumnGroup<AipPageColumnKey>[] = [
  { group: "Identification", columns: AIP_PAGE_COLUMNS.slice(0, 4) },
  { group: "Schedule", columns: AIP_PAGE_COLUMNS.slice(4, 6) },
  { group: "Details", columns: AIP_PAGE_COLUMNS.slice(6, 8) },
  { group: "Amount", columns: AIP_PAGE_COLUMNS.slice(8, 12) },
  { group: "Amount In Thousands", columns: AIP_PAGE_COLUMNS.slice(12, 16) },
  { group: "Climate Change", columns: AIP_PAGE_COLUMNS.slice(16, 18) },
  { group: "Other", columns: AIP_PAGE_COLUMNS.slice(18, 21) },
];

export function buildAipPageHeaderLayout(
  columns: ReadonlyArray<AipPageColumnDef>,
): { row1: string[]; row2: string[] } {
  const row1 = columns.map(col => col.headerRow1 ?? col.label);
  const row2 = columns.map(col => col.headerRow2 ?? "");

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i]!;
    if (!col.headerRow2) continue;
    const groupLabel = col.headerRow1 ?? "";
    let j = i;
    while (j < columns.length && (columns[j]?.headerRow1 ?? "") === groupLabel && columns[j]?.headerRow2) {
      j++;
    }
    for (let k = i; k < j; k++) {
      row1[k] = groupLabel;
    }
    i = j - 1;
  }

  return { row1, row2 };
}

function formatMonth(value: number | null): string {
  const monthNames = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  if (!value || value < 1 || value > 12) return "-";
  return monthNames[value] ?? "-";
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getAipPageCellValue(key: AipPageColumnKey, ctx: AipPageCellContext): ReactNode {
  const { node } = ctx;
  switch (key) {
  case "select":
    return null;
  case "aipReferenceCode":
    return null;
  case "description":
    return node.description;
  case "implementingOffice":
    return node.implementingOffice ?? "-";
  case "implementationStart":
    return formatMonth(node.implementationStart);
  case "implementationCompletion":
    return formatMonth(node.implementationCompletion);
  case "expectedOutputs":
    return node.expectedOutputs ?? "-";
  case "fundingSource":
    return node.fundingSource ?? "-";
  case "amountPS":
    return formatMoney(ctx.amountPS);
  case "amountMOOE":
    return formatMoney(ctx.amountMOOE);
  case "amountCO":
    return formatMoney(ctx.amountCO);
  case "amountTotal":
    return formatMoney(ctx.amountTotal);
  case "amountThousandsPS":
    return formatMoney(ctx.amountPS / 1000);
  case "amountThousandsMOOE":
    return formatMoney(ctx.amountMOOE / 1000);
  case "amountThousandsCO":
    return formatMoney(ctx.amountCO / 1000);
  case "amountThousandsTotal":
    return formatMoney(ctx.amountTotal / 1000);
  case "amountCCAdapt":
    return formatMoney(ctx.amountCCAdapt);
  case "amountCCMitigate":
    return formatMoney(ctx.amountCCMitigate);
  case "ccTopologyCode":
    return node.ccTopologyCode ?? "-";
  case "gadable":
    return node.gadable ? "Yes" : "No";
  case "gadAmount":
    return formatMoney(ctx.gadAmount);
  default:
    return "-";
  }
}
