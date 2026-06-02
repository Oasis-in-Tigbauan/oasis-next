"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, Download, Pencil, Search } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacMonitoringGroupResponse,
  LbacMonitoringItemResponse,
  LbacMonitoringResponse,
} from "@/lib/http/client/responses";

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
import { Separator } from "@/components/ui/separator";
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

const GROUP_ROOT_BG = "#0B5394";
const GROUP_CHILD_BG = "#26a69a";
const TOTAL_COLS = 12;
const ITEM_COL_SPAN = TOTAL_COLS - 1;

type SelectableRow =
  | { kind: "group"; id: string; depth: number; data: LbacMonitoringGroupResponse }
  | { kind: "item"; id: string; depth: number; groupId: string; data: LbacMonitoringItemResponse };

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<LbacMonitoringResponse, ApiResponseException>
  >("/api/lbac/monitoring", $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<SelectableRow | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const selectedItem = selectedRow?.kind === "item" ? selectedRow.data : null;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((row: SelectableRow) => {
    setSelectedRow(prev => (prev?.id === row.id ? null : row));
  }, []);

  const handleRowDoubleClick = useCallback((row: SelectableRow) => {
    setSelectedRow(row);
    if (row.kind === "item") {
      setEditorOpen(true);
    }
  }, []);

  const handleEditSelected = useCallback(() => {
    if (selectedRow?.kind !== "item") return;
    setEditorOpen(true);
  }, [selectedRow]);

  const handleEditorSuccess = useCallback(() => {
    mutate();
    setEditorOpen(false);
  }, [mutate]);

  const handleExport = useCallback(async () => {
    if (exporting) return;

    setExporting(true);
    setExportError(null);

    try {
      const response = await fetch("/api/lbac/export/forms/form-6");
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setExportError(
          (payload as Record<string, string> | null)?.details
            ?? (payload as Record<string, string> | null)?.message
            ?? "Export failed. Please try again.",
        );
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename=\"([^\"]+)\"/.exec(contentDisposition);
      const filename = filenameMatch?.[1] ?? "lbac-form-6.xlsx";

      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Unexpected error while exporting. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [exporting]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full flex-wrap">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-64 text-xs"
            placeholder="Search MFO/PPA, AIP code, office…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          title="Edit selected"
          disabled={selectedRow?.kind !== "item"}
          onClick={handleEditSelected}
        >
          <Pencil />
        </Button>

        {selectedRow && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {selectedRow.kind === "group"
              ? `Group: ${selectedRow.data.name}`
              : `Item: ${selectedRow.data.item.mfoPpa.slice(0, 50)}${selectedRow.data.item.mfoPpa.length > 50 ? "…" : ""}`
            }
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handleExport}
            disabled={exporting}
          >
            <Download className="size-3" />
            {exporting ? "Exporting..." : "Export to LBAC F6"}
          </Button>
        </div>
      </div>

      {exportError && (
        <Typography variant="small" className="text-destructive px-1">{exportError}</Typography>
      )}

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No monitoring records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-[#FFF2CC]">
                <TableRow>
                  <TableHead rowSpan={2} className="w-[260px] min-w-[260px] max-w-[260px] align-middle border-l whitespace-normal break-words">
                    Plan/PPAs
                  </TableHead>
                  <TableHead rowSpan={2} className="min-w-36 align-middle">AIP Reference Code</TableHead>
                  <TableHead rowSpan={2} className="min-w-44 align-middle">Implementing Office/Department</TableHead>
                  <TableHead colSpan={2} className="text-center border-b">Target Output</TableHead>
                  <TableHead rowSpan={2} className="min-w-44 align-middle">Actual Accomplishments</TableHead>
                  <TableHead colSpan={2} className="text-center border-b">Estimated Cost</TableHead>
                  <TableHead rowSpan={2} className="min-w-36 align-middle text-right">Actual Expenditure</TableHead>
                  <TableHead rowSpan={2} className="w-[260px] min-w-[260px] max-w-[260px] align-middle whitespace-normal break-words">Remarks</TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle text-right">AIP vs AB</TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle text-right">AB vs Exp</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="min-w-40">AIP</TableHead>
                  <TableHead className="min-w-32">AB</TableHead>
                  <TableHead className="min-w-32 text-right">AIP</TableHead>
                  <TableHead className="min-w-32 text-right">AB</TableHead>
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
                        style={{ backgroundColor: row.depth === 0 ? GROUP_ROOT_BG : GROUP_CHILD_BG }}
                        onClick={() => handleRowClick(row)}
                        onDoubleClick={() => handleRowDoubleClick(row)}
                      >
                        <TableCell
                          className="w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words"
                          style={planIndentStyle(row.depth)}
                        >
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
                        <TableCell colSpan={ITEM_COL_SPAN} />
                      </TableRow>
                    );
                  }

                  const item = row.data;
                  const isSelected = selectedRow?.id === row.id;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${isSelected ? "bg-accent" : ""}`}
                      title="Double-click to edit monitoring fields"
                      onClick={() => handleRowClick(row)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    >
                      <TableCell
                        className="w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words"
                        style={planIndentStyle(row.depth)}
                      >
                        {txt(item.item.mfoPpa)}
                      </TableCell>
                      <TableCell className="font-mono">{txt(item.item.aipRefCode?.code)}</TableCell>
                      <TableCell>{txt(item.item.implementingUnit?.name)}</TableCell>
                      <TableCell className="min-w-40 whitespace-normal break-words">{txt(item.item.aipRefCode?.description)}</TableCell>
                      <TableCell className="whitespace-normal break-words">{txt(item.ab)}</TableCell>
                      <TableCell className="whitespace-normal break-words">{txt(item.actualAccomplishment)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.item.aipRefCode?.amount)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.abEstimatedCost)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.actualExpenditure)}</TableCell>
                      <TableCell className="w-[260px] min-w-[260px] max-w-[260px] whitespace-normal break-words">{txt(item.remarks)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.aipVsAb)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(item.aipVsExp)}</TableCell>
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

      {editorOpen && selectedItem && (
        <MonitoringEditorDialog
          item={selectedItem}
          onClose={() => setEditorOpen(false)}
          onSuccess={handleEditorSuccess}
        />
      )}
    </div>
  );
}

function MonitoringEditorDialog({
  item,
  onClose,
  onSuccess,
}: {
  item: LbacMonitoringItemResponse;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const baseId = useId();
  const [ab, setAb] = useState(item.ab ?? "");
  const [actualAccomplishment, setActualAccomplishment] = useState(item.actualAccomplishment ?? "");
  const [abEstimatedCost, setAbEstimatedCost] = useState(item.abEstimatedCost ?? "");
  const [actualExpenditure, setActualExpenditure] = useState(item.actualExpenditure ?? "");
  const [remarks, setRemarks] = useState(item.remarks ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;

    const payload: Partial<{
      ab: string;
      actualAccomplishment: string;
      abEstimatedCost: string;
      actualExpenditure: string;
      remarks: string;
    }> = {};

    const abValue = ab.trim();
    const accomplishmentValue = actualAccomplishment.trim();
    const estimatedCostValue = abEstimatedCost.trim();
    const expenditureValue = actualExpenditure.trim();
    const remarksValue = remarks.trim();

    if (abValue) payload.ab = abValue;
    if (accomplishmentValue) payload.actualAccomplishment = accomplishmentValue;
    if (estimatedCostValue) payload.abEstimatedCost = estimatedCostValue;
    if (expenditureValue) payload.actualExpenditure = expenditureValue;
    if (remarksValue) payload.remarks = remarksValue;

    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/lbac/monitoring/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const responsePayload = await res.json().catch(() => null);
        setActionError(responsePayload?.message ?? "Failed to update monitoring values. Please try again.");
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
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Monitoring Item</DialogTitle>
          <DialogDescription>
            Update monitoring fields for: {item.item.mfoPpa}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-ab`}>AB</Label>
              <Input
                id={`${baseId}-ab`}
                value={ab}
                onChange={e => setAb(e.target.value)}
                disabled={submitting}
                placeholder="Enter AB"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-ab-estimated`}>AB Estimated Cost</Label>
              <Input
                id={`${baseId}-ab-estimated`}
                value={abEstimatedCost}
                onChange={e => setAbEstimatedCost(e.target.value)}
                disabled={submitting}
                placeholder="0.00"
                className="font-mono"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-accomplishment`}>Actual Accomplishments</Label>
            <Textarea
              id={`${baseId}-accomplishment`}
              value={actualAccomplishment}
              onChange={e => setActualAccomplishment(e.target.value)}
              disabled={submitting}
              rows={4}
              placeholder="Describe actual accomplishments"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-expenditure`}>Actual Expenditure</Label>
            <Input
              id={`${baseId}-expenditure`}
              value={actualExpenditure}
              onChange={e => setActualExpenditure(e.target.value)}
              disabled={submitting}
              placeholder="0.00"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-remarks`}>Remarks</Label>
            <Textarea
              id={`${baseId}-remarks`}
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              disabled={submitting}
              rows={4}
              placeholder="Add remarks"
            />
          </div>
        </div>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function collectMatchingGroupIds(
  nodes: LbacMonitoringGroupResponse[],
  query: string,
): Set<string> {
  const matched = new Set<string>();
  function walk(nodes2: LbacMonitoringGroupResponse[], ancestors: string[]): boolean {
    let anyMatch = false;
    for (const group of nodes2) {
      const childGroups = group.children.filter(
        child => child.type === 6767,
      ) as LbacMonitoringGroupResponse[];
      const childMatch = walk(childGroups, [...ancestors, group.id]);

      const itemMatch = group.children.some(
        child => child.type === 6768 && itemMatchesQuery(child as LbacMonitoringItemResponse, query),
      );

      if (childMatch || itemMatch || group.name.toLowerCase().includes(query.toLowerCase())) {
        matched.add(group.id);
        for (const ancestorId of ancestors) matched.add(ancestorId);
        anyMatch = true;
      }
    }

    return anyMatch;
  }

  walk(nodes, []);
  return matched;
}

function itemMatchesQuery(item: LbacMonitoringItemResponse, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.item.mfoPpa.toLowerCase().includes(q)
    || (item.item.aipRefCode?.code.toLowerCase().includes(q) ?? false)
    || (item.item.aipRefCode?.description.toLowerCase().includes(q) ?? false)
    || (item.item.implementingUnit?.name.toLowerCase().includes(q) ?? false)
    || (item.ab?.toLowerCase().includes(q) ?? false)
    || (item.actualAccomplishment?.toLowerCase().includes(q) ?? false)
    || (item.remarks?.toLowerCase().includes(q) ?? false)
  );
}

function flattenVisible(
  nodes: LbacMonitoringGroupResponse[],
  collapsed: Set<string>,
  depth: number,
  query: string,
  matchingGroupIds: Set<string>,
): SelectableRow[] {
  const rows: SelectableRow[] = [];
  const filtering = query.trim().length > 0;

  for (const group of nodes) {
    if (filtering && !matchingGroupIds.has(group.id)) continue;

    rows.push({ kind: "group", id: group.id, depth, data: group });
    const shouldExpand = filtering || !collapsed.has(group.id);

    if (!shouldExpand) continue;

    for (const child of group.children) {
      if (child.type === 6768) {
        const item = child as LbacMonitoringItemResponse;
        if (filtering && !itemMatchesQuery(item, query)) continue;
        rows.push({ kind: "item", id: item.id, depth: depth + 1, groupId: group.id, data: item });
      } else {
        rows.push(...flattenVisible([child as LbacMonitoringGroupResponse], collapsed, depth + 1, query, matchingGroupIds));
      }
    }
  }

  return rows;
}

function planIndentStyle(depth: number): { paddingLeft: string } {
  return { paddingLeft: `${12 + depth * 20}px` };
}

function fmt(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function txt(value: string | null | undefined): string {
  return value ?? "—";
}
