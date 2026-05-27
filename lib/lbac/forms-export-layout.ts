import type {
  LbacGroupResponse,
  LbacGroupTotals,
  LbacItemResponse,
} from "@/lib/http/client/responses";

export const LBAC_FORM3_EXPORT_COLUMNS = [
  { key: "aipRefCode", label: "PPA Code", numeric: false },
  { key: "majorFinalOutput", label: "Major Final Output", numeric: false },
  { key: "performanceOutputIndicator", label: "Performance Indicator", numeric: false },
  { key: "targetQ1", label: "Target Q1", numeric: false },
  { key: "targetQ2", label: "Target Q2", numeric: false },
  { key: "targetQ3", label: "Target Q3", numeric: false },
  { key: "targetQ4", label: "Target Q4", numeric: false },
  { key: "targetTotal", label: "Target Total", numeric: false },
  { key: "actualQ1", label: "Actual Q1", numeric: false },
  { key: "actualQ2", label: "Actual Q2", numeric: false },
  { key: "actualQ3", label: "Actual Q3", numeric: false },
  { key: "actualQ4", label: "Actual Q4", numeric: false },
  { key: "actualTotal", label: "Actual Total", numeric: false },
  { key: "variance", label: "Variance", numeric: false },
  { key: "remarks", label: "Remarks", numeric: false },
] as const;

export const LBAC_FORM5_EXPORT_COLUMNS = [
  { key: "aipRefCode", label: "PPA Code", numeric: false },
  { key: "ppaDescription", label: "PPA Description/ Major Final Output", numeric: false },
  { key: "targetOutput", label: "Target Output", numeric: false },
  { key: "actualOutput", label: "Actual Output", numeric: false },
  { key: "variance", label: "Variance", numeric: false },
  { key: "accomplishment", label: "% of Accomplishment", numeric: false },
  { key: "allotmentReleased", label: "Allotment Released", numeric: true },
  { key: "actualObligationsIncurred", label: "Actual Obligations Incurred", numeric: true },
  { key: "financialVariance", label: "Variance", numeric: true },
  { key: "absorptiveCapacity", label: "Absorptive Capacity", numeric: true },
] as const;

export const LBE_FORM5_EXPORT_COLUMNS = [
  { key: "programProjectActivity", label: "Program/Project/Activity", numeric: false },
  { key: "totalCost", label: "Total Cost", numeric: true },
  { key: "performanceIndicator", label: "Performance Indicator", numeric: false },
  { key: "priorYearAccomplishments", label: "Prior Year Accomplishments (Actual)", numeric: false },
  { key: "physicalTargets", label: "Physical Targets", numeric: false },
  { key: "remarks", label: "Remarks", numeric: false },
] as const;

export const LBAC_FORM5A_EXPORT_COLUMNS = [
  { key: "programProjectActivity", label: "Program/Project/Activity", numeric: false },
  { key: "allocationQ1", label: "Allocation Q1", numeric: true },
  { key: "allocationQ2", label: "Allocation Q2", numeric: true },
  { key: "allocationQ3", label: "Allocation Q3", numeric: true },
  { key: "allocationQ4", label: "Allocation Q4", numeric: true },
  { key: "allocationTotal", label: "Allocation Total", numeric: true },
  { key: "targetQ1", label: "Target Q1", numeric: false },
  { key: "targetQ2", label: "Target Q2", numeric: false },
  { key: "targetQ3", label: "Target Q3", numeric: false },
  { key: "targetQ4", label: "Target Q4", numeric: false },
] as const;

export const LBE_F1_ARO_TYPES = ["ps", "mooe", "finex", "capex"] as const;

export type LbeF1AroType = (typeof LBE_F1_ARO_TYPES)[number];
export type LbeF1BudgetType = "ab" | "sb" | "rb";

export function getLbeF1FormNo(aroType: string | null | undefined): string {
  if (aroType === "ps") return "LBE FORM NO.1";
  if (aroType === "mooe") return "LBE FORM NO.1A";
  return "LBE FORM NO.1C.";
}

export function getLbeF1Title(aroType: string | null | undefined): string {
  if (aroType === "ps") return "ALLOTMENT RELEASE ORDER FOR PERSONAL SERVICES (ARO FOR PS)";
  if (aroType === "mooe") return "ALLOTMENT RELEASE ORDER FOR MAINTENANCE AND OTHER OPERATING EXPENSES\n(ARO FOR MOOE)";
  if (aroType === "capex") return "ALLOTMENT RELEASE ORDER FOR CAPITAL EXPENDITURES (ARO FOR CapEx)";
  return "ALLOTMENT RELEASE ORDER FOR FINANCIAL EXPENDITURES (ARO FOR FinEx)";
}

export function getLbeF1AroCode(aroType: string | null | undefined): string {
  if (aroType === "ps") return "PS";
  if (aroType === "mooe") return "MOOE";
  if (aroType === "capex") return "CAPEX";
  if (aroType === "finex") return "FINEX";
  return "ARO";
}

export function getLbeF1BudgetTypeLabel(budgetType: string | null | undefined): string {
  if (budgetType === "ab") return "ANNUAL BUDGET";
  if (budgetType === "sb") return "SUPPLEMENTAL BUDGET";
  if (budgetType === "rb") return "REENACTED BUDGET";
  return "";
}

const _SMALL = [
  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
] as const;

const _TENS = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
] as const;

const _SCALES = ["", "THOUSAND", "MILLION", "BILLION", "TRILLION"] as const;

function _chunkToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds > 0) {
    parts.push(`${_SMALL[hundreds]} HUNDRED`);
    if (remainder > 0) {
      parts.push("AND");
    }
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(_SMALL[remainder]);
    } else {
      const ten = Math.floor(remainder / 10);
      const one = remainder % 10;
      parts.push(_TENS[ten]);
      if (one > 0) {
        parts.push(_SMALL[one]);
      }
    }
  }

  return parts.join(" ").trim();
}

function _integerToWords(input: bigint): string {
  if (input === 0n) return "ZERO";

  let n = input;
  const pieces: string[] = [];
  let scaleIndex = 0;

  while (n > 0n) {
    const chunk = Number(n % 1000n);
    if (chunk > 0) {
      const chunkWords = _chunkToWords(chunk);
      const scale = _SCALES[scaleIndex];
      pieces.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    n /= 1000n;
    scaleIndex++;
  }

  return pieces.join(" ").trim();
}

export function amountToEnglishWords(value: string | number): string {
  const raw = String(value ?? "0").trim().replace(/,/g, "");
  const valid = /^\d+(\.\d+)?$/.test(raw) ? raw : "0";
  const [integerRaw, decimalsRaw = ""] = valid.split(".");
  const integerPart = BigInt(integerRaw || "0");
  const cents = (decimalsRaw + "00").slice(0, 2);
  const words = _integerToWords(integerPart);
  const centsValue = Number.parseInt(cents, 10);
  if (centsValue === 0) {
    return `${words} PESOS`;
  }

  const centsLabel = centsValue === 1 ? "CENT" : "CENTS";
  return `${words} PESOS AND ${centsValue} ${centsLabel}`;
}

function _quarterOrdinal(quarter: number): string {
  if (quarter === 1) return "1st";
  if (quarter === 2) return "2nd";
  if (quarter === 3) return "3rd";
  return "4th";
}

export function getForm3QuarterEndingLabel(year: number, quarter: number): string {
  const normalizedQuarter = Math.min(4, Math.max(1, quarter));
  const endMonth = normalizedQuarter * 3;
  const endDate = new Date(Date.UTC(year, endMonth, 0));
  const month = endDate.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const day = String(endDate.getUTCDate()).padStart(2, "0");
  return `For the Quarter Ending ${month} ${day}, ${year} (${_quarterOrdinal(normalizedQuarter)} Quarter)`;
}

export function getForm5SemesterEndingLabel(year: number, quarter: number): string {
  const normalizedQuarter = Math.min(4, Math.max(1, quarter));
  if (normalizedQuarter <= 2) {
    return `As of the 1st Semester Ending June 30, ${year}`;
  }
  return `As of the 2nd Semester Ending December 31, ${year}`;
}

export type LbacForm3ExportColumnKey = (typeof LBAC_FORM3_EXPORT_COLUMNS)[number]["key"];
export type LbacForm5ExportColumnKey = (typeof LBAC_FORM5_EXPORT_COLUMNS)[number]["key"];
export type LbeForm5ExportColumnKey = (typeof LBE_FORM5_EXPORT_COLUMNS)[number]["key"];
export type LbacForm5AExportColumnKey = (typeof LBAC_FORM5A_EXPORT_COLUMNS)[number]["key"];

export type LbacForm3ExportColDef = (typeof LBAC_FORM3_EXPORT_COLUMNS)[number];
export type LbacForm5ExportColDef = (typeof LBAC_FORM5_EXPORT_COLUMNS)[number];
export type LbeForm5ExportColDef = (typeof LBE_FORM5_EXPORT_COLUMNS)[number];
export type LbacForm5AExportColDef = (typeof LBAC_FORM5A_EXPORT_COLUMNS)[number];

export type LbacFormExportFlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacItemResponse }
  | { kind: "group-total"; id: string; depth: number; data: LbacGroupTotals; isRoot: boolean };

export function filterLbacTreeByAroLink(
  tree: LbacGroupResponse[],
  aroLink: string,
): LbacGroupResponse[] {
  const walkGroup = (group: LbacGroupResponse): LbacGroupResponse | null => {
    const filteredChildren: Array<LbacGroupResponse | LbacItemResponse> = [];

    for (const child of group.children) {
      if (child.type === 6767) {
        const keptGroup = walkGroup(child as LbacGroupResponse);
        if (keptGroup) {
          filteredChildren.push(keptGroup);
        }
      } else {
        const item = child as LbacItemResponse;
        if (item.other.aro?.office.id === aroLink) {
          filteredChildren.push(item);
        }
      }
    }

    if (filteredChildren.length === 0) return null;

    return {
      ...group,
      children: filteredChildren,
    };
  };

  return tree
    .map(walkGroup)
    .filter((group): group is LbacGroupResponse => group !== null);
}

function _flatten(tree: LbacGroupResponse[]): LbacFormExportFlatRow[] {
  const rows: LbacFormExportFlatRow[] = [];

  const walk = (nodes: Array<LbacGroupResponse | LbacItemResponse>, depth: number) => {
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

export function flattenLbacForm3ForExport(tree: LbacGroupResponse[]): LbacFormExportFlatRow[] {
  return _flatten(tree);
}

export function flattenLbacForm5ForExport(tree: LbacGroupResponse[]): LbacFormExportFlatRow[] {
  return _flatten(tree);
}

export function flattenLbacForm5AForExport(tree: LbacGroupResponse[]): LbacFormExportFlatRow[] {
  return _flatten(tree);
}

function _parseNumeric(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

export type LbacFormsCellValue = string | number;

export function getForm3CellValue(
  row: LbacFormExportFlatRow,
  key: LbacForm3ExportColumnKey,
): LbacFormsCellValue {
  if (row.kind === "group") {
    return key === "majorFinalOutput" ? row.data.name : "";
  }

  if (row.kind === "group-total") {
    return key === "majorFinalOutput" ? (row.isRoot ? "Grand Total" : "Total") : "";
  }

  const item = row.data;
  switch (key) {
  case "aipRefCode": return item.aipRefCode?.aipReferenceCode ?? "";
  case "majorFinalOutput": return item.majorFinalOutput ?? "";
  case "performanceOutputIndicator": return item.performanceOutputIndicator ?? "";
  case "targetQ1": return item.quarterlyReport.physicalTargets.Q1 ?? "";
  case "targetQ2": return item.quarterlyReport.physicalTargets.Q2 ?? "";
  case "targetQ3": return item.quarterlyReport.physicalTargets.Q3 ?? "";
  case "targetQ4": return item.quarterlyReport.physicalTargets.Q4 ?? "";
  case "targetTotal": return item.quarterlyReport.physicalTargets.total ?? "";
  case "actualQ1": return item.quarterlyReport.actualPhysicalPerformance.Q1 ?? "";
  case "actualQ2": return item.quarterlyReport.actualPhysicalPerformance.Q2 ?? "";
  case "actualQ3": return item.quarterlyReport.actualPhysicalPerformance.Q3 ?? "";
  case "actualQ4": return item.quarterlyReport.actualPhysicalPerformance.Q4 ?? "";
  case "actualTotal": return item.quarterlyReport.actualPhysicalPerformance.total ?? "";
  case "variance": return item.quarterlyReport.variance ?? "";
  case "remarks": return item.quarterlyReport.remarks ?? "";
  default: return "";
  }
}

export function getForm5CellValue(
  row: LbacFormExportFlatRow,
  key: LbacForm5ExportColumnKey,
  quarter: number,
): LbacFormsCellValue {
  const quarterKey = quarter === 1 ? "Q1" : quarter === 2 ? "Q2" : quarter === 3 ? "Q3" : "Q4";

  if (row.kind === "group") {
    if (key === "ppaDescription") return row.data.name;
    return "";
  }

  if (row.kind === "group-total") {
    if (key === "ppaDescription") return row.isRoot ? "Grand Total" : "Total";
    if (key === "allotmentReleased") return _parseNumeric(row.data.financialAllocation[quarterKey]);
    if (key === "actualObligationsIncurred") return _parseNumeric(row.data.actualFinancialPerformance[quarterKey]);
    if (key === "financialVariance") {
      return _parseNumeric(row.data.financialAllocation[quarterKey])
        - _parseNumeric(row.data.actualFinancialPerformance[quarterKey]);
    }
    if (key === "absorptiveCapacity") {
      const allotment = _parseNumeric(row.data.financialAllocation[quarterKey]);
      const obligations = _parseNumeric(row.data.actualFinancialPerformance[quarterKey]);
      return allotment === 0 ? 0 : obligations / allotment;
    }
    return "";
  }

  const item = row.data;
  const allotmentReleased = _parseNumeric(item.financialAllocation[quarterKey]);
  const actualObligations = _parseNumeric(item.actualFinancialPerformance[quarterKey]);
  switch (key) {
  case "aipRefCode": return item.aipRefCode?.aipReferenceCode ?? "";
  case "ppaDescription": return item.mfoPpa;
  case "targetOutput": return item.quarterlyReport.physicalTargets[quarterKey] ?? "";
  case "actualOutput": return item.quarterlyReport.actualPhysicalPerformance[quarterKey] ?? "";
  case "variance": return item.quarterlyReport.variance ?? "";
  case "accomplishment": return item.quarterlyReport.accomplishment ?? "";
  case "allotmentReleased": return allotmentReleased;
  case "actualObligationsIncurred": return actualObligations;
  case "financialVariance": return allotmentReleased - actualObligations;
  case "absorptiveCapacity": return allotmentReleased === 0 ? 0 : actualObligations / allotmentReleased;
  default: return "";
  }
}

export function getLbeForm5CellValue(
  row: LbacFormExportFlatRow,
  key: LbeForm5ExportColumnKey,
): LbacFormsCellValue {
  if (row.kind === "group") {
    if (key === "programProjectActivity") return row.data.name;
    return "";
  }

  if (row.kind === "group-total") {
    if (key === "programProjectActivity") return row.isRoot ? "Grand Total" : "Total";
    if (key === "totalCost") return _parseNumeric(row.data.appropriation.current);
    return "";
  }

  const item = row.data;
  switch (key) {
  case "programProjectActivity": return item.mfoPpa;
  case "totalCost": return _parseNumeric(item.appropriation.current);
  case "performanceIndicator": return item.performanceOutputIndicator ?? "";
  case "priorYearAccomplishments": return item.other.priorYearAccomplishments ?? "";
  case "physicalTargets": return item.other.physicalTargets ?? "";
  case "remarks": return item.other.remarks ?? "";
  default: return "";
  }
}

export function getForm5ACellValue(
  row: LbacFormExportFlatRow,
  key: LbacForm5AExportColumnKey,
): LbacFormsCellValue {
  if (row.kind === "group") {
    return key === "programProjectActivity" ? row.data.name : "";
  }

  if (row.kind === "group-total") {
    if (key === "programProjectActivity") return row.isRoot ? "Grand Total" : "Total";
    if (key === "allocationQ1") return _parseNumeric(row.data.financialAllocation.Q1);
    if (key === "allocationQ2") return _parseNumeric(row.data.financialAllocation.Q2);
    if (key === "allocationQ3") return _parseNumeric(row.data.financialAllocation.Q3);
    if (key === "allocationQ4") return _parseNumeric(row.data.financialAllocation.Q4);
    if (key === "allocationTotal") return _parseNumeric(row.data.financialAllocation.total);
    return "";
  }

  const item = row.data;
  switch (key) {
  case "programProjectActivity": return item.mfoPpa;
  case "allocationQ1": return _parseNumeric(item.financialAllocation.Q1);
  case "allocationQ2": return _parseNumeric(item.financialAllocation.Q2);
  case "allocationQ3": return _parseNumeric(item.financialAllocation.Q3);
  case "allocationQ4": return _parseNumeric(item.financialAllocation.Q4);
  case "allocationTotal": return _parseNumeric(item.financialAllocation.total);
  case "targetQ1": return item.quarterlyReport.physicalTargets.Q1 ?? "";
  case "targetQ2": return item.quarterlyReport.physicalTargets.Q2 ?? "";
  case "targetQ3": return item.quarterlyReport.physicalTargets.Q3 ?? "";
  case "targetQ4": return item.quarterlyReport.physicalTargets.Q4 ?? "";
  default: return "";
  }
}

export function flattenLbacFlatItemsForAroLink(
  tree: LbacGroupResponse[],
  aroLink: string,
): LbacItemResponse[] {
  const items: LbacItemResponse[] = [];

  const walk = (nodes: Array<LbacGroupResponse | LbacItemResponse>) => {
    for (const node of nodes) {
      if (node.type === 6767) {
        walk((node as LbacGroupResponse).children);
      } else {
        const item = node as LbacItemResponse;
        if (item.other.aro?.office.id === aroLink) {
          items.push(item);
        }
      }
    }
  };

  walk(tree);
  return items;
}
