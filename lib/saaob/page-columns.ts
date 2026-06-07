import type { PageColumnDef, PageColumnGroup } from "@/lib/column-visibility";

export type SaaobPageId = "data" | "office" | "statistics" | "accounts-summary";

export const SAAOB_PAGE_STORAGE_KEYS: Record<SaaobPageId, string> = {
  data: "saaob.data",
  office: "saaob.office",
  statistics: "saaob.statistics",
  "accounts-summary": "saaob.accounts-summary",
};

export type SaaobPageColumnKey =
  | "name"
  | "accountCode"
  | "annualBudget"
  | "supplementalOrContinuing"
  | "appropriation"
  | "allotment"
  | "obligation"
  | "unObligatedBalance"
  | "percentage"
  | "remarks"
  | "quarterlyAllotmentBalance"
  | "quarterlyAllotmentBalancePct"
  | "disbursed"
  | "disbursedPct"
  | "disbursedVariance"
  | "lbacBudget"
  | "lbacBudgetVariance"
  | "lbacObligated"
  | "lbacObligatedVariance"
  | "obligationWithPRs"
  | "obligationWithPRsBalance"
  | "obligationWithPRsPct"
  | "pr";

export type SaaobPageColumnDef = PageColumnDef<SaaobPageColumnKey>;

export const SAAOB_PAGE_COLUMNS: SaaobPageColumnDef[] = [
  {
    key: "name",
    label: "Functions/Program/Project/Activity",
    pinned: true,
    headerClassName: "w-[460px] min-w-[460px] max-w-[460px] whitespace-normal",
    cellClassName: "w-[460px] min-w-[460px] max-w-[460px] whitespace-normal break-words",
  },
  {
    key: "accountCode",
    label: "Account Code",
    headerClassName: "min-w-32",
  },
  {
    key: "annualBudget",
    label: "Annual Budget",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "supplementalOrContinuing",
    label: "Supplemental/Continuing",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "appropriation",
    label: "Appropriation",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "allotment",
    label: "Allotment (Quarterly)",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "obligation",
    label: "Obligation",
    numeric: true,
    headerClassName: "min-w-32 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "unObligatedBalance",
    label: "Unobligated Balance",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "percentage",
    label: "Percentage (%)",
    numeric: true,
    headerClassName: "min-w-28 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "remarks",
    label: "Remarks",
    headerClassName: "min-w-36",
  },
  {
    key: "quarterlyAllotmentBalance",
    label: "Quarterly Allotment Balance",
    numeric: true,
    headerClassName: "min-w-40 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "quarterlyAllotmentBalancePct",
    label: "Percentage (%)",
    numeric: true,
    headerClassName: "min-w-28 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "disbursed",
    label: "Disbursed",
    numeric: true,
    headerClassName: "min-w-32 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "disbursedPct",
    label: "Percentage (%)",
    numeric: true,
    headerClassName: "min-w-28 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "disbursedVariance",
    label: "Variance",
    numeric: true,
    headerClassName: "min-w-32 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "lbacBudget",
    label: "LBAC Budget",
    numeric: true,
    headerClassName: "min-w-32 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "lbacBudgetVariance",
    label: "Variance Budget",
    numeric: true,
    headerClassName: "min-w-32 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "lbacObligated",
    label: "LBAC Obligated",
    numeric: true,
    headerClassName: "min-w-32 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "lbacObligatedVariance",
    label: "Variance Obligated",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "obligationWithPRs",
    label: "Obligation with PRs",
    numeric: true,
    headerClassName: "min-w-40 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "obligationWithPRsBalance",
    label: "Unobligated Balance",
    numeric: true,
    headerClassName: "min-w-36 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "obligationWithPRsPct",
    label: "Percentage %",
    numeric: true,
    headerClassName: "min-w-28 text-right",
    cellClassName: "text-right font-mono",
  },
  {
    key: "pr",
    label: "PRs",
    numeric: true,
    headerClassName: "min-w-28 text-right",
    cellClassName: "text-right font-mono",
  },
];

export const SAAOB_PAGE_COLUMN_GROUPS: PageColumnGroup<SaaobPageColumnKey>[] = [
  { group: "Main", columns: SAAOB_PAGE_COLUMNS.slice(0, 10) },
  { group: "Quarterly Balance", columns: SAAOB_PAGE_COLUMNS.slice(10, 12) },
  { group: "Disbursement", columns: SAAOB_PAGE_COLUMNS.slice(12, 15) },
  { group: "LBAC", columns: SAAOB_PAGE_COLUMNS.slice(15, 19) },
  { group: "OBR / PRs", columns: SAAOB_PAGE_COLUMNS.slice(19, 23) },
];

export type SaaobPageAggregate = {
  annualBudget: string;
  supplementalOrContinuing: string;
  appropriation: string;
  allotment: string;
  obligation: string;
  unObligatedBalance: string;
  percentage: string;
  other: {
    quarterlyAllotmentBalance: { value: string; percentage: string };
    disbursed: { value: string; percentage: string; variance: string };
    lbacBudget: {
      value: string;
      variance: string;
      obligated: string;
      varianceObligated: string;
    };
    obligationWithPRs: { value: string; balance: string; percentage: string };
    pr: string;
    remarks?: string | null;
  };
};

export type SaaobPageEntryLike = SaaobPageAggregate & {
  name: string;
  accountCode?: string | null;
};

export function getSaaobPageCellDisplay(
  key: SaaobPageColumnKey,
  data: SaaobPageAggregate,
  options?: {
    name?: string;
    accountCode?: string | null;
    remarks?: string | null;
    blankAccountAndRemarks?: boolean;
  },
): string {
  if (key === "name") return options?.name ?? "";
  if (key === "accountCode") {
    if (options?.blankAccountAndRemarks) return "—";
    return options?.accountCode?.trim() ? options.accountCode : "—";
  }
  if (key === "remarks") {
    if (options?.blankAccountAndRemarks) return "—";
    const remarks = options?.remarks ?? data.other.remarks;
    return remarks?.trim() ? remarks : "—";
  }

  switch (key) {
  case "annualBudget": return data.annualBudget;
  case "supplementalOrContinuing": return data.supplementalOrContinuing;
  case "appropriation": return data.appropriation;
  case "allotment": return data.allotment;
  case "obligation": return data.obligation;
  case "unObligatedBalance": return data.unObligatedBalance;
  case "percentage": return data.percentage;
  case "quarterlyAllotmentBalance": return data.other.quarterlyAllotmentBalance.value;
  case "quarterlyAllotmentBalancePct": return data.other.quarterlyAllotmentBalance.percentage;
  case "disbursed": return data.other.disbursed.value;
  case "disbursedPct": return data.other.disbursed.percentage;
  case "disbursedVariance": return data.other.disbursed.variance;
  case "lbacBudget": return data.other.lbacBudget.value;
  case "lbacBudgetVariance": return data.other.lbacBudget.variance;
  case "lbacObligated": return data.other.lbacBudget.obligated;
  case "lbacObligatedVariance": return data.other.lbacBudget.varianceObligated;
  case "obligationWithPRs": return data.other.obligationWithPRs.value;
  case "obligationWithPRsBalance": return data.other.obligationWithPRs.balance;
  case "obligationWithPRsPct": return data.other.obligationWithPRs.percentage;
  case "pr": return data.other.pr;
  default: return "";
  }
}
