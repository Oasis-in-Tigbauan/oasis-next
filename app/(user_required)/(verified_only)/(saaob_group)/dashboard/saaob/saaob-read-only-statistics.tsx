"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

import type {
  SaaobStatisticGroupResponse,
  SaaobStatisticItemResponse,
} from "@/lib/http/client/responses";
import {
  filterSaaobStatisticTreeByQuery,
  flattenSaaobStatisticVisible,
  fmtAmount,
  fmtPercent,
  type SaaobStatisticFlatRow,
  txt,
} from "@/lib/saaob/client";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const TOTAL_COLS = 23;

type Props = {
  data: Array<SaaobStatisticGroupResponse | SaaobStatisticItemResponse>;
  selectedRowId?: string | null;
  onRowClick?: (row: SaaobStatisticFlatRow) => void;
  onRowDoubleClick?: (row: SaaobStatisticFlatRow) => void;
};

export default function SaaobReadOnlyStatistics({
  data,
  selectedRowId,
  onRowClick,
  onRowDoubleClick,
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const filteredTree = useMemo(
    () => filterSaaobStatisticTreeByQuery(data, searchQuery),
    [data, searchQuery],
  );

  const flatRows = useMemo(
    () =>
      flattenSaaobStatisticVisible(
        filteredTree,
        collapsed,
        0,
        searchQuery.trim().length > 0,
      ),
    [filteredTree, collapsed, searchQuery],
  );

  // eslint-disable-next-line
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - virtualRows[virtualRows.length - 1].end
      : 0;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center gap-2">
        <div className="relative flex items-center">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search statistics data..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery
              ? "No results match your search."
              : "No statistics records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[500px] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal">
                    Functions/Program/Project/Activity
                  </TableHead>
                  <TableHead className="min-w-32">Account Code</TableHead>
                  <TableHead className="min-w-36 text-right">Annual Budget</TableHead>
                  <TableHead className="min-w-36 text-right">Supplemental/Continuing</TableHead>
                  <TableHead className="min-w-36 text-right">Appropriation</TableHead>
                  <TableHead className="min-w-36 text-right">Allotment (Quarterly)</TableHead>
                  <TableHead className="min-w-32 text-right">Obligation</TableHead>
                  <TableHead className="min-w-36 text-right">Unobligated Balance</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage (%)</TableHead>
                  <TableHead className="min-w-36">Remarks</TableHead>
                  <TableHead className="min-w-40 text-right">Quarterly Allotment Balance</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage (%)</TableHead>
                  <TableHead className="min-w-32 text-right">Disbursed</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage (%)</TableHead>
                  <TableHead className="min-w-32 text-right">Variance</TableHead>
                  <TableHead className="min-w-32 text-right">LBAC Budget</TableHead>
                  <TableHead className="min-w-32 text-right">Variance Budget</TableHead>
                  <TableHead className="min-w-32 text-right">LBAC Obligated</TableHead>
                  <TableHead className="min-w-36 text-right">Variance Obligated</TableHead>
                  <TableHead className="min-w-40 text-right">Obligation with PRs</TableHead>
                  <TableHead className="min-w-36 text-right">Unobligated Balance</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage %</TableHead>
                  <TableHead className="min-w-28 text-right">PRs</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{ height: `${paddingTop}px` }} />
                  </TableRow>
                )}

                {virtualRows.map(virtualRow => {
                  const row = flatRows[virtualRow.index] as SaaobStatisticFlatRow;

                  if (row.kind === "group") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={virtualRow.index}
                        className={`bg-muted/50 select-none ${selectedRowId === row.id ? "ring-1 ring-primary" : ""}`}
                        onClick={() => onRowClick?.(row)}
                        onDoubleClick={() => onRowDoubleClick?.(row)}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="flex items-center gap-1 font-semibold text-left hover:text-primary w-full"
                            style={{ paddingLeft: `${row.depth * 14}px` }}
                            onClick={() => toggleCollapse(row.id)}
                          >
                            {isCollapsed
                              ? <ChevronRight className="size-3 shrink-0" />
                              : <ChevronDown className="size-3 shrink-0" />}
                            <span>{row.data.name}</span>
                          </button>
                        </TableCell>
                        <TableCell colSpan={TOTAL_COLS - 1} />
                      </TableRow>
                    );
                  }

                  const item = row.data;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={virtualRow.index}
                      className={`select-none ${virtualRow.index % 2 === 1 ? "bg-muted hover:bg-muted/50" : ""} ${selectedRowId === row.id ? "ring-1 ring-primary" : ""}`}
                      onClick={() => onRowClick?.(row)}
                      onDoubleClick={() => onRowDoubleClick?.(row)}
                    >
                      <TableCell
                        className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal break-words"
                        style={{ paddingLeft: `${row.depth * 14 + 4}px` }}
                      >
                        {item.name}
                      </TableCell>
                      <TableCell>{txt(null)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.annualBudget)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.supplementalOrContinuing)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.appropriation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.allotment)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.obligation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.unObligatedBalance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(item.percentage)}</TableCell>
                      <TableCell>{txt(null)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.quarterlyAllotmentBalance.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(item.other.quarterlyAllotmentBalance.percentage)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.disbursed.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(item.other.disbursed.percentage)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.disbursed.variance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.lbacBudget.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.lbacBudget.variance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.lbacBudget.obligated)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.lbacBudget.varianceObligated)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.obligationWithPRs.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.obligationWithPRs.balance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(item.other.obligationWithPRs.percentage)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.other.pr)}</TableCell>
                    </TableRow>
                  );
                })}

                {paddingBottom > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{ height: `${paddingBottom}px` }} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
