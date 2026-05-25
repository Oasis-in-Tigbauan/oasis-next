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
  { key: "programProjectActivity", label: "Program/Project/Activity", numeric: false },
  { key: "totalCost", label: "Total Cost", numeric: true },
  { key: "performanceIndicator", label: "Performance Indicator", numeric: false },
  { key: "priorYearAccomplishments", label: "Prior Year Accomplishments", numeric: false },
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

export const LBE_F1_BUDGET_TYPES = ["PS", "MOOE", "FE", "CO"] as const;

export type LbeF1BudgetType = (typeof LBE_F1_BUDGET_TYPES)[number];

export type LbacForm3ExportColumnKey = (typeof LBAC_FORM3_EXPORT_COLUMNS)[number]["key"];
export type LbacForm5ExportColumnKey = (typeof LBAC_FORM5_EXPORT_COLUMNS)[number]["key"];
export type LbacForm5AExportColumnKey = (typeof LBAC_FORM5A_EXPORT_COLUMNS)[number]["key"];

export type LbacForm3ExportColDef = (typeof LBAC_FORM3_EXPORT_COLUMNS)[number];
export type LbacForm5ExportColDef = (typeof LBAC_FORM5_EXPORT_COLUMNS)[number];
export type LbacForm5AExportColDef = (typeof LBAC_FORM5A_EXPORT_COLUMNS)[number];

export type LbacFormExportFlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacItemResponse }
  | { kind: "group-total"; id: string; depth: number; data: LbacGroupTotals; isRoot: boolean };

export function filterLbacTreeByImplementingUnit(
  tree: LbacGroupResponse[],
  implementingUnitId: string,
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
        if (item.implementingUnit?.id === implementingUnitId) {
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

export function flattenLbacFlatItemsForOffice(
  tree: LbacGroupResponse[],
  implementingUnitId: string,
): LbacItemResponse[] {
  const items: LbacItemResponse[] = [];

  const walk = (nodes: Array<LbacGroupResponse | LbacItemResponse>) => {
    for (const node of nodes) {
      if (node.type === 6767) {
        walk((node as LbacGroupResponse).children);
      } else {
        const item = node as LbacItemResponse;
        if (item.implementingUnit?.id === implementingUnitId) {
          items.push(item);
        }
      }
    }
  };

  walk(tree);
  return items;
}
