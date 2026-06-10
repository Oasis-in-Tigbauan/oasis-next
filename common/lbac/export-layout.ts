import type {
  LbacGroupResponse,
  LbacGroupTotals,
  LbacItemResponse,
  LbacQuarterlyGroupResponse,
  LbacQuarterlyGroupTotals,
  LbacQuarterlyItemResponse,
} from "@/lib/http/client/responses";

// ============================================================
// Main data — column keys in page column order (58 columns)
// ============================================================

export const LBAC_MAIN_EXPORT_COLUMNS = [
  { key: "aipRefCode", label: "AIP REF CODE", numeric: false },
  { key: "mfoPpa", label: "MFO/PPA", numeric: false },
  { key: "majorFinalOutput", label: "Major Final Output", numeric: false },
  { key: "performanceOutputIndicator", label: "Performance/Output Indicator", numeric: false },
  { key: "targetForBudgetYear", label: "Target for Budget Year", numeric: false },
  { key: "proposedBudgetPS", label: "PS", numeric: true },
  { key: "proposedBudgetMOOE", label: "MOOE", numeric: true },
  { key: "proposedBudgetFE", label: "FE", numeric: true },
  { key: "proposedBudgetCO", label: "CO", numeric: true },
  { key: "proposedBudgetTotal", label: "Total", numeric: true },
  { key: "implementingUnit", label: "Implementing Unit", numeric: false },
  { key: "contOrSupplemental", label: "Cont./Suppl./Aug.", numeric: true },
  { key: "appropriationCurrent", label: "Current", numeric: true },
  { key: "appropriationTotal", label: "Total", numeric: true },
  { key: "allotmentPrevQuarters", label: "Previous Quarters", numeric: true },
  { key: "allotmentThisQuarter", label: "This Quarter", numeric: true },
  { key: "allotmentTotal", label: "Total", numeric: true },
  { key: "balanceOfAppropriation", label: "Balance of Appropriation", numeric: true },
  { key: "obligationsPrevQuarters", label: "Previous Quarters", numeric: true },
  { key: "obligationsThisQuarter", label: "This Quarter", numeric: true },
  { key: "obligationsTotal", label: "Total", numeric: true },
  { key: "unobligatedAmount", label: "Unobligated Amount", numeric: true },
  { key: "remarks", label: "Remarks", numeric: false },
  { key: "cutOffObligation", label: "Cut-off", numeric: true },
  { key: "cutOffBalance", label: "Balance", numeric: true },
  { key: "cutOffPercentage", label: "%", numeric: true },
  { key: "gadable", label: "Gadable", numeric: false },
  { key: "tagging", label: "Tagging", numeric: false },
  { key: "amountAttributed", label: "Amount Attributed", numeric: true },
  { key: "expenseClass", label: "Expense Class", numeric: false },
  { key: "accountCode", label: "Account Code", numeric: false },
  { key: "priorYearAccomplishments", label: "Prior Year Accomplishments", numeric: false },
  { key: "physicalTargets", label: "Physical Targets", numeric: false },
  { key: "otherRemarks", label: "Other Remarks", numeric: false },
  { key: "faQ1", label: "Q1", numeric: true },
  { key: "faQ2", label: "Q2", numeric: true },
  { key: "faQ3", label: "Q3", numeric: true },
  { key: "faQ4", label: "Q4", numeric: true },
  { key: "faTotal", label: "Total", numeric: true },
  { key: "afpQ1", label: "Q1", numeric: true },
  { key: "afpQ2", label: "Q2", numeric: true },
  { key: "afpQ3", label: "Q3", numeric: true },
  { key: "afpQ4", label: "Q4", numeric: true },
  { key: "afpTotal", label: "Total", numeric: true },
  { key: "afpVariance", label: "Variance (Financial)", numeric: true },
  { key: "qrPhysTargQ1", label: "Q1", numeric: false },
  { key: "qrPhysTargQ2", label: "Q2", numeric: false },
  { key: "qrPhysTargQ3", label: "Q3", numeric: false },
  { key: "qrPhysTargQ4", label: "Q4", numeric: false },
  { key: "qrPhysTargTotal", label: "Total", numeric: false },
  { key: "qrActualPhysQ1", label: "Q1", numeric: false },
  { key: "qrActualPhysQ2", label: "Q2", numeric: false },
  { key: "qrActualPhysQ3", label: "Q3", numeric: false },
  { key: "qrActualPhysQ4", label: "Q4", numeric: false },
  { key: "qrActualPhysTotal", label: "Total", numeric: false },
  { key: "qrVariance", label: "Variance (Performance)", numeric: false },
  { key: "qrAccomplishment", label: "% Accomplishment", numeric: false },
  { key: "qrRemarks", label: "QR Remarks", numeric: false },
] as const;

export type LbacMainExportColumnKey = (typeof LBAC_MAIN_EXPORT_COLUMNS)[number]["key"];
export type LbacMainExportColDef = (typeof LBAC_MAIN_EXPORT_COLUMNS)[number];

export const LBAC_MAIN_EXPORT_COLUMN_GROUPS: ReadonlyArray<{
  group: string;
  columns: ReadonlyArray<LbacMainExportColDef>;
}> = [
  { group: "Identification", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(0, 5) },
  { group: "Proposed Budget", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(5, 10) },
  { group: "Implementing Unit", columns: [LBAC_MAIN_EXPORT_COLUMNS[10]] },
  { group: "Appropriation", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(11, 14) },
  { group: "Allotment Released", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(14, 17) },
  { group: "Balance of Appropriation", columns: [LBAC_MAIN_EXPORT_COLUMNS[17]] },
  { group: "Obligations Incurred", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(18, 21) },
  { group: "Unobligated / Remarks", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(21, 23) },
  { group: "Obligation (Cut-off)", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(23, 26) },
  { group: "Other Metadata", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(26, 34) },
  { group: "Financial Allocation", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(34, 39) },
  { group: "Actual Financial Performance", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(39, 45) },
  { group: "Physical Targets (QR)", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(45, 50) },
  { group: "Actual Physical Performance (QR)", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(50, 55) },
  { group: "Quarterly Summary", columns: LBAC_MAIN_EXPORT_COLUMNS.slice(55, 58) },
];

export const LBAC_MAIN_COLUMN_COUNT = LBAC_MAIN_EXPORT_COLUMNS.length;

// ============================================================
// Quarterly — column keys in page column order (23 columns)
// ============================================================

export const LBAC_QUARTERLY_EXPORT_COLUMNS = [
  { key: "aipRefCode", label: "AIP REF CODE", numeric: false },
  { key: "mfoPpa", label: "MFO/PPA", numeric: false },
  { key: "implementingUnit", label: "Implementing Unit", numeric: false },
  { key: "contOrSupplemental", label: "Cont./Suppl./Aug.", numeric: true },
  { key: "appropriationCurrent", label: "Current", numeric: true },
  { key: "appropriationTotal", label: "Total", numeric: true },
  { key: "cutOffObligation", label: "Cut-off", numeric: true },
  { key: "cutOffBalance", label: "Balance", numeric: true },
  { key: "priorYearAccomplishments", label: "Prior Year Accomplishments", numeric: false },
  { key: "physTargQ1", label: "Q1", numeric: false },
  { key: "physTargQ2", label: "Q2", numeric: false },
  { key: "physTargQ3", label: "Q3", numeric: false },
  { key: "physTargQ4", label: "Q4", numeric: false },
  { key: "physTargTotal", label: "Total", numeric: false },
  { key: "actualPhysQ1", label: "Q1", numeric: false },
  { key: "actualPhysQ2", label: "Q2", numeric: false },
  { key: "actualPhysQ3", label: "Q3", numeric: false },
  { key: "actualPhysQ4", label: "Q4", numeric: false },
  { key: "actualPhysTotal", label: "Total", numeric: false },
  { key: "variance", label: "Variance as of", numeric: false },
  { key: "accomplishment", label: "% of Accomplishment", numeric: false },
  { key: "remarks", label: "Remarks", numeric: false },
  { key: "targetForBudgetYear", label: "Target for Budget Year", numeric: false },
] as const;

export type LbacQuarterlyExportColumnKey = (typeof LBAC_QUARTERLY_EXPORT_COLUMNS)[number]["key"];
export type LbacQuarterlyExportColDef = (typeof LBAC_QUARTERLY_EXPORT_COLUMNS)[number];

export const LBAC_QUARTERLY_EXPORT_COLUMN_GROUPS: ReadonlyArray<{
  group: string;
  columns: ReadonlyArray<LbacQuarterlyExportColDef>;
}> = [
  { group: "Identification", columns: LBAC_QUARTERLY_EXPORT_COLUMNS.slice(0, 3) },
  { group: "Appropriation", columns: LBAC_QUARTERLY_EXPORT_COLUMNS.slice(3, 6) },
  { group: "Obligation", columns: LBAC_QUARTERLY_EXPORT_COLUMNS.slice(6, 8) },
  { group: "Prior Year", columns: [LBAC_QUARTERLY_EXPORT_COLUMNS[8]] },
  { group: "Physical Targets", columns: LBAC_QUARTERLY_EXPORT_COLUMNS.slice(9, 14) },
  { group: "Actual Physical Performance", columns: LBAC_QUARTERLY_EXPORT_COLUMNS.slice(14, 19) },
  { group: "Summary", columns: LBAC_QUARTERLY_EXPORT_COLUMNS.slice(19, 23) },
];

export const LBAC_QUARTERLY_COLUMN_COUNT = LBAC_QUARTERLY_EXPORT_COLUMNS.length;

const _VALID_MAIN_KEYS = new Set<string>(LBAC_MAIN_EXPORT_COLUMNS.map(c => c.key));
const _VALID_QUARTERLY_KEYS = new Set<string>(LBAC_QUARTERLY_EXPORT_COLUMNS.map(c => c.key));

export function parseLbacMainExportColumns(raw: string): LbacMainExportColumnKey[] | null {
  if (!raw.trim()) return null;
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every(p => _VALID_MAIN_KEYS.has(p))) return null;
  return parts as LbacMainExportColumnKey[];
}

export function parseLbacQuarterlyExportColumns(raw: string): LbacQuarterlyExportColumnKey[] | null {
  if (!raw.trim()) return null;
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every(p => _VALID_QUARTERLY_KEYS.has(p))) return null;
  return parts as LbacQuarterlyExportColumnKey[];
}

export function resolveMainExportColumns(
  selected: LbacMainExportColumnKey[] | null | undefined,
): LbacMainExportColDef[] {
  if (!selected || selected.length === 0) {
    return [...LBAC_MAIN_EXPORT_COLUMNS];
  }
  const set = new Set(selected);
  if (!set.has("aipRefCode")) set.add("aipRefCode");
  if (!set.has("mfoPpa")) set.add("mfoPpa");
  return LBAC_MAIN_EXPORT_COLUMNS.filter(c => set.has(c.key));
}

export function resolveQuarterlyExportColumns(
  selected: LbacQuarterlyExportColumnKey[] | null | undefined,
): LbacQuarterlyExportColDef[] {
  if (!selected || selected.length === 0) {
    return [...LBAC_QUARTERLY_EXPORT_COLUMNS];
  }
  const set = new Set(selected);
  if (!set.has("aipRefCode")) set.add("aipRefCode");
  if (!set.has("mfoPpa")) set.add("mfoPpa");
  return LBAC_QUARTERLY_EXPORT_COLUMNS.filter(c => set.has(c.key));
}

// ============================================================
// Flatten (matches dashboard pages — always expanded)
// ============================================================

export type LbacMainExportFlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacItemResponse }
  | { kind: "group-total"; id: string; depth: number; data: LbacGroupTotals; isRoot: boolean };

export type LbacQuarterlyExportFlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacQuarterlyGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacQuarterlyItemResponse }
  | { kind: "group-total"; id: string; depth: number; data: LbacQuarterlyGroupTotals; isRoot: boolean };

export function flattenLbacMainForExport(tree: LbacGroupResponse[]): LbacMainExportFlatRow[] {
  const rows: LbacMainExportFlatRow[] = [];

  const walk = (nodes: (LbacGroupResponse | LbacItemResponse)[], depth: number) => {
    for (const node of nodes) {
      if (node.type === 6767) {
        const group = node as LbacGroupResponse;
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
        rows.push({ kind: "item", id: node.id, depth, data: node as LbacItemResponse });
      }
    }
  };

  walk(tree, 0);
  return rows;
}

export function flattenLbacQuarterlyForExport(
  tree: LbacQuarterlyGroupResponse[],
): LbacQuarterlyExportFlatRow[] {
  const rows: LbacQuarterlyExportFlatRow[] = [];

  const walk = (nodes: (LbacQuarterlyGroupResponse | LbacQuarterlyItemResponse)[], depth: number) => {
    for (const node of nodes) {
      if (node.type === 6767) {
        const group = node as LbacQuarterlyGroupResponse;
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
        rows.push({ kind: "item", id: node.id, depth, data: node as LbacQuarterlyItemResponse });
      }
    }
  };

  walk(tree, 0);
  return rows;
}

// ============================================================
// Formatters
// ============================================================

export function fmtAmount(value: string | null | undefined): string {
  if (!value) return "—";
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;
  return asNumber.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPercent(value: string | null | undefined): string {
  if (!value) return "—";
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;
  return `${asNumber.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function txt(value: string | null | undefined | boolean): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

function _parseNumeric(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export type LbacExportCellValue = string | number;

export function getMainDataCellValue(
  row: LbacMainExportFlatRow,
  key: LbacMainExportColumnKey,
): LbacExportCellValue {
  if (row.kind === "group") {
    return key === "mfoPpa" ? row.data.name : "";
  }

  if (row.kind === "group-total") {
    const t = row.data;
    if (key === "mfoPpa") return row.isRoot ? "Grand Total" : "Total";
    switch (key) {
    case "proposedBudgetPS": return _parseNumeric(t.proposedBudgetPS);
    case "proposedBudgetMOOE": return _parseNumeric(t.proposedBudgetMOOE);
    case "proposedBudgetFE": return _parseNumeric(t.proposedBudgetFE);
    case "proposedBudgetCO": return _parseNumeric(t.proposedBudgetCO);
    case "proposedBudgetTotal": return _parseNumeric(t.proposedBudgetTotal);
    case "contOrSupplemental": return _parseNumeric(t.appropriation.contOrSupplementalAugmentation);
    case "appropriationCurrent": return _parseNumeric(t.appropriation.current);
    case "appropriationTotal": return _parseNumeric(t.appropriation.total);
    case "allotmentPrevQuarters": return _parseNumeric(t.allotmentReleased.previousQuarters);
    case "allotmentThisQuarter": return _parseNumeric(t.allotmentReleased.thisQuarter);
    case "allotmentTotal": return _parseNumeric(t.allotmentReleased.total);
    case "balanceOfAppropriation": return _parseNumeric(t.balanceOfAppropriation);
    case "obligationsPrevQuarters": return _parseNumeric(t.obligations.previousQuarters);
    case "obligationsThisQuarter": return _parseNumeric(t.obligations.thisQuarter);
    case "obligationsTotal": return _parseNumeric(t.obligations.total);
    case "unobligatedAmount": return _parseNumeric(t.unobligatedAmount);
    case "cutOffObligation": return _parseNumeric(t.asCutOffMonth.obligation);
    case "cutOffBalance": return _parseNumeric(t.asCutOffMonth.balance);
    case "cutOffPercentage": return _parseNumeric(t.asCutOffMonth.percentage);
    case "amountAttributed": return _parseNumeric(t.other.amountAttributed);
    case "faQ1": return _parseNumeric(t.financialAllocation.Q1);
    case "faQ2": return _parseNumeric(t.financialAllocation.Q2);
    case "faQ3": return _parseNumeric(t.financialAllocation.Q3);
    case "faQ4": return _parseNumeric(t.financialAllocation.Q4);
    case "faTotal": return _parseNumeric(t.financialAllocation.total);
    case "afpQ1": return _parseNumeric(t.actualFinancialPerformance.Q1);
    case "afpQ2": return _parseNumeric(t.actualFinancialPerformance.Q2);
    case "afpQ3": return _parseNumeric(t.actualFinancialPerformance.Q3);
    case "afpQ4": return _parseNumeric(t.actualFinancialPerformance.Q4);
    case "afpTotal": return _parseNumeric(t.actualFinancialPerformance.total);
    case "afpVariance": return _parseNumeric(t.variance);
    default: return "";
    }
  }

  const item = row.data;
  switch (key) {
  case "aipRefCode": return item.aipRefCode?.aipReferenceCode ?? "";
  case "mfoPpa": return item.mfoPpa;
  case "majorFinalOutput": return item.majorFinalOutput ?? "";
  case "performanceOutputIndicator": return item.performanceOutputIndicator ?? "";
  case "targetForBudgetYear": return item.targetForBudgetYear ?? "";
  case "proposedBudgetPS": return _parseNumeric(item.proposedBudgetPS);
  case "proposedBudgetMOOE": return _parseNumeric(item.proposedBudgetMOOE);
  case "proposedBudgetFE": return _parseNumeric(item.proposedBudgetFE);
  case "proposedBudgetCO": return _parseNumeric(item.proposedBudgetCO);
  case "proposedBudgetTotal": return _parseNumeric(item.proposedBudgetTotal);
  case "implementingUnit": return item.implementingUnit?.name ?? "";
  case "contOrSupplemental": return _parseNumeric(item.appropriation.contOrSupplementalAugmentation);
  case "appropriationCurrent": return _parseNumeric(item.appropriation.current);
  case "appropriationTotal": return _parseNumeric(item.appropriation.total);
  case "allotmentPrevQuarters": return _parseNumeric(item.allotmentReleased.previousQuarters);
  case "allotmentThisQuarter": return _parseNumeric(item.allotmentReleased.thisQuarter);
  case "allotmentTotal": return _parseNumeric(item.allotmentReleased.total);
  case "balanceOfAppropriation": return _parseNumeric(item.balanceOfAppropriation);
  case "obligationsPrevQuarters": return _parseNumeric(item.obligations.previousQuarters);
  case "obligationsThisQuarter": return _parseNumeric(item.obligations.thisQuarter);
  case "obligationsTotal": return _parseNumeric(item.obligations.total);
  case "unobligatedAmount": return _parseNumeric(item.unobligatedAmount);
  case "remarks": return item.remarks ?? "";
  case "cutOffObligation": return _parseNumeric(item.asCutOffMonth.obligation);
  case "cutOffBalance": return _parseNumeric(item.asCutOffMonth.balance);
  case "cutOffPercentage": return _parseNumeric(item.asCutOffMonth.percentage);
  case "gadable": return item.other.gadable ? "Yes" : "No";
  case "tagging": return item.other.tagging ?? "";
  case "amountAttributed": return _parseNumeric(item.other.amountAttributed);
  case "expenseClass": return item.other.expenseCode?.accountName ?? "";
  case "accountCode": return item.other.expenseCode?.accountCode ?? "";
  case "priorYearAccomplishments": return item.other.priorYearAccomplishments ?? "";
  case "physicalTargets": return item.other.physicalTargets ?? "";
  case "otherRemarks": return item.other.remarks ?? "";
  case "faQ1": return _parseNumeric(item.financialAllocation.Q1);
  case "faQ2": return _parseNumeric(item.financialAllocation.Q2);
  case "faQ3": return _parseNumeric(item.financialAllocation.Q3);
  case "faQ4": return _parseNumeric(item.financialAllocation.Q4);
  case "faTotal": return _parseNumeric(item.financialAllocation.total);
  case "afpQ1": return _parseNumeric(item.actualFinancialPerformance.Q1);
  case "afpQ2": return _parseNumeric(item.actualFinancialPerformance.Q2);
  case "afpQ3": return _parseNumeric(item.actualFinancialPerformance.Q3);
  case "afpQ4": return _parseNumeric(item.actualFinancialPerformance.Q4);
  case "afpTotal": return _parseNumeric(item.actualFinancialPerformance.total);
  case "afpVariance": return _parseNumeric(item.variance);
  case "qrPhysTargQ1": return item.quarterlyReport.physicalTargets.Q1 ?? "";
  case "qrPhysTargQ2": return item.quarterlyReport.physicalTargets.Q2 ?? "";
  case "qrPhysTargQ3": return item.quarterlyReport.physicalTargets.Q3 ?? "";
  case "qrPhysTargQ4": return item.quarterlyReport.physicalTargets.Q4 ?? "";
  case "qrPhysTargTotal": return item.quarterlyReport.physicalTargets.total ?? "";
  case "qrActualPhysQ1": return item.quarterlyReport.actualPhysicalPerformance.Q1 ?? "";
  case "qrActualPhysQ2": return item.quarterlyReport.actualPhysicalPerformance.Q2 ?? "";
  case "qrActualPhysQ3": return item.quarterlyReport.actualPhysicalPerformance.Q3 ?? "";
  case "qrActualPhysQ4": return item.quarterlyReport.actualPhysicalPerformance.Q4 ?? "";
  case "qrActualPhysTotal": return item.quarterlyReport.actualPhysicalPerformance.total ?? "";
  case "qrVariance": return item.quarterlyReport.variance ?? "";
  case "qrAccomplishment": return item.quarterlyReport.accomplishment ?? "";
  case "qrRemarks": return item.quarterlyReport.remarks ?? "";
  default: return "";
  }
}

export function getQuarterlyCellValue(
  row: LbacQuarterlyExportFlatRow,
  key: LbacQuarterlyExportColumnKey,
): LbacExportCellValue {
  if (row.kind === "group") {
    return key === "mfoPpa" ? row.data.name : "";
  }

  if (row.kind === "group-total") {
    const t = row.data;
    if (key === "mfoPpa") return row.isRoot ? "Grand Total" : "Total";
    switch (key) {
    case "contOrSupplemental": return _parseNumeric(t.appropriation.contOrSupplementalAugmentation);
    case "appropriationCurrent": return _parseNumeric(t.appropriation.current);
    case "appropriationTotal": return _parseNumeric(t.appropriation.total);
    case "cutOffObligation": return _parseNumeric(t.asCutOffMonth.obligation);
    case "cutOffBalance": return _parseNumeric(t.asCutOffMonth.balance);
    default: return "";
    }
  }

  const item = row.data;
  switch (key) {
  case "aipRefCode": return item.aipRefCode?.aipReferenceCode ?? "";
  case "mfoPpa": return item.mfoPpa;
  case "implementingUnit": return item.implementingUnit?.name ?? "";
  case "contOrSupplemental": return _parseNumeric(item.appropriation.contOrSupplementalAugmentation);
  case "appropriationCurrent": return _parseNumeric(item.appropriation.current);
  case "appropriationTotal": return _parseNumeric(item.appropriation.total);
  case "cutOffObligation": return _parseNumeric(item.asCutOffMonth.obligation);
  case "cutOffBalance": return _parseNumeric(item.asCutOffMonth.balance);
  case "priorYearAccomplishments": return item.priorYearAccomplishments ?? "";
  case "physTargQ1": return item.physicalTargets.Q1 ?? "";
  case "physTargQ2": return item.physicalTargets.Q2 ?? "";
  case "physTargQ3": return item.physicalTargets.Q3 ?? "";
  case "physTargQ4": return item.physicalTargets.Q4 ?? "";
  case "physTargTotal": return item.physicalTargets.total ?? "";
  case "actualPhysQ1": return item.actualPhysicalPerformance.Q1 ?? "";
  case "actualPhysQ2": return item.actualPhysicalPerformance.Q2 ?? "";
  case "actualPhysQ3": return item.actualPhysicalPerformance.Q3 ?? "";
  case "actualPhysQ4": return item.actualPhysicalPerformance.Q4 ?? "";
  case "actualPhysTotal": return item.actualPhysicalPerformance.total ?? "";
  case "variance": return item.variance ?? "";
  case "accomplishment": return item.accomplishment ?? "";
  case "remarks": return item.remarks ?? "";
  case "targetForBudgetYear": return item.targetForBudgetYear ?? "";
  default: return "";
  }
}

export function formatMainCellForPreview(value: LbacExportCellValue, numeric: boolean): string {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (numeric) return fmtAmount(String(value));
    return String(value);
  }
  return value;
}

export function formatQuarterlyCellForPreview(value: LbacExportCellValue, numeric: boolean): string {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (numeric) return fmtAmount(String(value));
    return String(value);
  }
  return value;
}

// ============================================================
// Header layout (two rows, matching dashboard pages)
// ============================================================

export type HeaderMergeRange = { startCol: number; endCol: number; row: 1 | 2; label: string };

export function buildMainDataHeaderLayout(
  year: number,
  columns: readonly LbacMainExportColDef[],
): { row1: string[]; row2: string[]; merges: HeaderMergeRange[] } {
  const colIndex = new Map(columns.map((c, i) => [c.key, i + 1]));
  const n = columns.length;
  const row1 = Array<string>(n).fill("");
  const row2: string[] = Array<string>(n).fill("");
  const merges: HeaderMergeRange[] = [];

  const setSubHeaders = (keys: LbacMainExportColumnKey[]) => {
    for (const key of keys) {
      const idx = colIndex.get(key);
      if (idx === undefined) continue;
      const col = columns.find(c => c.key === key);
      if (col) row2[idx - 1] = col.label;
    }
  };

  const setGroup = (label: string, keys: LbacMainExportColumnKey[]) => {
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
      setSubHeaders(keys);
    }
  };

  const span2 = (label: string, key: LbacMainExportColumnKey) => {
    const idx = colIndex.get(key);
    if (!idx) return;
    row1[idx - 1] = label;
    merges.push({ startCol: idx, endCol: idx, row: 1, label });
  };

  span2("AIP REF CODE", "aipRefCode");
  span2("MFO/PPA", "mfoPpa");
  span2("Major Final Output", "majorFinalOutput");
  span2("Performance/Output Indicator", "performanceOutputIndicator");
  span2("Target for Budget Year", "targetForBudgetYear");

  setGroup("Proposed Budget for the Budget Year", [
    "proposedBudgetPS", "proposedBudgetMOOE", "proposedBudgetFE", "proposedBudgetCO", "proposedBudgetTotal",
  ]);
  span2("Implementing Unit", "implementingUnit");
  setGroup("Appropriation", ["contOrSupplemental", "appropriationCurrent", "appropriationTotal"]);
  setGroup("Allotment Released", ["allotmentPrevQuarters", "allotmentThisQuarter", "allotmentTotal"]);
  span2("Balance of Appropriation", "balanceOfAppropriation");
  setGroup("Obligations Incurred", ["obligationsPrevQuarters", "obligationsThisQuarter", "obligationsTotal"]);
  span2("Unobligated Amount", "unobligatedAmount");
  span2("Remarks", "remarks");
  setGroup("Obligation", ["cutOffObligation", "cutOffBalance", "cutOffPercentage"]);
  span2("Gadable", "gadable");
  span2("Tagging", "tagging");
  span2("Amount Attributed", "amountAttributed");
  span2("Expense Class", "expenseClass");
  span2("Account Code", "accountCode");
  span2("Prior Year Accomplishments", "priorYearAccomplishments");
  span2("Physical Targets", "physicalTargets");
  span2("Other Remarks", "otherRemarks");
  setGroup("Financial Allocation", ["faQ1", "faQ2", "faQ3", "faQ4", "faTotal"]);
  setGroup("Actual Financial Performance", ["afpQ1", "afpQ2", "afpQ3", "afpQ4", "afpTotal"]);
  span2("Variance (Financial)", "afpVariance");
  setGroup("Physical Targets (Performance)", ["qrPhysTargQ1", "qrPhysTargQ2", "qrPhysTargQ3", "qrPhysTargQ4", "qrPhysTargTotal"]);
  setGroup("Actual Physical Performance", ["qrActualPhysQ1", "qrActualPhysQ2", "qrActualPhysQ3", "qrActualPhysQ4", "qrActualPhysTotal"]);
  span2("Variance (Performance)", "qrVariance");
  span2("% Accomplishment", "qrAccomplishment");
  span2("QR Remarks", "qrRemarks");

  void year;
  return { row1, row2, merges };
}

export function buildQuarterlyHeaderLayout(
  year: number,
  columns: readonly LbacQuarterlyExportColDef[],
): { row1: string[]; row2: string[]; merges: HeaderMergeRange[] } {
  const colIndex = new Map(columns.map((c, i) => [c.key, i + 1]));
  const n = columns.length;
  const row1 = Array<string>(n).fill("");
  const row2: string[] = Array<string>(n).fill("");
  const merges: HeaderMergeRange[] = [];

  const setSubHeaders = (keys: LbacQuarterlyExportColumnKey[]) => {
    for (const key of keys) {
      const idx = colIndex.get(key);
      if (idx === undefined) continue;
      const col = columns.find(c => c.key === key);
      if (col) row2[idx - 1] = col.label;
    }
  };

  const setGroup = (label: string, keys: LbacQuarterlyExportColumnKey[]) => {
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
      setSubHeaders(keys);
    }
  };

  const span2 = (label: string, key: LbacQuarterlyExportColumnKey) => {
    const idx = colIndex.get(key);
    if (!idx) return;
    row1[idx - 1] = label;
    merges.push({ startCol: idx, endCol: idx, row: 1, label });
  };

  span2("AIP REF CODE", "aipRefCode");
  span2("MFO/PPA", "mfoPpa");
  span2("Implementing Unit", "implementingUnit");
  setGroup("Appropriation", ["contOrSupplemental", "appropriationCurrent", "appropriationTotal"]);
  setGroup("Obligation", ["cutOffObligation", "cutOffBalance"]);
  span2("Prior Year Accomplishments", "priorYearAccomplishments");
  setGroup(`Physical Targets ${year}`, ["physTargQ1", "physTargQ2", "physTargQ3", "physTargQ4", "physTargTotal"]);
  setGroup("Actual Physical Performance", [
    "actualPhysQ1", "actualPhysQ2", "actualPhysQ3", "actualPhysQ4", "actualPhysTotal",
  ]);
  span2("Variance as of", "variance");
  span2("% of Accomplishment", "accomplishment");
  span2("Remarks", "remarks");
  span2("Target for Budget Year", "targetForBudgetYear");

  return { row1, row2, merges };
}

export const LBAC_GROUP_DEPTH_ROOT_COLOR = "#0B5394";
export const LBAC_GROUP_DEPTH_CHILD_COLOR = "#26a69a";
export const LBAC_TOTAL_ROOT_COLOR = "#B6D7A8";
export const LBAC_TOTAL_CHILD_COLOR = "#FFF2CC";
export const LBAC_HEADER_COLOR = "#FFF2CC";
