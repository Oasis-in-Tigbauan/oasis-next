import { Decimal } from "decimal.js";

import type {
  CollPerfGroupResponse,
  CollPerfGroupTotals,
  CollPerfItemResponse,
  CollPerfMonthlyData,
} from "@/lib/http/client/responses";
import type { HeaderMergeRange } from "@/common/lbac/export-layout";
import * as casts from "@/lib/types/casts";

// ============================================================
// Collection performance export columns (LBac Form No. 1)
// ============================================================

export const COLL_PERF_EXPORT_COLUMNS = [
  { key: "particulars", label: "Account Title/Description of Income", numeric: false },
  { key: "accountCode", label: "Account Code", numeric: false },
  { key: "incomeTargets", label: "Income Targets", numeric: true },
  { key: "estimatedIncomePrevQuarter", label: "Estimated Income Previous Quarter", numeric: true },
  { key: "estimatedIncomeThisQuarter", label: "Estimated Income This Quarter", numeric: true },
  { key: "totalEstimatedIncomeToDate", label: "Total Estimated Income to Date", numeric: true },
  { key: "actualIncome1stMonth", label: "1st Month", numeric: true },
  { key: "actualIncome2ndMonth", label: "2nd Month", numeric: true },
  { key: "actualIncome3rdMonth", label: "3rd Month", numeric: true },
  { key: "totalActualIncomeToDate", label: "Total Actual Income To Date", numeric: true },
  { key: "varianceAmount", label: "Amount", numeric: true },
  { key: "variancePercent", label: "%", numeric: true },
  { key: "remarks", label: "Remarks", numeric: false },
] as const;

export type CollPerfExportColumnKey = (typeof COLL_PERF_EXPORT_COLUMNS)[number]["key"];
export type CollPerfExportColDef = (typeof COLL_PERF_EXPORT_COLUMNS)[number];

export const COLL_PERF_EXPORT_COLUMN_GROUPS: ReadonlyArray<{
  group: string;
  columns: ReadonlyArray<CollPerfExportColDef>;
}> = [
  { group: "Identification", columns: COLL_PERF_EXPORT_COLUMNS.slice(0, 3) },
  { group: "Estimated Income", columns: COLL_PERF_EXPORT_COLUMNS.slice(3, 6) },
  { group: "Actual Income for the Quarter", columns: COLL_PERF_EXPORT_COLUMNS.slice(6, 9) },
  { group: "Summary", columns: [COLL_PERF_EXPORT_COLUMNS[9]] },
  { group: "Variance", columns: COLL_PERF_EXPORT_COLUMNS.slice(10, 12) },
  { group: "Remarks", columns: [COLL_PERF_EXPORT_COLUMNS[12]] },
];

export const COLL_PERF_COLUMN_COUNT = COLL_PERF_EXPORT_COLUMNS.length;

export const COLL_PERF_GROUP_DEPTH_ROOT_COLOR = "#0B5394";
export const COLL_PERF_GROUP_DEPTH_CHILD_COLOR = "#26a69a";
export const COLL_PERF_TOTAL_ROOT_COLOR = "#FFFF99";
export const COLL_PERF_TOTAL_DEPTH1_COLOR = "#CCFFFF";
export const COLL_PERF_TOTAL_DEEPER_COLOR = "#FDE9D9";
export const COLL_PERF_HEADER_COLOR = "#FFF2CC";

const _VALID_COLL_PERF_KEYS = new Set<string>(COLL_PERF_EXPORT_COLUMNS.map(c => c.key));

const _MONTH_LABELS = [
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
] as const;

/** LBac Form No. 1 column reference numbers (income targets is unnumbered). */
const _FORM_COLUMN_NUMBERS: Partial<Record<CollPerfExportColumnKey, string>> = {
  particulars: "(1)",
  accountCode: "(2)",
  estimatedIncomePrevQuarter: "(3)",
  estimatedIncomeThisQuarter: "(4)",
  totalEstimatedIncomeToDate: "(5)",
  actualIncome1stMonth: "(6)",
  actualIncome2ndMonth: "(7)",
  actualIncome3rdMonth: "(8)",
  totalActualIncomeToDate: "(9)",
  varianceAmount: "(10)",
  variancePercent: "(11)",
  remarks: "(12)",
};

export function parseCollPerfExportColumns(raw: string): CollPerfExportColumnKey[] | null {
  if (!raw.trim()) return null;
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every(p => _VALID_COLL_PERF_KEYS.has(p))) return null;
  return parts as CollPerfExportColumnKey[];
}

export function resolveCollPerfExportColumns(
  selected: CollPerfExportColumnKey[] | null | undefined,
): CollPerfExportColDef[] {
  if (!selected || selected.length === 0) {
    return [...COLL_PERF_EXPORT_COLUMNS];
  }
  const set = new Set(selected);
  if (!set.has("particulars")) set.add("particulars");
  return COLL_PERF_EXPORT_COLUMNS.filter(c => set.has(c.key));
}

// ============================================================
// Flatten tree for export
// ============================================================

export type CollPerfExportFlatRow =
  | { kind: "group"; id: string; depth: number; data: CollPerfGroupResponse }
  | { kind: "item"; id: string; depth: number; data: CollPerfItemResponse }
  | {
    kind: "group-total";
    id: string;
    depth: number;
    data: CollPerfGroupTotals;
    isRoot: boolean;
  };

export function flattenCollPerfForExport(tree: CollPerfGroupResponse[]): CollPerfExportFlatRow[] {
  const rows: CollPerfExportFlatRow[] = [];

  const walk = (nodes: (CollPerfGroupResponse | CollPerfItemResponse)[], depth: number) => {
    for (const node of nodes) {
      if (node.type === 6780) {
        const group = node as CollPerfGroupResponse;
        rows.push({ kind: "group", id: group.id, depth, data: group });
        walk(group.children, depth + 1);
        rows.push({
          kind: "group-total",
          id: `total-${group.id}`,
          depth,
          data: group.totals,
          isRoot: depth === 0,
        });
      } else {
        rows.push({ kind: "item", id: node.id, depth, data: node as CollPerfItemResponse });
      }
    }
  };

  walk(tree, 0);
  return rows;
}

// ============================================================
// Financial helpers
// ============================================================

type CollPerfFinancialSlice = {
  incomeTarget: string;
  monthlyData: CollPerfMonthlyData[];
  quarterlyData: { q1: string; q2: string; q3: string; q4: string };
};

function _quarterMonthNumbers(quarter: number): [number, number, number] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

function _quarterMonthLabels(quarter: number): [string, string, string] {
  const [m1, m2, m3] = _quarterMonthNumbers(quarter);
  return [_MONTH_LABELS[m1 - 1], _MONTH_LABELS[m2 - 1], _MONTH_LABELS[m3 - 1]];
}

function _monthValue(monthlyData: CollPerfMonthlyData[], month: number): Decimal {
  const row = monthlyData.find(m => m.month === month);
  return row ? casts.castFromDecimal(row.value) : new Decimal(0);
}

function _sumQuarterlyToQuarter(
  quarterlyData: CollPerfFinancialSlice["quarterlyData"],
  quarter: number,
): Decimal {
  let sum = new Decimal(0);
  for (let q = 1; q <= quarter; q++) {
    const key = `q${q}` as keyof CollPerfFinancialSlice["quarterlyData"];
    sum = sum.plus(casts.castFromDecimal(quarterlyData[key]));
  }
  return sum;
}

function _estimatedFields(incomeTarget: string, quarter: number) {
  const target = casts.castFromDecimal(incomeTarget);
  const quarterlyShare = target.div(4);
  const prev = quarterlyShare.mul(Math.max(0, quarter - 1));
  const thisQ = quarterlyShare;
  const totalEst = prev.plus(thisQ);
  return { prev, thisQ, totalEst };
}

function _sliceFromFlatRow(row: CollPerfExportFlatRow): CollPerfFinancialSlice | null {
  if (row.kind === "item") {
    return {
      incomeTarget: row.data.incomeTarget,
      monthlyData: row.data.monthlyData,
      quarterlyData: row.data.quarterlyData,
    };
  }
  if (row.kind === "group-total") {
    return {
      incomeTarget: row.data.incomeTarget,
      monthlyData: row.data.monthlyData,
      quarterlyData: row.data.quarterlyData,
    };
  }
  return null;
}

function _parseNumeric(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export type CollPerfExportCellValue = string | number;

export function getCollPerfCellValue(
  row: CollPerfExportFlatRow,
  key: CollPerfExportColumnKey,
  quarter: number,
): CollPerfExportCellValue {
  if (row.kind === "group") {
    return key === "particulars" ? row.data.name : "";
  }

  if (row.kind === "group-total") {
    if (key === "particulars") return row.isRoot ? "Grand Total" : "Total";
    if (key === "accountCode" || key === "remarks") return "";
  } else if (row.kind === "item") {
    if (key === "particulars") return row.data.particulars;
    if (key === "accountCode") return row.data.accountCode ?? "";
    if (key === "remarks") return "";
  }

  const slice = _sliceFromFlatRow(row);
  if (!slice) return "";

  const [m1, m2, m3] = _quarterMonthNumbers(quarter);
  const { prev, thisQ, totalEst } = _estimatedFields(slice.incomeTarget, quarter);
  const totalActual = _sumQuarterlyToQuarter(slice.quarterlyData, quarter);
  const varianceAmount = totalActual.minus(totalEst);
  const variancePercent = totalEst.isZero()
    ? 0
    : varianceAmount.div(totalEst).mul(100).toNumber();

  switch (key) {
  case "incomeTargets":
    return _parseNumeric(slice.incomeTarget);
  case "estimatedIncomePrevQuarter":
    return prev.toNumber();
  case "estimatedIncomeThisQuarter":
    return thisQ.toNumber();
  case "totalEstimatedIncomeToDate":
    return totalEst.toNumber();
  case "actualIncome1stMonth":
    return _monthValue(slice.monthlyData, m1).toNumber();
  case "actualIncome2ndMonth":
    return _monthValue(slice.monthlyData, m2).toNumber();
  case "actualIncome3rdMonth":
    return _monthValue(slice.monthlyData, m3).toNumber();
  case "totalActualIncomeToDate":
    return totalActual.toNumber();
  case "varianceAmount":
    return varianceAmount.toNumber();
  case "variancePercent":
    return variancePercent;
  default:
    return "";
  }
}

export function collPerfTotalRowColor(depth: number, isRoot: boolean): string {
  if (isRoot) return COLL_PERF_TOTAL_ROOT_COLOR;
  if (depth === 1) return COLL_PERF_TOTAL_DEPTH1_COLOR;
  return COLL_PERF_TOTAL_DEEPER_COLOR;
}

// ============================================================
// Formatters
// ============================================================

export function fmtCollPerfAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;
  return asNumber.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCollPerfPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const asNumber = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(asNumber)) return String(value);
  return `${asNumber.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function formatCollPerfCellForPreview(
  value: CollPerfExportCellValue,
  key: CollPerfExportColumnKey,
): string {
  if (value === "" || value === null || value === undefined) return "";
  if (key === "variancePercent") {
    return fmtCollPerfPercent(value);
  }
  const col = COLL_PERF_EXPORT_COLUMNS.find(c => c.key === key);
  if (col?.numeric) return fmtCollPerfAmount(String(value));
  return String(value);
}

// ============================================================
// Header layout (3 rows + merges)
// ============================================================

export function quarterEndingLabel(year: number, quarter: number): string {
  const labels = [
    `March 31, ${year}`,
    `June 30, ${year}`,
    `September 30, ${year}`,
    `December 31, ${year}`,
  ];
  return labels[quarter - 1] ?? `December 31, ${year}`;
}

export function buildCollPerfHeaderLayout(
  quarter: number,
  columns: readonly CollPerfExportColDef[],
): { row1: string[]; row2: string[]; row3: string[]; merges: HeaderMergeRange[] } {
  const colIndex = new Map(columns.map((c, i) => [c.key, i + 1]));
  const n = columns.length;
  const row1 = Array<string>(n).fill("");
  const row2 = Array<string>(n).fill("");
  const row3 = Array<string>(n).fill("");
  const merges: HeaderMergeRange[] = [];

  const [month1, month2, month3] = _quarterMonthLabels(quarter);

  const setSubHeaders = (keys: CollPerfExportColumnKey[], labels?: Partial<Record<CollPerfExportColumnKey, string>>) => {
    for (const key of keys) {
      const idx = colIndex.get(key);
      if (idx === undefined) continue;
      const col = columns.find(c => c.key === key);
      row2[idx - 1] = labels?.[key] ?? col?.label ?? "";
    }
  };

  const setGroup = (label: string, keys: CollPerfExportColumnKey[], subLabels?: Partial<Record<CollPerfExportColumnKey, string>>) => {
    const indices = keys.map(k => colIndex.get(k)).filter((i): i is number => i !== undefined);
    if (indices.length === 0) return;
    const start = Math.min(...indices);
    const end = Math.max(...indices);
    if (start === end) {
      row1[start - 1] = label;
      merges.push({ startCol: start, endCol: start, row: 1, label });
    } else {
      merges.push({ startCol: start, endCol: end, row: 1, label });
      for (let i = start; i <= end; i++) row1[i - 1] = label;
      setSubHeaders(keys, subLabels);
    }
  };

  const span1 = (label: string, key: CollPerfExportColumnKey) => {
    const idx = colIndex.get(key);
    if (!idx) return;
    row1[idx - 1] = label;
    merges.push({ startCol: idx, endCol: idx, row: 1, label });
  };

  span1("Account Title/Description of Income", "particulars");
  span1("Account Code", "accountCode");
  span1("Income Targets", "incomeTargets");
  span1("Estimated Income Previous Quarter", "estimatedIncomePrevQuarter");
  span1("Estimated Income This Quarter", "estimatedIncomeThisQuarter");
  span1("Total Estimated Income to Date", "totalEstimatedIncomeToDate");

  setGroup("Actual Income for the Quarter", [
    "actualIncome1stMonth",
    "actualIncome2ndMonth",
    "actualIncome3rdMonth",
  ], {
    actualIncome1stMonth: month1,
    actualIncome2ndMonth: month2,
    actualIncome3rdMonth: month3,
  });

  span1("Total Actual Income To Date", "totalActualIncomeToDate");

  setGroup("Variance", ["varianceAmount", "variancePercent"], {
    varianceAmount: "Amount",
    variancePercent: "%",
  });

  span1("Remarks", "remarks");

  for (const col of columns) {
    const idx = colIndex.get(col.key);
    if (idx === undefined) continue;
    const num = _FORM_COLUMN_NUMBERS[col.key];
    if (num) row3[idx - 1] = num;
  }

  return { row1, row2, row3, merges };
}
