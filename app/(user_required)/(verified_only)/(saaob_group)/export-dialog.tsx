"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Table2 } from "lucide-react";

import {
  SAAOB_EXPORT_COLUMN_GROUPS,
  SAAOB_EXPORT_COLUMNS,
  type SaaobExportColDef,
  type SaaobExportColumnKey,
  flattenSaaobVisible,
  fmtAmount,
  fmtPercent,
} from "@/lib/saaob/client";
import type { SaaobGroupResponse, SaaobEntryResponse } from "@/lib/http/client/responses";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import Typography from "@/components/typography";

function getEntryPreviewValue(
  entry: SaaobEntryResponse,
  col: SaaobExportColumnKey,
): string {
  switch (col) {
  case "accountCode":                return entry.accountCode ?? "—";
  case "annualBudget":               return fmtAmount(entry.annualBudget);
  case "supplementalOrContinuing":   return fmtAmount(entry.supplementalOrContinuing);
  case "appropriation":              return fmtAmount(entry.appropriation);
  case "allotment":                  return fmtAmount(entry.allotment);
  case "obligation":                 return fmtAmount(entry.obligation);
  case "unobligatedBalance":         return fmtAmount(entry.unObligatedBalance);
  case "percentage":                 return fmtPercent(entry.percentage);
  case "remarks":                    return entry.other.remarks ?? "—";
  case "quarterlyAllotmentBalance":      return fmtAmount(entry.other.quarterlyAllotmentBalance.value);
  case "quarterlyAllotmentBalancePct":   return fmtPercent(entry.other.quarterlyAllotmentBalance.percentage);
  case "disbursed":                  return fmtAmount(entry.other.disbursed.value);
  case "disbursedPct":               return fmtPercent(entry.other.disbursed.percentage);
  case "disbursedVariance":          return fmtAmount(entry.other.disbursed.variance);
  case "lbacBudget":                 return fmtAmount(entry.other.lbacBudget.value);
  case "lbacBudgetVariance":         return fmtAmount(entry.other.lbacBudget.variance);
  case "lbacObligated":              return fmtAmount(entry.other.lbacBudget.obligated);
  case "lbacObligatedVariance":      return fmtAmount(entry.other.lbacBudget.varianceObligated);
  case "obligationWithPRs":          return fmtAmount(entry.other.obligationWithPRs.value);
  case "obligationWithPRsBalance":   return fmtAmount(entry.other.obligationWithPRs.balance);
  case "obligationWithPRsPct":       return fmtPercent(entry.other.obligationWithPRs.percentage);
  case "pr":                         return fmtAmount(entry.other.pr);
  default:                           return "—";
  }
}

// ── Preview sub-component ─────────────────────────────────────────────────────

function PreviewTable({
  tree,
  selectedColumns,
}: {
  tree: SaaobGroupResponse[];
  selectedColumns: SaaobExportColumnKey[];
}) {
  const flat = useMemo(
    () => flattenSaaobVisible(tree, new Set(), 0, true),
    [tree],
  );

  const PREVIEW_LIMIT = 120;
  const rows = flat.slice(0, PREVIEW_LIMIT);
  const truncated = flat.length > PREVIEW_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        No data to preview.
      </div>
    );
  }

  const colDefs = SAAOB_EXPORT_COLUMNS.filter((c): c is SaaobExportColDef => selectedColumns.includes(c.key));

  return (
    <div className="flex flex-col h-full text-[10px]">
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max">
          <thead className="sticky top-0 z-10 bg-green-50">
            <tr>
              <th className="border border-border px-2 py-1 text-left font-bold min-w-[240px]">
                Functions/Program/Project/Activity
              </th>
              {colDefs.map((c: SaaobExportColDef) => (
                <th key={c.key} className="border border-border px-2 py-1 text-center font-bold whitespace-nowrap min-w-[90px]">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const { depth, data } = row;

                if (depth === 0) {
                  return (
                    <tr key={row.id} className="bg-blue-50">
                      <td
                        className="border border-border px-2 py-1 font-bold text-center uppercase underline"
                        colSpan={1 + colDefs.length}
                      >
                        {data.name}
                      </td>
                    </tr>
                  );
                }

                if (depth <= 2) {
                  return (
                    <tr key={row.id}>
                      <td
                        className="border border-border px-2 py-1 font-bold text-blue-700"
                        colSpan={1 + colDefs.length}
                      >
                        {data.name}
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={row.id}>
                    <td
                      className="border border-border px-2 py-1 italic text-blue-700 pl-5"
                      colSpan={1 + colDefs.length}
                    >
                      {data.name}
                    </td>
                  </tr>
                );
              }

              if (row.kind === "total") return null;

              const { data } = row;
              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="border border-border px-2 py-1 pl-9 whitespace-normal break-words max-w-xs">
                    {data.name}
                  </td>
                  {colDefs.map((c: SaaobExportColDef) => (
                    <td key={c.key} className="border border-border px-2 py-1 text-right font-mono whitespace-nowrap">
                      {getEntryPreviewValue(data, c.key)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {truncated && (
        <Typography variant="small" className="mt-1.5 text-muted-foreground">
          Showing first {PREVIEW_LIMIT} of {flat.length} rows. The exported file contains all rows.
        </Typography>
      )}
    </div>
  );
}

// ── Column selection sub-component ───────────────────────────────────────────

function ColumnSelector({
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  selected: Set<SaaobExportColumnKey>;
  onToggle: (key: SaaobExportColumnKey) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const totalCount = SAAOB_EXPORT_COLUMNS.length;
  const selectedCount = selected.size;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Typography variant="small" className="text-muted-foreground">
          {selectedCount} / {totalCount} columns selected
        </Typography>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onSelectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={onDeselectAll}>
            Deselect All
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col gap-4 pr-2">
          {SAAOB_EXPORT_COLUMN_GROUPS.map(group => (
            <div key={group.group} className="flex flex-col gap-2">
              <Typography variant="small" className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">
                {group.group}
              </Typography>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {group.columns.map((col: SaaobExportColDef) => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`col-${col.key}`}
                      checked={selected.has(col.key)}
                      onCheckedChange={() => onToggle(col.key)}
                    />
                    <Label
                      htmlFor={`col-${col.key}`}
                      className="text-xs font-normal cursor-pointer leading-tight"
                    >
                      {col.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Base API URL without query parameters, e.g. "/api/saaob/export/data". */
  exportApiBase: string;
  /** Additional query params appended to the export URL (e.g. year, month). */
  exportParams?: Record<string, string>;
  /** Pre-loaded unfiltered tree for the preview. */
  tree: SaaobGroupResponse[];
}

export function ExportDialog({
  open,
  onOpenChange,
  exportApiBase,
  exportParams,
  tree,
}: ExportDialogProps) {
  const [selected, setSelected] = useState<Set<SaaobExportColumnKey>>(
    () => new Set(SAAOB_EXPORT_COLUMNS.map(c => c.key)),
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const orderedColumns = useMemo(
    () => SAAOB_EXPORT_COLUMNS.map(c => c.key).filter(k => selected.has(k)),
    [selected],
  );

  const handleToggle = useCallback((key: SaaobExportColumnKey) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(SAAOB_EXPORT_COLUMNS.map(c => c.key)));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleExport = useCallback(async () => {
    if (orderedColumns.length === 0) {
      setExportError("Please select at least one column to export.");
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      const params = new URLSearchParams({
        ...(exportParams ?? {}),
        columns: orderedColumns.join(","),
      });

      const response = await fetch(`${exportApiBase}?${params.toString()}`);
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
      const filenameMatch = /filename="([^"]+)"/.exec(contentDisposition);
      const filename = filenameMatch?.[1] ?? "saaob-export.xlsx";

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onOpenChange(false);
    } catch {
      setExportError("An unexpected error occurred. Please try again.");
    } finally {
      setExporting(false);
    }
  }, [exportApiBase, exportParams, onOpenChange, orderedColumns]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-none w-[96vw] h-[88vh] p-0 gap-0 overflow-hidden">
        {/* ── Header ── */}
        <div className="flex-none px-6 pt-6 pb-3 border-b">
          <DialogHeader>
            <DialogTitle>Export to Spreadsheet</DialogTitle>
            <DialogDescription>
              Select which columns to include in the exported XLSX file.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Tabs (fills remaining space) ── */}
        <Tabs defaultValue="columns" className="flex flex-col flex-1 min-h-0 px-6 pt-3">
          <TabsList className="flex-none mb-3 self-start">
            <TabsTrigger value="columns" className="text-xs gap-1.5">
              Columns
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs gap-1.5">
              <Table2 className="size-3" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="columns" className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden">
            <ColumnSelector
              selected={selected}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          </TabsContent>

          <TabsContent value="preview" className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden">
            <PreviewTable tree={tree} selectedColumns={orderedColumns} />
          </TabsContent>
        </Tabs>

        {/* ── Footer ── */}
        <div className="flex-none px-6 py-4 border-t flex flex-col gap-2">
          {exportError && (
            <Typography variant="small" className="text-destructive">
              {exportError}
            </Typography>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={exporting || selected.size === 0}
              onClick={() => void handleExport()}
            >
              <Download className="size-3.5" />
              {exporting ? "Exporting..." : "Export"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
