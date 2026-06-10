"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useColumnVisibility } from "@/common/column-visibility";
import { fmtAmount, fmtPercent, txt } from "@/common/saaob/client";
import {
  getSaaobPageCellDisplay,
  SAAOB_PAGE_COLUMN_GROUPS,
  SAAOB_PAGE_COLUMNS,
  SAAOB_PAGE_STORAGE_KEYS,
  type SaaobPageAggregate,
  type SaaobPageColumnDef,
  type SaaobPageColumnKey,
  type SaaobPageId,
} from "@/common/saaob/page-columns";

import {
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";

export function useSaaobColumnVisibility(pageId: SaaobPageId) {
  return useColumnVisibility(
    SAAOB_PAGE_STORAGE_KEYS[pageId],
    SAAOB_PAGE_COLUMNS,
    SAAOB_PAGE_COLUMN_GROUPS,
  );
}

export function SaaobPageTableHeader({
  visibleColumns,
}: {
  visibleColumns: SaaobPageColumnDef[];
}) {
  return (
    <TableRow>
      {visibleColumns.map(col => (
        <TableHead key={col.key} className={col.headerClassName}>
          {col.label}
        </TableHead>
      ))}
    </TableRow>
  );
}

function formatCellValue(key: SaaobPageColumnKey, raw: string): ReactNode {
  if (key === "name" || key === "accountCode" || key === "remarks") {
    return raw;
  }
  if (key === "percentage" || key.endsWith("Pct")) {
    return fmtPercent(raw);
  }
  return fmtAmount(raw);
}

function renderDataCells(
  visibleColumns: SaaobPageColumnDef[],
  data: SaaobPageAggregate,
  options: {
    name?: string;
    accountCode?: string | null;
    remarks?: string | null;
    blankAccountAndRemarks?: boolean;
    depth?: number;
    bold?: boolean;
    nameContent?: ReactNode;
  },
) {
  const depth = options.depth ?? 0;
  const boldClass = options.bold ? " font-bold" : "";

  return visibleColumns.map(col => {
    if (col.key === "name") {
      return (
        <TableCell
          key={col.key}
          className={`${col.cellClassName ?? ""}${boldClass}`}
          style={{ paddingLeft: `${depth * 14 + 4}px` }}
        >
          {options.nameContent ?? options.name ?? ""}
        </TableCell>
      );
    }

    const raw = getSaaobPageCellDisplay(col.key, data, options);
    const isEmptyText = col.key === "accountCode" || col.key === "remarks";

    return (
      <TableCell key={col.key} className={`${col.cellClassName ?? ""}${boldClass}`}>
        {isEmptyText ? txt(raw === "—" ? null : raw) : formatCellValue(col.key, raw)}
      </TableCell>
    );
  });
}

export function SaaobPageGroupRow({
  visibleColumns,
  visibleCount,
  name,
  depth,
  isCollapsed,
  isSelected,
  selectedClassName,
  onToggleCollapse,
  onClick,
  onDoubleClick,
  measureRef,
  dataIndex,
  rowClassName,
}: {
  visibleColumns: SaaobPageColumnDef[];
  visibleCount: number;
  name: string;
  depth: number;
  isCollapsed: boolean;
  isSelected?: boolean;
  selectedClassName?: string;
  onToggleCollapse: () => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
  rowClassName?: string;
}) {
  const nameCol = visibleColumns[0];
  const restSpan = Math.max(visibleCount - 1, 0);

  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className={`${rowClassName ?? "bg-muted/50 cursor-pointer select-none"} ${isSelected ? selectedClassName ?? "outline outline-2 outline-primary" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <TableCell className={nameCol?.cellClassName}>
        <button
          type="button"
          className="flex items-center gap-1 font-semibold text-left hover:text-primary w-full"
          style={{ paddingLeft: `${depth * 14}px` }}
          onClick={e => {
            e.stopPropagation();
            onToggleCollapse();
          }}
        >
          {isCollapsed
            ? <ChevronRight className="size-3 shrink-0" />
            : <ChevronDown className="size-3 shrink-0" />}
          <span>{name}</span>
        </button>
      </TableCell>
      {restSpan > 0 && <TableCell colSpan={restSpan} />}
    </TableRow>
  );
}

export function SaaobPageTotalRow({
  visibleColumns,
  data,
  groupName,
  depth,
  measureRef,
  dataIndex,
}: {
  visibleColumns: SaaobPageColumnDef[];
  data: SaaobPageAggregate;
  groupName: string;
  depth: number;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
}) {
  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      style={{ backgroundColor: "#FFF2CC" }}
    >
      {renderDataCells(visibleColumns, data, {
        name: `Total: ${groupName}`,
        depth,
        bold: true,
        blankAccountAndRemarks: true,
      })}
    </TableRow>
  );
}

export function SaaobPageEntryRow({
  visibleColumns,
  data,
  name,
  accountCode,
  remarks,
  depth,
  isSelected,
  rowClassName,
  measureRef,
  dataIndex,
  onClick,
  onDoubleClick,
  title,
}: {
  visibleColumns: SaaobPageColumnDef[];
  data: SaaobPageAggregate;
  name: string;
  accountCode?: string | null;
  remarks?: string | null;
  depth: number;
  isSelected?: boolean;
  rowClassName?: string;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
  title?: string;
}) {
  const interactive = Boolean(onClick || onDoubleClick);

  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className={`${interactive ? "cursor-pointer select-none" : ""} ${rowClassName ?? ""} ${isSelected ? "outline outline-2 outline-primary" : ""}`}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {renderDataCells(visibleColumns, data, {
        name,
        accountCode,
        remarks,
        depth,
      })}
    </TableRow>
  );
}

export function SaaobPageAggregateRow({
  visibleColumns,
  data,
  name,
  depth,
  isSelected,
  rowClassName,
  blankAccountAndRemarks,
  measureRef,
  dataIndex,
  onClick,
  onDoubleClick,
}: {
  visibleColumns: SaaobPageColumnDef[];
  data: SaaobPageAggregate;
  name: string;
  depth: number;
  isSelected?: boolean;
  rowClassName?: string;
  blankAccountAndRemarks?: boolean;
  measureRef?: (node: HTMLTableRowElement | null) => void;
  dataIndex?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
}) {
  return (
    <TableRow
      ref={measureRef}
      data-index={dataIndex}
      className={`select-none ${rowClassName ?? ""} ${isSelected ? "ring-1 ring-primary" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {renderDataCells(visibleColumns, data, {
        name,
        depth,
        blankAccountAndRemarks,
      })}
    </TableRow>
  );
}

export function SaaobPageSpacerRow({
  visibleCount,
  height,
}: {
  visibleCount: number;
  height: number;
}) {
  return (
    <TableRow>
      <TableCell colSpan={visibleCount} style={{ height: `${height}px` }} />
    </TableRow>
  );
}
