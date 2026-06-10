"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useColumnVisibility } from "@/common/column-visibility";
import {
  buildMainDataHeaderLayout,
  formatMainCellForPreview,
  getMainDataCellValue,
  LBAC_GROUP_DEPTH_CHILD_COLOR,
  LBAC_GROUP_DEPTH_ROOT_COLOR,
  LBAC_HEADER_COLOR,
  LBAC_MAIN_EXPORT_COLUMN_GROUPS,
  LBAC_MAIN_EXPORT_COLUMNS,
  LBAC_TOTAL_CHILD_COLOR,
  LBAC_TOTAL_ROOT_COLOR,
  resolveMainExportColumns,
  type LbacMainExportColDef,
  type LbacMainExportColumnKey,
  type LbacMainExportFlatRow,
} from "@/common/lbac/export-layout";
import type { LbacGroupResponse, LbacGroupTotals, LbacItemResponse } from "@/lib/http/client/responses";

import {
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";

export const LBAC_DATA_PAGE_STORAGE_KEY = "lbac.data";

const PINNED_KEYS = new Set<LbacMainExportColumnKey>(["aipRefCode", "mfoPpa"]);

export const LBAC_PAGE_COLUMNS = LBAC_MAIN_EXPORT_COLUMNS.map(col => ({
  ...col,
  pinned: PINNED_KEYS.has(col.key),
}));

export function useLbacDataColumnVisibility() {
  return useColumnVisibility(
    LBAC_DATA_PAGE_STORAGE_KEY,
    LBAC_PAGE_COLUMNS,
    LBAC_MAIN_EXPORT_COLUMN_GROUPS.map(g => ({
      group: g.group,
      columns: g.columns.map(c => ({
        ...c,
        pinned: PINNED_KEYS.has(c.key),
      })),
    })),
  );
}

export function LbacPageTableHeader({
  year,
  columns,
}: {
  year: number;
  columns: readonly LbacMainExportColDef[];
}) {
  const { row1, row2 } = buildMainDataHeaderLayout(year, columns);

  return (
    <>
      <TableRow>
        {columns.map((col, i) => (
          <TableHead
            key={`h1-${col.key}`}
            className="align-middle border-l first:border-l"
            style={{ backgroundColor: LBAC_HEADER_COLOR }}
          >
            {row1[i] ?? ""}
          </TableHead>
        ))}
      </TableRow>
      <TableRow>
        {columns.map((col, i) => (
          <TableHead
            key={`h2-${col.key}`}
            className="min-w-24"
            style={{ backgroundColor: LBAC_HEADER_COLOR }}
          >
            {row2[i] ?? ""}
          </TableHead>
        ))}
      </TableRow>
    </>
  );
}

function renderCellContent(
  col: LbacMainExportColDef,
  raw: string | number,
  options?: { groupNameNode?: ReactNode; depth?: number },
): ReactNode {
  if (options?.groupNameNode && col.key === "mfoPpa") {
    return options.groupNameNode;
  }

  const display = formatMainCellForPreview(raw, col.numeric ?? false);
  if (col.key === "mfoPpa" && options?.depth != null && !options.groupNameNode) {
    return (
      <span style={{ paddingLeft: `${options.depth * 14 + 4}px` }} className="block">
        {display}
      </span>
    );
  }
  return display;
}

export function LbacPageGroupRow({
  row,
  columns,
  isCollapsed,
  isSelected,
  onToggleCollapse,
  onClick,
  onDoubleClick,
  measureRef,
  dataIndex,
}: {
  row: Extract<LbacMainExportFlatRow, { kind: "group" }>;
  columns: readonly LbacMainExportColDef[];
  isCollapsed: boolean;
  isSelected: boolean;
  onToggleCollapse: () => void;
  onClick: () => void;
  onDoubleClick: () => void;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) {
  const bg = row.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR;

  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className={`cursor-pointer select-none text-white ${isSelected ? "outline outline-2 outline-primary" : ""}`}
      style={{ backgroundColor: bg }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {columns.map(col => {
        const content =
          col.key === "mfoPpa"
            ? (
              <button
                type="button"
                className="flex items-center gap-1 font-semibold text-white text-left hover:opacity-80 w-full"
                style={{ paddingLeft: `${row.depth * 14}px` }}
                onClick={e => {
                  e.stopPropagation();
                  onToggleCollapse();
                }}
              >
                {isCollapsed
                  ? <ChevronRight className="size-3 shrink-0" />
                  : <ChevronDown className="size-3 shrink-0" />}
                <span>{row.data.name}</span>
              </button>
            )
            : "";

        return (
          <TableCell
            key={col.key}
            className={
              col.key === "mfoPpa"
                ? "w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words"
                : undefined
            }
          >
            {content}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

export function LbacPageTotalRow({
  row,
  columns,
  measureRef,
  dataIndex,
}: {
  row: Extract<LbacMainExportFlatRow, { kind: "group-total" }>;
  columns: readonly LbacMainExportColDef[];
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) {
  const bg = row.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR;

  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className="font-bold"
      style={{ backgroundColor: bg }}
    >
      {columns.map(col => (
        <TableCell
          key={col.key}
          className={`${col.numeric ? "text-right font-mono" : ""} ${
            col.key === "mfoPpa" ? "w-[275px] min-w-[275px] max-w-[275px]" : ""
          }`}
          style={col.key === "mfoPpa" ? { paddingLeft: `${row.depth * 14 + 4}px` } : undefined}
        >
          {renderCellContent(col, getMainDataCellValue(row, col.key))}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function LbacPageItemRow({
  row,
  columns,
  rowClassName,
  onClick,
  onDoubleClick,
  measureRef,
  dataIndex,
}: {
  row: Extract<LbacMainExportFlatRow, { kind: "item" }>;
  columns: readonly LbacMainExportColDef[];
  rowClassName?: string;
  onClick: () => void;
  onDoubleClick: () => void;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) {
  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className={`cursor-pointer select-none ${rowClassName ?? ""}`}
      title="Double-click to edit"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {columns.map(col => (
        <TableCell
          key={col.key}
          className={`${col.numeric ? "text-right font-mono" : ""} ${
            col.key === "mfoPpa" ||
            col.key === "majorFinalOutput" ||
            col.key === "performanceOutputIndicator" ||
            col.key === "targetForBudgetYear" ||
            col.key === "remarks" ||
            col.key.startsWith("qr")
              ? "w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words"
              : col.key === "aipRefCode"
                ? "font-mono"
                : ""
          }`}
        >
          {renderCellContent(col, getMainDataCellValue(row, col.key), {
            depth: row.depth,
          })}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function LbacPageSpacerRow({
  colCount,
  height,
}: {
  colCount: number;
  height: number;
}) {
  return (
    <TableRow>
      <TableCell colSpan={colCount} style={{ height: `${height}px` }} />
    </TableRow>
  );
}

export function toLbacExportFlatRow(row: {
  kind: "group";
  id: string;
  depth: number;
  data: LbacGroupResponse;
} | {
  kind: "item";
  id: string;
  depth: number;
  data: LbacItemResponse;
  groupId?: string;
} | {
  kind: "group-total";
  id: string;
  depth: number;
  data: LbacGroupTotals;
  isRoot: boolean;
  groupId?: string;
}): LbacMainExportFlatRow {
  if (row.kind === "group") {
    return { kind: "group", id: row.id, depth: row.depth, data: row.data };
  }
  if (row.kind === "group-total") {
    return {
      kind: "group-total",
      id: row.id,
      depth: row.depth,
      data: row.data,
      isRoot: row.isRoot,
    };
  }
  return { kind: "item", id: row.id, depth: row.depth, data: row.data };
}

export { resolveMainExportColumns, type LbacMainExportColumnKey };
