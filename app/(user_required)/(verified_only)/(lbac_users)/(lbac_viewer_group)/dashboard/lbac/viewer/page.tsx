"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacViewerGroupResponse,
  LbacViewerGroupTotals,
  LbacViewerItemResponse,
  LbacViewerResponse,
} from "@/lib/http/client/responses";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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
import Typography from "@/components/typography";

const TOTAL_COLS = 9;

export default function Page() {
  const [currentYear] = useState(() => _getUtc8Year());
  const [selectedQuarter, setSelectedQuarter] = useState(() => _getUtc8Quarter());

  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<LbacViewerResponse, ApiResponseException>
  >(`/api/lbac/viewer?year=${currentYear}&quarter=${selectedQuarter}`, $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);

  const matchingGroupIds = useMemo(
    () => (searchQuery.trim() ? collectMatchingGroupIds(tree, searchQuery) : new Set<string>()),
    [tree, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenVisible(tree, collapsed, 0, searchQuery, matchingGroupIds),
    [tree, collapsed, searchQuery, matchingGroupIds],
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

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleQuarterChange = useCallback((q: number) => {
    setSelectedQuarter(q);
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search AIP, MFO…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous quarter"
            title="Previous quarter"
            disabled={selectedQuarter === 1}
            onClick={() => handleQuarterChange(selectedQuarter - 1)}
          >
            <ChevronLeft />
          </Button>
          <Select
            value={String(selectedQuarter)}
            onValueChange={(v) => handleQuarterChange(Number(v))}
          >
            <SelectTrigger className="h-7 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1</SelectItem>
              <SelectItem value="2">Q2</SelectItem>
              <SelectItem value="3">Q3</SelectItem>
              <SelectItem value="4">Q4</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next quarter"
            title="Next quarter"
            disabled={selectedQuarter === 4}
            onClick={() => handleQuarterChange(selectedQuarter + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <Typography variant="h3" className="sr-only">LBAC Viewer</Typography>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No LBAC records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-[#FFF2CC] [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-[#FFF2CC]">
                <TableRow>
                  <TableHead rowSpan={2} className="min-w-28 align-middle border-l">AIP REF CODE</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] align-middle whitespace-normal break-words">MFO/PPA</TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle">Implementing Unit</TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Proposed Budget Total</TableHead>
                  <TableHead colSpan={3} className="text-center border-b">Obligation</TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Expense Class</TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Account Code</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="min-w-28">Cut-off</TableHead>
                  <TableHead className="min-w-28">Balance</TableHead>
                  <TableHead className="min-w-20">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{ height: `${paddingTop}px` }} />
                  </TableRow>
                )}
                {virtualRows.map(vr => {
                  const row = flatRows[vr.index]!;

                  if (row.kind === "group") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className="select-none text-white"
                        style={{ backgroundColor: row.depth === 0 ? "#0B5394" : "#26a69a" }}
                      >
                        <TableCell />
                        <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">
                          <button
                            type="button"
                            className="flex items-center gap-1 font-semibold text-white text-left hover:opacity-80 w-full"
                            onClick={() => toggleCollapse(row.id)}
                          >
                            {isCollapsed
                              ? <ChevronRight className="size-3 shrink-0" />
                              : <ChevronDown className="size-3 shrink-0" />}
                            <span>{row.data.name}</span>
                          </button>
                        </TableCell>
                        <TableCell colSpan={TOTAL_COLS - 2} />
                      </TableRow>
                    );
                  }

                  if (row.kind === "group-total") {
                    const t = row.data;
                    const label = row.isRoot ? "Grand Total" : "Total";
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className="font-bold"
                        style={{ backgroundColor: row.isRoot ? "#B6D7A8" : "#FFF2CC" }}
                      >
                        <TableCell />
                        <TableCell className="w-[275px] min-w-[275px] max-w-[275px]">{label}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono">{fmt(t.proposedBudgetTotal)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.asCutOffMonth.obligation)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.asCutOffMonth.balance)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.asCutOffMonth.percentage)}</TableCell>
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    );
                  }

                  const item = row.data as LbacViewerItemResponse;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${vr.index % 2 === 1 ? "bg-muted hover:bg-muted/50" : ""}`}
                    >
                      <TableCell className="font-mono">{txt(item.aipRefCode?.aipReferenceCode)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{item.mfoPpa}</TableCell>
                      <TableCell>{txt(item.implementingUnit?.name)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.proposedBudgetTotal)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.obligation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.balance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.percentage)}</TableCell>
                      <TableCell>{txt(item.other.expenseCode?.accountName)}</TableCell>
                      <TableCell>{txt(item.other.expenseCode?.accountCode)}</TableCell>
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

function collectMatchingGroupIds(
  nodes: (LbacViewerGroupResponse | LbacViewerItemResponse)[],
  query: string,
): Set<string> {
  const matched = new Set<string>();
  function walk(nodes2: (LbacViewerGroupResponse | LbacViewerItemResponse)[], ancestors: string[]): boolean {
    let anyMatch = false;
    for (const node of nodes2) {
      if (node.type === 6767) {
        const g = node as LbacViewerGroupResponse;
        const childMatch = walk(g.children, [...ancestors, g.id]);
        if (childMatch) {
          matched.add(g.id);
          for (const a of ancestors) matched.add(a);
          anyMatch = true;
        }
      } else {
        const item = node as LbacViewerItemResponse;
        if (itemMatchesQuery(item, query)) {
          for (const a of ancestors) matched.add(a);
          anyMatch = true;
        }
      }
    }
    return anyMatch;
  }
  walk(nodes, []);
  return matched;
}

function itemMatchesQuery(item: LbacViewerItemResponse, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (item.aipRefCode?.aipReferenceCode.toLowerCase().includes(q) ?? false) ||
    item.mfoPpa.toLowerCase().includes(q) ||
    (item.implementingUnit?.name.toLowerCase().includes(q) ?? false) ||
    (item.other.expenseCode?.accountName.toLowerCase().includes(q) ?? false) ||
    (item.other.expenseCode?.accountCode?.toLowerCase().includes(q) ?? false)
  );
}

function flattenVisible(
  nodes: (LbacViewerGroupResponse | LbacViewerItemResponse)[],
  collapsed: Set<string>,
  depth: number,
  query: string,
  matchingGroupIds: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const filtering = query.trim().length > 0;

  for (const node of nodes) {
    if (node.type === 6767) {
      const group = node as LbacViewerGroupResponse;
      if (filtering && !matchingGroupIds.has(group.id)) continue;
      rows.push({ kind: "group", id: group.id, depth, data: group });
      const shouldExpand = filtering || !collapsed.has(group.id);
      if (shouldExpand) {
        rows.push(...flattenVisible(group.children, collapsed, depth + 1, query, matchingGroupIds));
        rows.push({
          kind: "group-total",
          id: `total-${group.id}`,
          depth,
          groupId: group.id,
          data: group.totals,
          isRoot: depth === 0,
        });
      }
    } else {
      const item = node as LbacViewerItemResponse;
      if (filtering && !itemMatchesQuery(item, query)) continue;
      rows.push({ kind: "item", id: item.id, depth, data: item });
    }
  }
  return rows;
}

function fmt(val: string | null | undefined): string {
  if (!val) return "—";
  const n = Number(val);
  if (Number.isNaN(n)) return val;
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txt(val: string | null | undefined): string {
  return val ?? "—";
}

function _getUtc8Year(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

function _getUtc8Quarter(): number {
  const month = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCMonth();
  return Math.floor(month / 3) + 1;
}

type FlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacViewerGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacViewerItemResponse }
  | { kind: "group-total"; id: string; depth: number; groupId: string; data: LbacViewerGroupTotals; isRoot: boolean };
