"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacOfficeQuarterlyResponse,
  LbacQuarterlyGroupResponse,
  LbacQuarterlyItemResponse,
} from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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

// ─── Types ──────────────────────────────────────────────────────────────────

type FlatRow =
  | { kind: "group"; id: string; depth: number; data: LbacQuarterlyGroupResponse }
  | { kind: "item"; id: string; depth: number; data: LbacQuarterlyItemResponse };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function flattenVisible(
  nodes: (LbacQuarterlyGroupResponse | LbacQuarterlyItemResponse)[],
  collapsed: Set<string>,
  depth: number,
): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    if (node.type === 6767) {
      const group = node as LbacQuarterlyGroupResponse;
      rows.push({ kind: "group", id: group.id, depth, data: group });
      if (!collapsed.has(group.id)) {
        rows.push(...flattenVisible(group.children, collapsed, depth + 1));
      }
    } else {
      rows.push({ kind: "item", id: node.id, depth, data: node as LbacQuarterlyItemResponse });
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

const TOTAL_COLS = 23;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<LbacOfficeQuarterlyResponse, ApiResponseException>
  >("/api/lbac/office-quarterly", $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<LbacQuarterlyItemResponse | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = data?.data?.data ?? [];
  const flatRows = flattenVisible(tree, collapsed, 0);

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

  const handleItemClick = useCallback((item: LbacQuarterlyItemResponse) => {
    setSelected(item);
    setDialogOpen(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setDialogOpen(open);
    if (!open) setSelected(null);
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-3 p-4 pt-0 w-full">
      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No LBAC records found for your office.
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(103vh-8rem)] overflow-auto **:data-[slot=table-container]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead rowSpan={2} className="min-w-28 align-middle border-l">AIP REF CODE</TableHead>
                  <TableHead rowSpan={2} className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">MFO/PPA</TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle">Implementing Unit</TableHead>
                  <TableHead colSpan={3} className="text-center border-b">Appropriation</TableHead>
                  <TableHead colSpan={2} className="text-center border-b">Obligation</TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">
                    Prior Year Accomplishments
                  </TableHead>
                  <TableHead colSpan={5} className="text-center border-b">Physical Targets 2026</TableHead>
                  <TableHead colSpan={5} className="text-center border-b">Actual Physical Performance</TableHead>
                  <TableHead rowSpan={2} className="min-w-24 align-middle">Variance as of</TableHead>
                  <TableHead rowSpan={2} className="min-w-24 align-middle">% of Accomplishment</TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">Remarks</TableHead>
                  <TableHead rowSpan={2} className="align-middle w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">
                    Target for Budget Year
                  </TableHead>
                </TableRow>
                <TableRow>
                  {/* Appropriation */}
                  <TableHead className="min-w-36">Cont./Suppl./Aug.</TableHead>
                  <TableHead className="min-w-28">Current</TableHead>
                  <TableHead className="min-w-28">Total</TableHead>
                  {/* Obligation */}
                  <TableHead className="min-w-28">Cut-off</TableHead>
                  <TableHead className="min-w-28">Balance</TableHead>
                  {/* Physical Targets */}
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q1</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q2</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q3</TableHead>
                  <TableHead className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">Q4</TableHead>
                  <TableHead className="min-w-20">Total</TableHead>
                  {/* Actual Physical */}
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
                    const isCollapsed = collapsed.has(row.id);
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className="bg-muted/50 hover:bg-muted/70"
                      >
                        <TableCell />
                        <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">
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
                        <TableCell colSpan={TOTAL_COLS - 2} />
                      </TableRow>
                    );
                  }

                  const item = row.data;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className="cursor-pointer select-none"
                      title="Click to edit quarterly data"
                      onClick={() => handleItemClick(item)}
                    >
                      <TableCell className="font-mono">{txt(item.aipRefCode?.aipReferenceCode)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{item.mfoPpa}</TableCell>
                      <TableCell>{txt(item.implementingUnit?.name)}</TableCell>
                      {/* Appropriation */}
                      <TableCell className="text-right font-mono">{fmt(item.appropriation.contOrSupplementalAugmentation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.appropriation.current)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.appropriation.total)}</TableCell>
                      {/* Obligation */}
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.obligation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.asCutOffMonth.balance)}</TableCell>
                      {/* Prior Year */}
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.priorYearAccomplishments)}</TableCell>
                      {/* Physical Targets */}
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.physicalTargets.Q1)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.physicalTargets.Q2)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.physicalTargets.Q3)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.physicalTargets.Q4)}</TableCell>
                      <TableCell>{txt(item.physicalTargets.total)}</TableCell>
                      {/* Actual Physical */}
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.actualPhysicalPerformance.Q1)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.actualPhysicalPerformance.Q2)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.actualPhysicalPerformance.Q3)}</TableCell>
                      <TableCell className="w-[200px] min-w-[200px] max-w-[200px] whitespace-normal break-words">{txt(item.actualPhysicalPerformance.Q4)}</TableCell>
                      <TableCell>{txt(item.actualPhysicalPerformance.total)}</TableCell>
                      {/* Remaining */}
                      <TableCell>{txt(item.variance)}</TableCell>
                      <TableCell>{txt(item.accomplishment)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.remarks)}</TableCell>
                      <TableCell className="w-[275px] min-w-[275px] max-w-[275px] whitespace-normal break-words">{txt(item.targetForBudgetYear)}</TableCell>
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

      {selected && (
        <QuarterlyEditDialog
          item={selected}
          open={dialogOpen}
          onOpenChange={handleOpenChange}
          onSuccess={() => mutate()}
        />
      )}
    </div>
  );
}

// ─── Quarterly Edit Dialog ───────────────────────────────────────────────────

function QuarterlyEditDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: {
  item: LbacQuarterlyItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const baseId = useId();
  const [fields, setFields] = useState<Record<string, string>>(() => ({
    priorYearAccomplishments: item.priorYearAccomplishments ?? "",
    physicalTargetQ1: item.physicalTargets.Q1 ?? "",
    physicalTargetQ2: item.physicalTargets.Q2 ?? "",
    physicalTargetQ3: item.physicalTargets.Q3 ?? "",
    physicalTargetQ4: item.physicalTargets.Q4 ?? "",
    physicalTargetTotal: item.physicalTargets.total ?? "",
    actualPhysicalPerformanceQ1: item.actualPhysicalPerformance.Q1 ?? "",
    actualPhysicalPerformanceQ2: item.actualPhysicalPerformance.Q2 ?? "",
    actualPhysicalPerformanceQ3: item.actualPhysicalPerformance.Q3 ?? "",
    actualPhysicalPerformanceQ4: item.actualPhysicalPerformance.Q4 ?? "",
    variance: item.variance ?? "",
    accomplishmentPercentage: item.accomplishment ?? "",
    remarks: item.remarks ?? "",
    targetForBudgetYear: item.targetForBudgetYear ?? "",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setFields(prev => ({ ...prev, [key]: value }));
  }

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const body: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v.trim()) body[k] = v.trim();
      }

      const res = await fetch(`/api/lbac/items/${item.id}/quarterly-report`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save. Please try again.");
        return;
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-[60%]">
        <DialogHeader>
          <DialogTitle>Edit Quarterly Data</DialogTitle>
          <DialogDescription className="truncate max-w-lg">{item.mfoPpa}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-priorYear`}>Prior Year Accomplishments</Label>
              <Textarea
                id={`${baseId}-priorYear`}
                value={fields.priorYearAccomplishments}
                onChange={e => set("priorYearAccomplishments", e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-target`}>Target for Budget Year</Label>
              <Textarea
                id={`${baseId}-target`}
                value={fields.targetForBudgetYear}
                onChange={e => set("targetForBudgetYear", e.target.value)}
                disabled={submitting}
                rows={2}
              />
            </div>

            <Separator />

            <Typography variant="small" className="font-semibold uppercase text-muted-foreground text-xs">
              Physical Targets 2026
            </Typography>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => (
                <div key={q} className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-ptq${q}`}>{q}</Label>
                  <Textarea
                    id={`${baseId}-ptq${q}`}
                    value={fields[`physicalTarget${q}`]}
                    onChange={e => set(`physicalTarget${q}`, e.target.value)}
                    disabled={submitting}
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1 md:w-1/4">
              <Label htmlFor={`${baseId}-ptTotal`}>Total</Label>
              <Input
                id={`${baseId}-ptTotal`}
                value={fields.physicalTargetTotal}
                onChange={e => set("physicalTargetTotal", e.target.value)}
                disabled={submitting}
              />
            </div>

            <Separator />

            <Typography variant="small" className="font-semibold uppercase text-muted-foreground text-xs">
              Actual Physical Performance
            </Typography>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["Q1", "Q2", "Q3", "Q4"] as const).map(q => (
                <div key={q} className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-appq${q}`}>{q}</Label>
                  <Textarea
                    id={`${baseId}-appq${q}`}
                    value={fields[`actualPhysicalPerformance${q}`]}
                    onChange={e => set(`actualPhysicalPerformance${q}`, e.target.value)}
                    disabled={submitting}
                    rows={2}
                  />
                </div>
              ))}
            </div>

            <Separator />

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-variance`}>Variance as of</Label>
                <Input
                  id={`${baseId}-variance`}
                  value={fields.variance}
                  onChange={e => set("variance", e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-accomplishment`}>% of Accomplishment</Label>
                <Input
                  id={`${baseId}-accomplishment`}
                  value={fields.accomplishmentPercentage}
                  onChange={e => set("accomplishmentPercentage", e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-remarks`}>Remarks</Label>
              <Textarea
                id={`${baseId}-remarks`}
                value={fields.remarks}
                onChange={e => set("remarks", e.target.value)}
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
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
