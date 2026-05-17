import type {
  SaaobEntryResponse,
  SaaobGroupResponse,
} from "@/lib/http/client/responses/SaaobDataResponse";
import { isSaaobDataGroup } from "@/lib/http/client/responses/SaaobDataResponse";
import type {
  SaaobSummaryGroupResponse,
  SaaobSummaryItemResponse,
} from "@/lib/http/client/responses/SaaobSummaryDataResponse";
import { isSaaobSummaryDataGroup } from "@/lib/http/client/responses/SaaobSummaryDataResponse";

export type SaaobTreeNode = SaaobGroupResponse | SaaobEntryResponse;

export type SaaobFlatRow =
  | { kind: "group"; id: string; depth: number; data: SaaobGroupResponse }
  | {
    kind: "entry";
    id: string;
    depth: number;
    data: SaaobEntryResponse;
    groupId: string;
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
    entry.name.toLowerCase().includes(q)
    || (entry.accountCode ?? "").toLowerCase().includes(q)
    || (entry.other.remarks ?? "").toLowerCase().includes(q)
    || entry.annualBudget.toLowerCase().includes(q)
    || entry.appropriation.toLowerCase().includes(q)
    || entry.obligation.toLowerCase().includes(q)
    || entry.unObligatedBalance.toLowerCase().includes(q)
    || entry.other.pr.toLowerCase().includes(q)
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
      rows.push({ kind: "group", id: node.id, depth, data: node });
      if (ignoreCollapsed || !collapsed.has(node.id)) {
        rows.push(
          ...flattenSaaobVisible(node.children, collapsed, depth + 1, ignoreCollapsed, node.id),
        );
      }
      continue;
    }

    if (!parentGroupId) continue;
    rows.push({
      kind: "entry",
      id: node.id,
      depth,
      data: node,
      groupId: parentGroupId,
    });
  }

  return rows;
}

export function fmtAmount(value: string | null | undefined): string {
  if (!value) return "-";
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;

  return asNumber.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPercent(value: string | null | undefined): string {
  if (!value) return "-";
  const asNumber = Number(value);
  if (Number.isNaN(asNumber)) return value;

  return `${asNumber.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function txt(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

// ============================================================
// SUMMARY OF ACCOUNTS — Client utilities
// ============================================================

export type SaaobSummaryTreeNode = SaaobSummaryGroupResponse | SaaobSummaryItemResponse;

export type SaaobSummaryFlatRow =
  | { kind: "group"; id: string; depth: number; data: SaaobSummaryGroupResponse }
  | { kind: "item"; id: string; depth: number; data: SaaobSummaryItemResponse; groupId: string };

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
          output.push({ ...node, children: filteredChildren });
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
      rows.push({ kind: "group", id: node.id, depth, data: node });
      if (ignoreCollapsed || !collapsed.has(node.id)) {
        rows.push(
          ...flattenSaaobSummaryVisible(node.children, collapsed, depth + 1, ignoreCollapsed, node.id),
        );
      }
      continue;
    }

    if (!parentGroupId) continue;
    rows.push({ kind: "item", id: node.id, depth, data: node, groupId: parentGroupId });
  }

  return rows;
}
