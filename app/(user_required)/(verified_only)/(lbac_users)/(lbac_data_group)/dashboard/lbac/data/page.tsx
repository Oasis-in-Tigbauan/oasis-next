"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  AipSearchResultItem,
  AroOfficeItem,
  AroOfficeListResponse,
  BetterFetchResponse,
  LbacDataResponse,
  LbacGroupResponse,
  LbacGroupTotals,
  LbacItemResponse,
  OfficeCodeListResponse,
  SaaobSearchResponse,
  SaaobSearchGroup,
  SaaobSearchEntry,
} from "@/lib/http/client/responses";
import { isSaaobGroup } from "@/lib/http/client/responses";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

import { ExportDialog } from "@/app/(user_required)/(verified_only)/(lbac_users)/export-dialog";
import { ExportFormsDialog } from "@/app/(user_required)/(verified_only)/(lbac_users)/export-forms-dialog";
import { ExportLbeFOneDialog } from "@/app/(user_required)/(verified_only)/(lbac_users)/export-lbe-f1-dialog";
import { ManageTemplatesDialog } from "@/app/(user_required)/(verified_only)/(lbac_users)/manage-templates-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TOTAL_COLS = 58;

export default function Page() {
  const [currentYear] = useState(() => _getUtc8Year());
  const [selectedQuarter, setSelectedQuarter] = useState(() => _getUtc8Quarter());

  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<LbacDataResponse, ApiResponseException>
  >(`/api/lbac?year=${currentYear}&quarter=${selectedQuarter}`, $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<FlatRow | null>(null);

  // Dialog states
  type DialogMode = "add-group" | "edit-group" | "add-item" | "edit-item" | null;
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormType, setExportFormType] = useState<"lbe-f1" | "form-3" | "form-5" | "form-5a" | null>(null);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);
  const allGroups = useMemo(() => collectGroups(tree), [tree]);

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

  const handleRowClick = useCallback((row: FlatRow) => {
    setSelectedRow(prev => (prev?.id === row.id ? null : row));
  }, []);

  const handleRowDoubleClick = useCallback((row: FlatRow) => {
    setSelectedRow(row);
    setDialogMode(row.kind === "group" ? "edit-group" : "edit-item");
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;
    const label = selectedRow.kind === "group"
      ? `group "${selectedRow.data.name}"`
      : `item "${(selectedRow.data as LbacItemResponse).mfoPpa}"`;
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;

    const url = selectedRow.kind === "group"
      ? `/api/lbac/groups/${selectedRow.id}`
      : `/api/lbac/items/${selectedRow.id}`;

    const res = await fetch(url, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      alert(payload?.message ?? "Failed to delete. Please try again.");
      return;
    }
    setSelectedRow(null);
    mutate();
  }, [selectedRow, mutate]);

  const handleQuarterChange = useCallback((q: number) => {
    setSelectedQuarter(q);
    setSelectedRow(null);
  }, []);

  const closeDialog = useCallback(() => setDialogMode(null), []);
  const onSuccess = useCallback(() => { mutate(); closeDialog(); }, [mutate, closeDialog]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  const selectedItem = selectedRow?.kind === "item" ? (selectedRow.data as LbacItemResponse) : null;
  const selectedGroup = selectedRow?.kind === "group" ? (selectedRow.data as LbacGroupResponse) : null;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search AIP, MFO, output…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogMode("add-group")}
        >
          <Plus className="size-3" />
          Group
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogMode("add-item")}
        >
          <Plus className="size-3" />
          Item
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          title="Edit selected"
          disabled={!selectedRow}
          onClick={() => {
            if (!selectedRow) return;
            setDialogMode(selectedRow.kind === "group" ? "edit-group" : "edit-item");
          }}
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete"
          title="Delete selected"
          disabled={!selectedRow}
          className="text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 />
        </Button>

        {selectedRow && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {selectedRow.kind === "group"
              ? `Group: ${(selectedRow.data as LbacGroupResponse).name}`
              : `Item: ${(selectedRow.data as LbacItemResponse).mfoPpa.slice(0, 40)}${(selectedRow.data as LbacItemResponse).mfoPpa.length > 40 ? "…" : ""}`
            }
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
              >
                <Download className="size-3" />
                Export
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setExportOpen(true)}>Main Data</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setExportFormType("lbe-f1")}>LBE Form 1</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExportFormType("form-3")}>LBAC Form 3</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExportFormType("form-5")}>LBAC Form 5</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setExportFormType("form-5a")}>LBAC Form 5A</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setManageTemplatesOpen(true)}
          >
            <FileSpreadsheet className="size-3" />
            Templates
          </Button>
          <Separator orientation="vertical" className="h-6 mx-1" />
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

      {/* Table */}
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
                  {/* ── Single-col headers (rowSpan=2) ── */}
                  <TableHead rowSpan={2} className="min-w-28 align-middle border-l">AIP REF CODE</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] align-middle whitespace-normal break-words">MFO/PPA</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] align-middle whitespace-normal break-words">Major Final Output</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] align-middle whitespace-normal break-words">Performance/Output Indicator</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] align-middle whitespace-normal break-words">Target for Budget Year</TableHead>
                  {/* ── Proposed Budget (5) ── */}
                  <TableHead colSpan={5} className="text-center border-b">Proposed Budget for the Budget Year</TableHead>
                  {/* ── Single ── */}
                  <TableHead rowSpan={2} className="min-w-32 align-middle">Implementing Unit</TableHead>
                  {/* ── Appropriation (3) ── */}
                  <TableHead colSpan={3} className="text-center border-b">Appropriation</TableHead>
                  {/* ── Allotment Released (3) ── */}
                  <TableHead colSpan={3} className="text-center border-b">Allotment Released</TableHead>
                  {/* ── Single ── */}
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Balance of Appropriation</TableHead>
                  {/* ── Obligations Incurred (3) ── */}
                  <TableHead colSpan={3} className="text-center border-b">Obligations Incurred</TableHead>
                  {/* ── Singles ── */}
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Unobligated Amount</TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">Remarks</TableHead>
                  {/* ── Obligation cut-off (3) ── */}
                  <TableHead colSpan={3} className="text-center border-b">Obligation</TableHead>
                  {/* ── Other singles (8) ── */}
                  <TableHead rowSpan={2} className="min-w-20 align-middle">Gadable</TableHead>
                  <TableHead rowSpan={2} className="min-w-24 align-middle">Tagging</TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Amount Attributed</TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Expense Class</TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Account Code</TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">
                    Prior Year Accomplishments
                  </TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">Physical Targets</TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">Other Remarks</TableHead>
                  {/* ── Financial Allocation (5) ── */}
                  <TableHead colSpan={5} className="text-center border-b">Financial Allocation</TableHead>
                  {/* ── Actual Financial Performance (5) ── */}
                  <TableHead colSpan={5} className="text-center border-b">Actual Financial Performance</TableHead>
                  {/* ── Single ── */}
                  <TableHead rowSpan={2} className="min-w-28 align-middle">Variance (Financial)</TableHead>
                  {/* ── Physical Targets QR (5) ── */}
                  <TableHead colSpan={5} className="text-center border-b">Physical Targets (Performance)</TableHead>
                  {/* ── Actual Physical Performance QR (5) ── */}
                  <TableHead colSpan={5} className="text-center border-b">Actual Physical Performance</TableHead>
                  {/* ── QR singles ── */}
                  <TableHead rowSpan={2} className="min-w-24 align-middle">Variance (Performance)</TableHead>
                  <TableHead rowSpan={2} className="min-w-24 align-middle">% Accomplishment</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] align-middle whitespace-normal break-words">QR Remarks</TableHead>
                </TableRow>
                <TableRow>
                  {/* Proposed Budget sub-headers */}
                  <TableHead className="min-w-24">PS</TableHead>
                  <TableHead className="min-w-24">MOOE</TableHead>
                  <TableHead className="min-w-24">FE</TableHead>
                  <TableHead className="min-w-24">CO</TableHead>
                  <TableHead className="min-w-24">Total</TableHead>
                  {/* Appropriation sub-headers */}
                  <TableHead className="min-w-36">Cont./Suppl./Aug.</TableHead>
                  <TableHead className="min-w-28">Current</TableHead>
                  <TableHead className="min-w-28">Total</TableHead>
                  {/* Allotment Released sub-headers */}
                  <TableHead className="min-w-28">Previous Quarters</TableHead>
                  <TableHead className="min-w-28">This Quarter</TableHead>
                  <TableHead className="min-w-28">Total</TableHead>
                  {/* Obligations Incurred sub-headers */}
                  <TableHead className="min-w-28">Previous Quarters</TableHead>
                  <TableHead className="min-w-28">This Quarter</TableHead>
                  <TableHead className="min-w-28">Total</TableHead>
                  {/* Obligation (cut-off) sub-headers */}
                  <TableHead className="min-w-28">Cut-off</TableHead>
                  <TableHead className="min-w-28">Balance</TableHead>
                  <TableHead className="min-w-20">%</TableHead>
                  {/* Financial Allocation sub-headers */}
                  <TableHead className="min-w-20">Q1</TableHead>
                  <TableHead className="min-w-20">Q2</TableHead>
                  <TableHead className="min-w-20">Q3</TableHead>
                  <TableHead className="min-w-20">Q4</TableHead>
                  <TableHead className="min-w-20">Total</TableHead>
                  {/* Actual Financial Performance sub-headers */}
                  <TableHead className="min-w-20">Q1</TableHead>
                  <TableHead className="min-w-20">Q2</TableHead>
                  <TableHead className="min-w-20">Q3</TableHead>
                  <TableHead className="min-w-20">Q4</TableHead>
                  <TableHead className="min-w-20">Total</TableHead>
                  {/* Physical Targets QR sub-headers */}
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q1</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q2</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q3</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q4</TableHead>
                  <TableHead className="min-w-20">Total</TableHead>
                  {/* Actual Physical Performance QR sub-headers */}
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q1</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q2</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q3</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q4</TableHead>
                  <TableHead className="min-w-20">Total</TableHead>
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
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className={`cursor-pointer select-none text-white ${isSelected ? "outline outline-2 outline-primary" : ""}`}
                        style={{ backgroundColor: row.depth === 0 ? "#0B5394" : "#26a69a" }}
                        onClick={() => handleRowClick(row)}
                        onDoubleClick={() => handleRowDoubleClick(row)}
                      >
                        <TableCell />
                        <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">
                          <button
                            type="button"
                            className="flex items-center gap-1 font-semibold text-white text-left hover:opacity-80 w-full"
                            onClick={e => { e.stopPropagation(); toggleCollapse(row.id); }}
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
                        <TableCell />
                        <TableCell />
                        {/* Proposed Budget */}
                        <TableCell className="text-right font-mono">{fmt(t.proposedBudgetPS)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.proposedBudgetMOOE)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.proposedBudgetFE)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.proposedBudgetCO)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.proposedBudgetTotal)}</TableCell>
                        {/* Implementing Unit */}
                        <TableCell />
                        {/* Appropriation */}
                        <TableCell className="text-right font-mono">{fmt(t.appropriation.contOrSupplementalAugmentation)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.appropriation.current)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.appropriation.total)}</TableCell>
                        {/* Allotment Released */}
                        <TableCell className="text-right font-mono">{fmt(t.allotmentReleased.previousQuarters)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.allotmentReleased.thisQuarter)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.allotmentReleased.total)}</TableCell>
                        {/* Balance of Appropriation */}
                        <TableCell className="text-right font-mono">{fmt(t.balanceOfAppropriation)}</TableCell>
                        {/* Obligations */}
                        <TableCell className="text-right font-mono">{fmt(t.obligations.previousQuarters)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.obligations.thisQuarter)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.obligations.total)}</TableCell>
                        {/* Unobligated / Remarks */}
                        <TableCell className="text-right font-mono">{fmt(t.unobligatedAmount)}</TableCell>
                        <TableCell />
                        {/* asCutOffMonth */}
                        <TableCell className="text-right font-mono">{fmt(t.asCutOffMonth.obligation)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.asCutOffMonth.balance)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.asCutOffMonth.percentage)}</TableCell>
                        {/* Gadable / Tagging */}
                        <TableCell />
                        <TableCell />
                        {/* Amount Attributed */}
                        <TableCell className="text-right font-mono">{fmt(t.other.amountAttributed)}</TableCell>
                        {/* Expense Class / Account Code / text fields */}
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        {/* Financial Allocation */}
                        <TableCell className="text-right font-mono">{fmt(t.financialAllocation.Q1)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.financialAllocation.Q2)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.financialAllocation.Q3)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.financialAllocation.Q4)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.financialAllocation.total)}</TableCell>
                        {/* Actual Financial Performance */}
                        <TableCell className="text-right font-mono">{fmt(t.actualFinancialPerformance.Q1)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.actualFinancialPerformance.Q2)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.actualFinancialPerformance.Q3)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.actualFinancialPerformance.Q4)}</TableCell>
                        <TableCell className="text-right font-mono">{fmt(t.actualFinancialPerformance.total)}</TableCell>
                        {/* Variance */}
                        <TableCell className="text-right font-mono">{fmt(t.variance)}</TableCell>
                        {/* QR text columns (13 empty) */}
                        <TableCell colSpan={13} />
                      </TableRow>
                    );
                  }

                  const item = row.data as LbacItemResponse;
                  const isSelected = selectedRow?.id === row.id;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${
                        isSelected
                          ? "bg-accent"
                          : vr.index % 2 === 1
                            ? "bg-muted hover:bg-muted/50"
                            : ""
                      }`}
                      title="Double-click to edit"
                      onClick={() => handleRowClick(row)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    >
                      <TableCell className="font-mono">{txt(item.aipRefCode?.aipReferenceCode)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{item.mfoPpa}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.majorFinalOutput)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.performanceOutputIndicator)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.targetForBudgetYear)}</TableCell>
                      {/* Proposed Budget */}
                      <TableCell className="text-right font-mono">{fmt(item.proposedBudgetPS)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.proposedBudgetMOOE)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.proposedBudgetFE)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.proposedBudgetCO)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.proposedBudgetTotal)}</TableCell>
                      {/* Implementing Unit */}
                      <TableCell>{txt(item.implementingUnit?.name)}</TableCell>
                      {/* Appropriation */}
                      <TableCell className="text-right font-mono">{fmt(item.appropriation.contOrSupplementalAugmentation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.appropriation.current)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.appropriation.total)}</TableCell>
                      {/* Allotment Released */}
                      <TableCell className="text-right font-mono">{fmt(item.allotmentReleased.previousQuarters)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.allotmentReleased.thisQuarter)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.allotmentReleased.total)}</TableCell>
                      {/* Balance of Appropriation */}
                      <TableCell className="text-right font-mono">{fmt(item.balanceOfAppropriation)}</TableCell>
                      {/* Obligations Incurred */}
                      <TableCell className="text-right font-mono">{fmt(item.obligations.previousQuarters)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.obligations.thisQuarter)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.obligations.total)}</TableCell>
                      {/* Unobligated / Remarks */}
                      <TableCell className="text-right font-mono">{fmt(item.unobligatedAmount)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.remarks)}</TableCell>
                      {/* Obligation cut-off */}
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.obligation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.balance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.percentage)}</TableCell>
                      {/* Other */}
                      <TableCell>{item.other.gadable ? "Yes" : "No"}</TableCell>
                      <TableCell>{txt(item.other.tagging)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.other.amountAttributed)}</TableCell>
                      <TableCell>{txt(item.other.expenseCode?.accountName)}</TableCell>
                      <TableCell>{txt(item.other.expenseCode?.accountCode)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.other.priorYearAccomplishments)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.other.physicalTargets)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.other.remarks)}</TableCell>
                      {/* Financial Allocation */}
                      <TableCell className="text-right font-mono">{fmt(item.financialAllocation.Q1)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.financialAllocation.Q2)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.financialAllocation.Q3)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.financialAllocation.Q4)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.financialAllocation.total)}</TableCell>
                      {/* Actual Financial Performance */}
                      <TableCell className="text-right font-mono">{fmt(item.actualFinancialPerformance.Q1)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.actualFinancialPerformance.Q2)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.actualFinancialPerformance.Q3)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.actualFinancialPerformance.Q4)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.actualFinancialPerformance.total)}</TableCell>
                      {/* Variance (Financial) */}
                      <TableCell className="text-right font-mono">{fmt(item.variance)}</TableCell>
                      {/* Physical Targets QR */}
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.physicalTargets.Q1)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.physicalTargets.Q2)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.physicalTargets.Q3)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.physicalTargets.Q4)}</TableCell>
                      <TableCell>{txt(item.quarterlyReport.physicalTargets.total)}</TableCell>
                      {/* Actual Physical Performance QR */}
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.actualPhysicalPerformance.Q1)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.actualPhysicalPerformance.Q2)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.actualPhysicalPerformance.Q3)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.quarterlyReport.actualPhysicalPerformance.Q4)}</TableCell>
                      <TableCell>{txt(item.quarterlyReport.actualPhysicalPerformance.total)}</TableCell>
                      {/* QR singles */}
                      <TableCell>{txt(item.quarterlyReport.variance)}</TableCell>
                      <TableCell>{txt(item.quarterlyReport.accomplishment)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.quarterlyReport.remarks)}</TableCell>
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

      {/* Dialogs */}
      {dialogMode === "add-group" && (
        <GroupFormDialog
          mode="add"
          allGroups={allGroups}
          defaultParentId={selectedRow?.kind === "group" ? selectedRow.id : undefined}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === "edit-group" && selectedGroup && (
        <GroupFormDialog
          mode="edit"
          editGroup={selectedGroup}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === "add-item" && (
        <ItemFormDialog
          mode="add"
          allGroups={allGroups}
          defaultGroupId={selectedRow?.kind === "group" ? selectedRow.id : undefined}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === "edit-item" && selectedItem && (
        <ItemFormDialog
          mode="edit"
          editItem={selectedItem}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      <ManageTemplatesDialog
        open={manageTemplatesOpen}
        onOpenChange={setManageTemplatesOpen}
        apiPath="/api/lbac/templates/data"
        description="Upload or replace Excel templates used for LBAC main data report headers and footers."
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exportApiBase="/api/lbac/export/data"
        exportParams={{ year: String(currentYear), quarter: String(selectedQuarter) }}
        tree={tree}
      />

      <ExportLbeFOneDialog
        open={exportFormType === "lbe-f1"}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setExportFormType(null);
        }}
        tree={tree}
        exportParams={{ year: String(currentYear), quarter: String(selectedQuarter) }}
      />

      {(exportFormType === "form-3" || exportFormType === "form-5" || exportFormType === "form-5a") && (
        <ExportFormsDialog
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setExportFormType(null);
          }}
          formType={exportFormType}
          tree={tree}
          exportParams={{ year: String(currentYear), quarter: String(selectedQuarter) }}
        />
      )}
    </div>
  );
}

// ─── AIP Search Combobox ─────────────────────────────────────────────────────

function AipSearchCombobox({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; code: string; description: string } | null;
  onChange: (val: { id: string; code: string; description: string } | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<
    BetterFetchResponse<{ ok: true; data: AipSearchResultItem[] }, ApiResponseException>
  >(
    open && query.length >= 2 ? `/api/aip/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );

  const results = data?.data?.data ?? [];

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        placeholder="Search AIP code or description…"
        value={open ? query : (value ? `${value.code} — ${value.description}` : "")}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!isLoading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Type at least 2 characters to search.
            </div>
          )}
          {value && (
            <button
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent text-muted-foreground"
              onMouseDown={() => { onChange(null); setOpen(false); setQuery(""); }}
            >
              Clear selection
            </button>
          )}
          {results.map(r => (
            <button
              key={r.id}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={() => {
                onChange({ id: r.id, code: r.aipReferenceCode, description: r.description });
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="font-medium">{r.aipReferenceCode}</span>
              <span className="text-xs text-muted-foreground">{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Group Form Dialog ────────────────────────────────────────────────────────

function GroupFormDialog({
  mode,
  editGroup,
  allGroups,
  defaultParentId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editGroup?: LbacGroupResponse;
  allGroups: LbacGroupResponse[];
  defaultParentId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [name, setName] = useState(editGroup?.name ?? "");
  const [aipRef, setAipRef] = useState<{ id: string; code: string; description: string } | null>(
    editGroup?.aipRefCode
      ? { id: editGroup.aipRefCode.id, code: editGroup.aipRefCode.aipReferenceCode, description: editGroup.aipRefCode.description }
      : null,
  );
  const [implementingUnitId, setImplementingUnitId] = useState<string>(
    editGroup?.implementingUnit?.id ?? "",
  );
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: officeCodesData } = useSWR<
    BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>
  >("/api/management/data/office-codes", $fetch);
  const officeCodes = officeCodesData?.data?.data ?? [];

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) { setActionError("Name is required."); return; }
    setSubmitting(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (aipRef) body.aipRefCode = aipRef.id;
      if (implementingUnitId) body.implementingUnitId = implementingUnitId;

      let res: Response;
      if (mode === "add") {
        if (parentId) body.groupId = parentId;
        res = await fetch("/api/lbac/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/lbac/groups/${editGroup!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save. Please try again.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Group" : "Edit Group"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Create a new LBAC group." : `Editing group: ${editGroup?.name}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-name`}>Name *</Label>
              <Input
                id={`${baseId}-name`}
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
                placeholder="Group name"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label>AIP Reference Code</Label>
              <AipSearchCombobox value={aipRef} onChange={setAipRef} disabled={submitting} />
            </div>

            <div className="flex flex-col gap-1 w-full">
              <Label htmlFor={`${baseId}-unit`}>Implementing Unit</Label>
              <Select
                value={implementingUnitId || "__none__"}
                onValueChange={v => setImplementingUnitId(v === "__none__" ? "" : v)}
                disabled={submitting}
              >
                <SelectTrigger id={`${baseId}-unit`}>
                  <SelectValue placeholder="Select implementing unit…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {officeCodes.map(oc => (
                    <SelectItem key={oc.id} value={oc.id}>{oc.aa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {mode === "add" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-parent`}>Parent Group</Label>
                <Select
                  value={parentId || "__root__"}
                  onValueChange={v => setParentId(v === "__root__" ? "" : v)}
                  disabled={submitting}
                >
                  <SelectTrigger id={`${baseId}-parent`}>
                    <SelectValue placeholder="Root (no parent)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__root__">Root (no parent)</SelectItem>
                    {allGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </ScrollArea>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : mode === "add" ? "Create Group" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item Form Dialog ─────────────────────────────────────────────────────────

function ItemFormDialog({
  mode,
  editItem,
  allGroups,
  defaultGroupId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editItem?: LbacItemResponse;
  allGroups: LbacGroupResponse[];
  defaultGroupId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();

  const [groupId, setGroupId] = useState(defaultGroupId ?? allGroups[0]?.id ?? "");
  const [mfoPpa, setMfoPpa] = useState(editItem?.mfoPpa ?? "");
  const [majorFinalOutput, setMajorFinalOutput] = useState(editItem?.majorFinalOutput ?? "");
  const [performanceOutputIndicator, setPerformanceOutputIndicator] = useState(
    editItem?.performanceOutputIndicator ?? "",
  );
  const [targetForBudgetYear, setTargetForBudgetYear] = useState(
    editItem?.targetForBudgetYear ?? "",
  );
  const [aipRef, setAipRef] = useState<{ id: string; code: string; description: string } | null>(
    editItem?.aipRefCode
      ? { id: editItem.aipRefCode.id, code: editItem.aipRefCode.aipReferenceCode, description: editItem.aipRefCode.description }
      : null,
  );
  const [implementingUnitId, setImplementingUnitId] = useState(
    editItem?.implementingUnit?.id ?? "",
  );
  const [proposedBudgetPS, setProposedBudgetPS] = useState(editItem?.proposedBudgetPS ?? "0");
  const [proposedBudgetMOOE, setProposedBudgetMOOE] = useState(editItem?.proposedBudgetMOOE ?? "0");
  const [proposedBudgetFE, setProposedBudgetFE] = useState(editItem?.proposedBudgetFE ?? "0");
  const [proposedBudgetCO, setProposedBudgetCO] = useState(editItem?.proposedBudgetCO ?? "0");
  const [remarks, setRemarks] = useState(editItem?.remarks ?? "");
  const [gadable, setGadable] = useState(editItem?.other.gadable ?? false);
  const [tagging, setTagging] = useState(editItem?.other.tagging ?? "");
  const [amountAttributed, setAmountAttributed] = useState(editItem?.other.amountAttributed ?? "");
  const [physicalTargets, setPhysicalTargets] = useState(editItem?.other.physicalTargets ?? "");
  const [saaob, setSaaob] = useState<{ id: string; name: string } | null>(
    editItem?.other.saaob
      ? { id: editItem.other.saaob.id, name: editItem.other.saaob.name }
      : null,
  );
  const [priorYearAccomplishments, setPriorYearAccomplishments] = useState(
    editItem?.other.priorYearAccomplishments ?? "",
  );
  const [otherRemarks, setOtherRemarks] = useState(editItem?.other.remarks ?? "");
  const [aroType, setAroType] = useState<"ps" | "mooe" | "finex" | "capex" | null>(
    (editItem?.other.aro?.type as "ps" | "mooe" | "finex" | "capex" | null) ?? null,
  );
  const [budgetType, setBudgetType] = useState<"ab" | "sb" | "rb" | null>(
    (editItem?.other.budgetType as "ab" | "sb" | "rb" | null) ?? null,
  );
  const [aroLink, setAroLink] = useState<{ id: string; name: string; code: string } | null>(
    editItem?.other.aro?.office ?? null,
  );
  const [aroQuery, setAroQuery] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: officeCodesData } = useSWR<
    BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>
  >("/api/management/data/office-codes", $fetch);
  const officeCodes = officeCodesData?.data?.data ?? [];

  const { data: aroOfficesData } = useSWR<
    BetterFetchResponse<AroOfficeListResponse, ApiResponseException>
  >("/api/management/data/aro-office", $fetch);
  const aroOffices = aroOfficesData?.data?.data ?? [];
  const filteredAroOffices = aroOffices.filter(
    (o: AroOfficeItem) =>
      o.name.toLowerCase().includes(aroQuery.toLowerCase()) ||
      o.code.toLowerCase().includes(aroQuery.toLowerCase()),
  );

  const handleSave = async () => {
    if (submitting) return;
    if (!mfoPpa.trim()) { setActionError("MFO/PPA is required."); return; }
    if (mode === "add" && !groupId) { setActionError("Please select a parent group."); return; }

    setSubmitting(true);
    setActionError(null);

    try {
      const body: Record<string, unknown> = {
        mfoPpa: mfoPpa.trim(),
        gadable,
      };

      if (mode === "add") body.groupId = groupId;
      if (aipRef) body.aipRefCode = aipRef.id;
      if (implementingUnitId) body.implementingUnitId = implementingUnitId;
      if (majorFinalOutput.trim()) body.majorFinalOutput = majorFinalOutput.trim();
      if (performanceOutputIndicator.trim()) body.performanceOutputIndicator = performanceOutputIndicator.trim();
      if (targetForBudgetYear.trim()) body.targetForBudgetYear = targetForBudgetYear.trim();
      if (proposedBudgetPS.trim()) body.proposedBudgetPS = proposedBudgetPS.trim();
      if (proposedBudgetMOOE.trim()) body.proposedBudgetMOOE = proposedBudgetMOOE.trim();
      if (proposedBudgetFE.trim()) body.proposedBudgetFE = proposedBudgetFE.trim();
      if (proposedBudgetCO.trim()) body.proposedBudgetCO = proposedBudgetCO.trim();
      if (remarks.trim()) body.remarks = remarks.trim();
      if (tagging.trim()) body.tagging = tagging.trim();
      if (amountAttributed.trim()) body.amountAttributed = amountAttributed.trim();
      if (physicalTargets.trim()) body.physicalTargets = physicalTargets.trim();
      if (priorYearAccomplishments.trim()) body.priorYearAccomplishments = priorYearAccomplishments.trim();
      if (otherRemarks.trim()) body.remarksForOtherMetadata = otherRemarks.trim();
      body.saaobId = saaob?.id ?? null;
      if (aroType) body.aroType = aroType;
      if (budgetType) body.budgetType = budgetType;
      body.aroLink = aroLink?.id ?? null;

      let res: Response;
      if (mode === "add") {
        res = await fetch("/api/lbac/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/lbac/items/${editItem!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save. Please try again.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] min-w-[70%]">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Item" : "Edit Item"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Create a new LBAC item." : `Editing: ${editItem?.mfoPpa}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            {/* Parent group selector (add mode only) */}
            {mode === "add" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-group`}>Parent Group *</Label>
                <Select
                  value={groupId}
                  onValueChange={setGroupId}
                  disabled={submitting}
                >
                  <SelectTrigger id={`${baseId}-group`}>
                    <SelectValue placeholder="Select a group…" />
                  </SelectTrigger>
                  <SelectContent>
                    {allGroups.map(g => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label>AIP Reference Code</Label>
              <AipSearchCombobox value={aipRef} onChange={setAipRef} disabled={submitting} />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-mfo`}>MFO/PPA *</Label>
              <Textarea
                id={`${baseId}-mfo`}
                value={mfoPpa}
                onChange={e => setMfoPpa(e.target.value)}
                disabled={submitting}
                rows={2}
                placeholder="MFO/PPA value"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-mfo2`}>Major Final Output</Label>
              <Textarea
                id={`${baseId}-mfo2`}
                value={majorFinalOutput}
                onChange={e => setMajorFinalOutput(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-poi`}>Performance/Output Indicator</Label>
              <Textarea
                id={`${baseId}-poi`}
                value={performanceOutputIndicator}
                onChange={e => setPerformanceOutputIndicator(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-target`}>Target for Budget Year</Label>
              <Textarea
                id={`${baseId}-target`}
                value={targetForBudgetYear}
                onChange={e => setTargetForBudgetYear(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <Separator />

            <Typography variant="small" className="font-semibold uppercase text-muted-foreground text-xs">
              Proposed Budget for the Budget Year
            </Typography>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {([
                ["PS", proposedBudgetPS, setProposedBudgetPS],
                ["MOOE", proposedBudgetMOOE, setProposedBudgetMOOE],
                ["FE", proposedBudgetFE, setProposedBudgetFE],
                ["CO", proposedBudgetCO, setProposedBudgetCO],
              ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                <div key={label} className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-pb${label}`}>{label}</Label>
                  <Input
                    id={`${baseId}-pb${label}`}
                    value={val}
                    onChange={e => setter(e.target.value)}
                    disabled={submitting}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex flex-col gap-1 w-full">
              <Label htmlFor={`${baseId}-unit`}>Implementing Unit</Label>
              <Select
                value={implementingUnitId || "__none__"}
                onValueChange={v => setImplementingUnitId(v === "__none__" ? "" : v)}
                disabled={submitting}
              >
                <SelectTrigger id={`${baseId}-unit`}>
                  <SelectValue placeholder="Select implementing unit…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {officeCodes.map(oc => (
                    <SelectItem key={oc.id} value={oc.id}>{oc.aa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Typography variant="muted" className="text-xs font-semibold uppercase">
                SAAOB Link
              </Typography>
              <div className="flex items-center gap-2">
                <SaaobSearchCombobox value={saaob} onChange={setSaaob} />
                {saaob && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setSaaob(null)}
                    disabled={submitting}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-remarks`}>Remarks</Label>
              <Textarea
                id={`${baseId}-remarks`}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <Separator />

            <Typography variant="small" className="font-semibold uppercase text-muted-foreground text-xs">
              Other Metadata
            </Typography>

            <div className="flex items-center gap-3">
              <Switch
                id={`${baseId}-gadable`}
                checked={gadable}
                onCheckedChange={setGadable}
                disabled={submitting}
              />
              <Label htmlFor={`${baseId}-gadable`}>Gadable</Label>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-budgetType`}>Budget Type</Label>
                <Select
                  value={budgetType ?? "__none__"}
                  onValueChange={v => setBudgetType(v === "__none__" ? null : (v as "ab" | "sb" | "rb"))}
                  disabled={submitting}
                >
                  <SelectTrigger id={`${baseId}-budgetType`}>
                    <SelectValue placeholder="Select budget type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="ab">Annual Budget</SelectItem>
                    <SelectItem value="sb">Supplemental Budget</SelectItem>
                    <SelectItem value="rb">Reenacted Budget</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-aroType`}>ARO Type</Label>
                <Select
                  value={aroType ?? "__none__"}
                  onValueChange={v => setAroType(v === "__none__" ? null : (v as "ps" | "mooe" | "finex" | "capex"))}
                  disabled={submitting}
                >
                  <SelectTrigger id={`${baseId}-aroType`}>
                    <SelectValue placeholder="Select ARO type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="ps">PS</SelectItem>
                    <SelectItem value="mooe">MOOE</SelectItem>
                    <SelectItem value="finex">FinEx</SelectItem>
                    <SelectItem value="capex">CapEx</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Typography variant="muted" className="text-xs font-semibold uppercase">
                ARO Office Link
              </Typography>
              <AroOfficeCombobox
                value={aroLink}
                onChange={setAroLink}
                query={aroQuery}
                onQueryChange={setAroQuery}
                options={filteredAroOffices}
                disabled={submitting}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-tagging`}>Tagging</Label>
                <Input
                  id={`${baseId}-tagging`}
                  value={tagging}
                  onChange={e => setTagging(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-amount`}>Amount Attributed</Label>
                <Input
                  id={`${baseId}-amount`}
                  value={amountAttributed}
                  onChange={e => setAmountAttributed(e.target.value)}
                  disabled={submitting}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-physTargets`}>Physical Targets</Label>
              <Textarea
                id={`${baseId}-physTargets`}
                value={physicalTargets}
                onChange={e => setPhysicalTargets(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-priorYear`}>Prior Year Accomplishments</Label>
              <Textarea
                id={`${baseId}-priorYear`}
                value={priorYearAccomplishments}
                onChange={e => setPriorYearAccomplishments(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-otherRemarks`}>Other Remarks</Label>
              <Textarea
                id={`${baseId}-otherRemarks`}
                value={otherRemarks}
                onChange={e => setOtherRemarks(e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>
          </div>
        </ScrollArea>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : mode === "add" ? "Create Item" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AroOfficeCombobox({
  value,
  onChange,
  query,
  onQueryChange,
  options,
  disabled,
}: {
  value: { id: string; name: string; code: string } | null;
  onChange: (val: { id: string; name: string; code: string } | null) => void;
  query: string;
  onQueryChange: (q: string) => void;
  options: AroOfficeItem[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex flex-1 flex-col gap-1">
        <Input
          placeholder="Search ARO office…"
          value={open ? query : (value ? `${value.code} — ${value.name}` : "")}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={e => onQueryChange(e.target.value)}
          disabled={disabled}
        />
        {open && (
          <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
            {options.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No offices found.</div>
            )}
            {options.map(o => (
              <button
                key={o.id}
                type="button"
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={() => {
                  onChange({ id: o.id, name: o.name, code: o.code });
                  setOpen(false);
                  onQueryChange("");
                }}
              >
                <span>{o.name}</span>
                <span className="text-xs text-muted-foreground">{o.code}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-destructive hover:text-destructive"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Clear
        </Button>
      )}
    </div>
  );
}

function SaaobSearchCombobox({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (val: { id: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<BetterFetchResponse<SaaobSearchResponse, ApiResponseException>>(
    open && query.length >= 2 ? `/api/saaob/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );

  const results = data?.data?.data ?? [];

  function renderNodes(nodes: Array<SaaobSearchGroup | SaaobSearchEntry>, depth = 0) {
    return nodes.map(node => {
      if (isSaaobGroup(node)) {
        return (
          <div key={node.id}>
            <div
              className="px-3 py-1 text-xs font-semibold text-muted-foreground select-none"
              style={{ paddingLeft: `${12 + depth * 12}px` }}
            >
              {node.name}
            </div>
            {renderNodes(node.children, depth + 1)}
          </div>
        );
      }
      return (
        <button
          key={node.id}
          type="button"
          className="flex w-full flex-col py-2 pr-3 text-left text-sm hover:bg-accent"
          style={{ paddingLeft: `${12 + depth * 12}px` }}
          onMouseDown={() => {
            onChange({ id: node.id, name: node.name });
            setOpen(false);
            setQuery("");
          }}
        >
          <span>{node.name}</span>
          {node.accountCode && <span className="text-xs text-muted-foreground">{node.accountCode}</span>}
        </button>
      );
    });
  }

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        placeholder="Search SAAOB entry…"
        value={open ? query : (value ? value.name : "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!isLoading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {renderNodes(results)}
        </div>
      )}
    </div>
  );
}

/** Collect all groups in the tree into a flat list (for dropdowns). */
function collectGroups(
  nodes: (LbacGroupResponse | LbacItemResponse)[],
  result: LbacGroupResponse[] = [],
): LbacGroupResponse[] {
  for (const node of nodes) {
    if (node.type === 6767) {
      const g = node as LbacGroupResponse;
      result.push(g);
      collectGroups(g.children, result);
    }
  }
  return result;
}

/** Returns a set of group IDs that contain at least one matching descendant item. */
function collectMatchingGroupIds(
  nodes: (LbacGroupResponse | LbacItemResponse)[],
  query: string,
): Set<string> {
  const matched = new Set<string>();
  function walk(nodes2: (LbacGroupResponse | LbacItemResponse)[], ancestors: string[]): boolean {
    let anyMatch = false;
    for (const node of nodes2) {
      if (node.type === 6767) {
        const g = node as LbacGroupResponse;
        const childMatch = walk(g.children, [...ancestors, g.id]);
        if (childMatch) {
          matched.add(g.id);
          for (const a of ancestors) matched.add(a);
          anyMatch = true;
        }
      } else {
        const item = node as LbacItemResponse;
        const q = query.toLowerCase();
        const hits =
          item.aipRefCode?.aipReferenceCode.toLowerCase().includes(q) ||
          item.mfoPpa.toLowerCase().includes(q) ||
          item.majorFinalOutput?.toLowerCase().includes(q) ||
          item.performanceOutputIndicator?.toLowerCase().includes(q) ||
          item.targetForBudgetYear?.toLowerCase().includes(q);
        if (hits) {
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

function itemMatchesQuery(item: LbacItemResponse, query: string): boolean {
  const q = query.toLowerCase();
  return (
    (item.aipRefCode?.aipReferenceCode.toLowerCase().includes(q) ?? false) ||
    item.mfoPpa.toLowerCase().includes(q) ||
    (item.majorFinalOutput?.toLowerCase().includes(q) ?? false) ||
    (item.performanceOutputIndicator?.toLowerCase().includes(q) ?? false) ||
    (item.targetForBudgetYear?.toLowerCase().includes(q) ?? false)
  );
}

function flattenVisible(
  nodes: (LbacGroupResponse | LbacItemResponse)[],
  collapsed: Set<string>,
  depth: number,
  query: string,
  matchingGroupIds: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const filtering = query.trim().length > 0;

  for (const node of nodes) {
    if (node.type === 6767) {
      const group = node as LbacGroupResponse;
      if (filtering && !matchingGroupIds.has(group.id)) continue;
      rows.push({ kind: "group", id: group.id, depth, data: group });
      // When filtering, ignore collapsed state so matches are always visible
      const shouldExpand = filtering || !collapsed.has(group.id);
      if (shouldExpand) {
        rows.push(...flattenVisible(group.children, collapsed, depth + 1, query, matchingGroupIds));
        rows.push({ kind: "group-total", id: `total-${group.id}`, depth, groupId: group.id, data: group.totals, isRoot: depth === 0 });
      }
    } else {
      const item = node as LbacItemResponse;
      if (filtering && !itemMatchesQuery(item, query)) continue;
      rows.push({ kind: "item", id: item.id, depth, data: item, groupId: "" });
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
  const month = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCMonth(); // 0-indexed
  return Math.floor(month / 3) + 1;
}

type FlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacItemResponse; groupId: string }
  | { kind: "group-total"; id: string; depth: number; groupId: string; data: LbacGroupTotals; isRoot: boolean };
