import type {
  SaaobEntryResponse,
  SaaobGroupResponse,
  SaaobGroupTotalResponse,
} from '@/lib/http/client/responses/SaaobDataResponse';
import {isSaaobDataGroup} from '@/lib/http/client/responses/SaaobDataResponse';

// ============================================================
// EXPORT — Column definitions (shared by server and client)
// ============================================================

/**
 * Flat canonical list of all exportable SAAOB columns.
 * This is the source of truth for type derivation and lookup.
 */
export const SAAOB_EXPORT_COLUMNS = [
  {key: 'accountCode', label: 'Account Code', numeric: false},
  {key: 'annualBudget', label: 'Annual Budget', numeric: true},
  {key: 'supplementalOrContinuing', label: 'Supplemental/Continuing', numeric: true},
  {key: 'appropriation', label: 'Appropriation', numeric: true},
  {key: 'allotment', label: 'Allotment (Quarterly)', numeric: true},
  {key: 'obligation', label: 'Obligation', numeric: true},
  {key: 'unobligatedBalance', label: 'Unobligated Balance', numeric: true},
  {key: 'percentage', label: 'Percentage (%)', numeric: true},
  {key: 'remarks', label: 'Remarks', numeric: false},
  {key: 'quarterlyAllotmentBalance', label: 'Quarterly Allotment Balance', numeric: true},
  {key: 'quarterlyAllotmentBalancePct', label: 'Quarterly Allotment Balance (%)', numeric: true},
  {key: 'disbursed', label: 'Disbursed', numeric: true},
  {key: 'disbursedPct', label: 'Disbursed (%)', numeric: true},
  {key: 'disbursedVariance', label: 'Variance (Disbursed)', numeric: true},
  {key: 'lbacBudget', label: 'LBAC Budget', numeric: true},
  {key: 'lbacBudgetVariance', label: 'LBAC Budget Variance', numeric: true},
  {key: 'lbacObligated', label: 'LBAC Obligated', numeric: true},
  {key: 'lbacObligatedVariance', label: 'LBAC Obligated Variance', numeric: true},
  {key: 'obligationWithPRs', label: 'Obligation with PRs', numeric: true},
  {key: 'obligationWithPRsBalance', label: 'Unobligated Balance (OBR)', numeric: true},
  {key: 'obligationWithPRsPct', label: 'Percentage (OBR)', numeric: true},
  {key: 'pr', label: 'PRs', numeric: true},
] as const;

export type SaaobExportColumnKey = (typeof SAAOB_EXPORT_COLUMNS)[number]['key'];
export type SaaobExportColDef = (typeof SAAOB_EXPORT_COLUMNS)[number];

/** Column groups used for UI rendering. Typed against the flat list to ensure key correctness. */
export const SAAOB_EXPORT_COLUMN_GROUPS: ReadonlyArray<{
  group: string;
  columns: ReadonlyArray<SaaobExportColDef>;
}> = [
  {
    group: 'Main',
    columns: [
      SAAOB_EXPORT_COLUMNS[0], // accountCode
      SAAOB_EXPORT_COLUMNS[1], // annualBudget
      SAAOB_EXPORT_COLUMNS[2], // supplementalOrContinuing
      SAAOB_EXPORT_COLUMNS[3], // appropriation
      SAAOB_EXPORT_COLUMNS[4], // allotment
      SAAOB_EXPORT_COLUMNS[5], // obligation
      SAAOB_EXPORT_COLUMNS[6], // unobligatedBalance
      SAAOB_EXPORT_COLUMNS[7], // percentage
      SAAOB_EXPORT_COLUMNS[8], // remarks
    ],
  },
  {
    group: 'Quarterly Balance',
    columns: [
      SAAOB_EXPORT_COLUMNS[9], // quarterlyAllotmentBalance
      SAAOB_EXPORT_COLUMNS[10], // quarterlyAllotmentBalancePct
    ],
  },
  {
    group: 'Disbursement',
    columns: [
      SAAOB_EXPORT_COLUMNS[11], // disbursed
      SAAOB_EXPORT_COLUMNS[12], // disbursedPct
      SAAOB_EXPORT_COLUMNS[13], // disbursedVariance
    ],
  },
  {
    group: 'LBAC',
    columns: [
      SAAOB_EXPORT_COLUMNS[14], // lbacBudget
      SAAOB_EXPORT_COLUMNS[15], // lbacBudgetVariance
      SAAOB_EXPORT_COLUMNS[16], // lbacObligated
      SAAOB_EXPORT_COLUMNS[17], // lbacObligatedVariance
    ],
  },
  {
    group: 'OBR / PRs',
    columns: [
      SAAOB_EXPORT_COLUMNS[18], // obligationWithPRs
      SAAOB_EXPORT_COLUMNS[19], // obligationWithPRsBalance
      SAAOB_EXPORT_COLUMNS[20], // obligationWithPRsPct
      SAAOB_EXPORT_COLUMNS[21], // pr
    ],
  },
];

const _VALID_COLUMN_KEYS = new Set<string>(SAAOB_EXPORT_COLUMNS.map((c) => c.key));

export function parseSaaobExportColumns(raw: string): SaaobExportColumnKey[] | null {
  if (!raw.trim()) return null;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (!parts.every((p) => _VALID_COLUMN_KEYS.has(p))) return null;
  return parts as SaaobExportColumnKey[];
}
import type {
  SaaobStatisticGroupResponse,
  SaaobStatisticItemResponse,
} from '@/lib/http/client/responses/SaaobStatisticsDataResponse';
import {isSaaobStatisticDataGroup} from '@/lib/http/client/responses/SaaobStatisticsDataResponse';
import type {
  SaaobSummaryGroupResponse,
  SaaobSummaryItemResponse,
} from '@/lib/http/client/responses/SaaobSummaryDataResponse';
import {isSaaobSummaryDataGroup} from '@/lib/http/client/responses/SaaobSummaryDataResponse';

export type SaaobTreeNode = SaaobGroupResponse | SaaobEntryResponse;

export type SaaobFlatRow =
  | {kind: 'group'; id: string; depth: number; data: SaaobGroupResponse}
  | {
      kind: 'entry';
      id: string;
      depth: number;
      data: SaaobEntryResponse;
      groupId: string;
    }
  | {
      kind: 'total';
      id: string;
      depth: number;
      data: SaaobGroupTotalResponse;
      groupId: string;
      groupName: string;
    };

export function collectSaaobGroups(
  nodes: SaaobTreeNode[],
  result: SaaobGroupResponse[] = [],
): SaaobGroupResponse[] {
  for (const node of nodes) {
    if (isSaaobDataGroup(node)) {
      result.push(node);
      collectSaaobGroups(node.children, result);
    }
  }
  return result;
}

function entryMatchesQuery(entry: SaaobEntryResponse, query: string): boolean {
  const q = query.toLowerCase();
  return (
    entry.name.toLowerCase().includes(q) ||
    (entry.accountCode ?? '').toLowerCase().includes(q) ||
    (entry.other.remarks ?? '').toLowerCase().includes(q) ||
    entry.annualBudget.toLowerCase().includes(q) ||
    entry.appropriation.toLowerCase().includes(q) ||
    entry.obligation.toLowerCase().includes(q) ||
    entry.unObligatedBalance.toLowerCase().includes(q) ||
    entry.other.pr.toLowerCase().includes(q)
  );
}

/**
 * Filters a SAAOB tree in-memory by query.
 * - Matching groups include their full descendants.
 * - Non-matching groups are kept only when they have matching descendants.
 */
export function filterSaaobTreeByQuery(
  tree: SaaobGroupResponse[],
  query: string,
): SaaobGroupResponse[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tree;

  const filterNodes = (nodes: SaaobTreeNode[]): SaaobTreeNode[] => {
    const output: SaaobTreeNode[] = [];

    for (const node of nodes) {
      if (isSaaobDataGroup(node)) {
        const groupMatches = node.name.toLowerCase().includes(normalized);
        if (groupMatches) {
          output.push(node);
          continue;
        }

        const filteredChildren = filterNodes(node.children);
        if (filteredChildren.length > 0) {
          output.push({
            ...node,
            children: filteredChildren,
          });
        }
        continue;
      }

      if (entryMatchesQuery(node, normalized)) {
        output.push(node);
      }
    }

    return output;
  };

  return filterNodes(tree).filter(isSaaobDataGroup);
}

export function flattenSaaobVisible(
  nodes: SaaobTreeNode[],
  collapsed: Set<string>,
  depth: number,
  ignoreCollapsed = false,
  parentGroupId?: string,
): SaaobFlatRow[] {
  const rows: SaaobFlatRow[] = [];

  for (const node of nodes) {
    if (isSaaobDataGroup(node)) {
      rows.push({kind: 'group', id: node.id, depth, data: node});
      if (ignoreCollapsed || !collapsed.has(node.id)) {
        rows.push(
          ...flattenSaaobVisible(node.children, collapsed, depth + 1, ignoreCollapsed, node.id),
        );
        rows.push({
          kind: 'total',
          id: `${node.id}:total`,
          depth: depth + 1,
          data: node.total,
          groupId: node.id,
          groupName: node.name,
        });
      }
      continue;
    }

    if (!parentGroupId) continue;
    rows.push({
      kind: 'entry',
      id: node.id,
      depth,
      data: node,
      groupId: parentGroupId,
    });
  }

  return rows;
}

export function fmtAmount(value: string | null | undefined): string {
  if (!value) return '-';
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;

  return asNumber.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPercent(value: string | null | undefined): string {
  if (!value) return '-';
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;

  return `${asNumber.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function txt(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return value;
}

// ============================================================
// SUMMARY OF ACCOUNTS — Client utilities
// ============================================================

export type SaaobSummaryTreeNode = SaaobSummaryGroupResponse | SaaobSummaryItemResponse;

export type SaaobSummaryFlatRow =
  | {kind: 'group'; id: string; depth: number; data: SaaobSummaryGroupResponse}
  | {kind: 'item'; id: string; depth: number; data: SaaobSummaryItemResponse; groupId: string};

export function collectSaaobSummaryGroups(
  nodes: SaaobSummaryTreeNode[],
  result: SaaobSummaryGroupResponse[] = [],
): SaaobSummaryGroupResponse[] {
  for (const node of nodes) {
    if (isSaaobSummaryDataGroup(node)) {
      result.push(node);
      collectSaaobSummaryGroups(node.children, result);
    }
  }
  return result;
}

export function filterSaaobSummaryTreeByQuery(
  tree: SaaobSummaryGroupResponse[],
  query: string,
): SaaobSummaryGroupResponse[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tree;

  const filterNodes = (nodes: SaaobSummaryTreeNode[]): SaaobSummaryTreeNode[] => {
    const output: SaaobSummaryTreeNode[] = [];

    for (const node of nodes) {
      if (isSaaobSummaryDataGroup(node)) {
        const groupMatches = node.name.toLowerCase().includes(normalized);
        if (groupMatches) {
          output.push(node);
          continue;
        }
        const filteredChildren = filterNodes(node.children);
        if (filteredChildren.length > 0) {
          output.push({...node, children: filteredChildren});
        }
        continue;
      }

      if (node.name.toLowerCase().includes(normalized)) {
        output.push(node);
      }
    }

    return output;
  };

  return filterNodes(tree).filter(isSaaobSummaryDataGroup);
}

export function flattenSaaobSummaryVisible(
  nodes: SaaobSummaryTreeNode[],
  collapsed: Set<string>,
  depth: number,
  ignoreCollapsed = false,
  parentGroupId?: string,
): SaaobSummaryFlatRow[] {
  const rows: SaaobSummaryFlatRow[] = [];

  for (const node of nodes) {
    if (isSaaobSummaryDataGroup(node)) {
      rows.push({kind: 'group', id: node.id, depth, data: node});
      if (ignoreCollapsed || !collapsed.has(node.id)) {
        rows.push(
          ...flattenSaaobSummaryVisible(
            node.children,
            collapsed,
            depth + 1,
            ignoreCollapsed,
            node.id,
          ),
        );
      }
      continue;
    }

    if (!parentGroupId) continue;
    rows.push({kind: 'item', id: node.id, depth, data: node, groupId: parentGroupId});
  }

  return rows;
}

// ============================================================
// STATISTICS — Client utilities
// ============================================================

export type SaaobStatisticTreeNode = SaaobStatisticGroupResponse | SaaobStatisticItemResponse;

export type SaaobStatisticFlatRow =
  | {kind: 'group'; id: string; depth: number; data: SaaobStatisticGroupResponse}
  | {kind: 'item'; id: string; depth: number; data: SaaobStatisticItemResponse; groupId?: string};

export function collectSaaobStatisticGroups(
  nodes: SaaobStatisticTreeNode[],
  result: SaaobStatisticGroupResponse[] = [],
): SaaobStatisticGroupResponse[] {
  for (const node of nodes) {
    if (isSaaobStatisticDataGroup(node)) {
      result.push(node);
      collectSaaobStatisticGroups(node.children, result);
    }
  }
  return result;
}

export function filterSaaobStatisticTreeByQuery(
  tree: Array<SaaobStatisticGroupResponse | SaaobStatisticItemResponse>,
  query: string,
): Array<SaaobStatisticGroupResponse | SaaobStatisticItemResponse> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return tree;

  const filterNodes = (nodes: SaaobStatisticTreeNode[]): SaaobStatisticTreeNode[] => {
    const output: SaaobStatisticTreeNode[] = [];

    for (const node of nodes) {
      if (isSaaobStatisticDataGroup(node)) {
        const groupMatches = node.name.toLowerCase().includes(normalized);
        if (groupMatches) {
          output.push(node);
          continue;
        }

        const filteredChildren = filterNodes(node.children);
        if (filteredChildren.length > 0) {
          output.push({...node, children: filteredChildren});
        }
        continue;
      }

      if (node.name.toLowerCase().includes(normalized)) {
        output.push(node);
      }
    }

    return output;
  };

  return filterNodes(tree);
}

export function flattenSaaobStatisticVisible(
  nodes: SaaobStatisticTreeNode[],
  collapsed: Set<string>,
  depth: number,
  ignoreCollapsed = false,
  parentGroupId?: string,
): SaaobStatisticFlatRow[] {
  const rows: SaaobStatisticFlatRow[] = [];

  for (const node of nodes) {
    if (isSaaobStatisticDataGroup(node)) {
      rows.push({kind: 'group', id: node.id, depth, data: node});
      if (ignoreCollapsed || !collapsed.has(node.id)) {
        rows.push(
          ...flattenSaaobStatisticVisible(
            node.children,
            collapsed,
            depth + 1,
            ignoreCollapsed,
            node.id,
          ),
        );
      }
      continue;
    }

    rows.push({kind: 'item', id: node.id, depth, data: node, groupId: parentGroupId});
  }

  return rows;
}
