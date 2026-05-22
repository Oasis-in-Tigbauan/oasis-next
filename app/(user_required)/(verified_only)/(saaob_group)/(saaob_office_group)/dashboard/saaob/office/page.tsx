"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Search } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  SaaobOfficeResponse,
} from "@/lib/http/client/responses";
import {
  filterSaaobTreeByQuery,
  flattenSaaobVisible,
  fmtAmount,
  fmtPercent,
  txt,
} from "@/lib/saaob/client";

import { ManageTemplatesDialog } from "@/app/(user_required)/(verified_only)/(saaob_group)/manage-templates-dialog";
import { ExportDialog } from "@/app/(user_required)/(verified_only)/(saaob_group)/export-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";

const TOTAL_COLS = 23;

export default function Page() {
  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<SaaobOfficeResponse, ApiResponseException>
  >("/api/saaob/office", $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data]);
  const filteredTree = useMemo(
    () => filterSaaobTreeByQuery(tree, searchQuery),
    [tree, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenSaaobVisible(filteredTree, collapsed, 0, searchQuery.trim().length > 0),
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
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-64 text-xs"
            placeholder="Search SAAOB data..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-3" />
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setManageTemplatesOpen(true)}
          >
            <FileSpreadsheet className="size-3" />
            Manage Headers/Footers
          </Button>
        </div>
      </div>

      <ManageTemplatesDialog
        open={manageTemplatesOpen}
        onOpenChange={setManageTemplatesOpen}
        apiPath="/api/saaob/templates/office"
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exportApiBase="/api/saaob/export/office"
        tree={tree}
      />

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No SAAOB records found for your office."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-10rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-xs [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal">Functions/Program/Project/Activity</TableHead>
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
                  const row = flatRows[virtualRow.index]!;

                  if (row.kind === "group") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={virtualRow.index}
                        className="bg-muted/50 hover:bg-muted/70"
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
                    >
                      <TableCell
                        className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal break-words"
                        style={{ paddingLeft: `${row.depth * 14 + 4}px` }}
                      >
                        {item.name}
                      </TableCell>
                      <TableCell>{txt(item.accountCode)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.annualBudget)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.supplementalOrContinuing)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.appropriation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.allotment)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.obligation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(item.unObligatedBalance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(item.percentage)}</TableCell>
                      <TableCell>{txt(item.other.remarks)}</TableCell>
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
