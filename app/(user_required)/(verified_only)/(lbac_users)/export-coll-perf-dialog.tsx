"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Table2 } from "lucide-react";

import {
  COLL_PERF_EXPORT_COLUMN_GROUPS,
  COLL_PERF_EXPORT_COLUMNS,
  type CollPerfExportColDef,
  type CollPerfExportColumnKey,
} from "@/common/lbac/client";
import type { CollPerfGroupResponse } from "@/lib/http/client/responses";

import { CollPerfExportPreviewTable } from "@/app/(user_required)/(verified_only)/(lbac_users)/coll-perf-export-preview-table";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import Typography from "@/components/typography";

function ColumnSelector({
  selected,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: {
  selected: Set<CollPerfExportColumnKey>;
  onToggle: (key: CollPerfExportColumnKey) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}) {
  const totalCount = COLL_PERF_EXPORT_COLUMNS.length;
  const selectedCount = selected.size;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex shrink-0 items-center justify-between">
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

      <ScrollArea className="h-0 min-h-0 flex-1">
        <div className="flex flex-col gap-4 pr-3 pb-4">
          {COLL_PERF_EXPORT_COLUMN_GROUPS.map(group => (
            <div key={group.group} className="flex flex-col gap-2">
              <Typography
                variant="small"
                className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]"
              >
                {group.group}
              </Typography>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {group.columns.map((col: CollPerfExportColDef) => (
                  <div key={col.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`coll-perf-col-${col.key}`}
                      checked={selected.has(col.key)}
                      onCheckedChange={() => onToggle(col.key)}
                    />
                    <Label
                      htmlFor={`coll-perf-col-${col.key}`}
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

export interface ExportCollPerfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exportApiBase: string;
  tree: CollPerfGroupResponse[];
  year: number;
  defaultQuarter?: number;
}

export function ExportCollPerfDialog({
  open,
  onOpenChange,
  exportApiBase,
  tree,
  year,
  defaultQuarter = 1,
}: ExportCollPerfDialogProps) {
  const [selected, setSelected] = useState<Set<CollPerfExportColumnKey>>(
    () => new Set(COLL_PERF_EXPORT_COLUMNS.map(c => c.key)),
  );
  const [quarter, setQuarter] = useState(defaultQuarter);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const orderedColumns = useMemo(
    () => COLL_PERF_EXPORT_COLUMNS.map(c => c.key).filter(k => selected.has(k)),
    [selected],
  );

  const handleToggle = useCallback((key: CollPerfExportColumnKey) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(COLL_PERF_EXPORT_COLUMNS.map(c => c.key)));
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
        year: String(year),
        quarter: String(quarter),
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
      const filename = filenameMatch?.[1] ?? "lbac-coll-perf-export.xlsx";

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
  }, [exportApiBase, onOpenChange, orderedColumns, quarter, year]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col sm:max-w-none w-[96vw] h-[88vh] p-0 gap-0 overflow-hidden">
        <div className="flex-none px-6 pt-6 pb-3 border-b">
          <DialogHeader>
            <DialogTitle>Export Collection Performance</DialogTitle>
            <DialogDescription>
              Select the reporting quarter and columns for the LBac Form No. 1 spreadsheet export.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-none px-6 py-3 border-b flex items-center gap-3">
          <Typography variant="small" className="text-muted-foreground shrink-0">
            Quarter
          </Typography>
          <Select
            value={String(quarter)}
            onValueChange={v => setQuarter(Number.parseInt(v, 10))}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Q1</SelectItem>
              <SelectItem value="2">Q2</SelectItem>
              <SelectItem value="3">Q3</SelectItem>
              <SelectItem value="4">Q4</SelectItem>
            </SelectContent>
          </Select>
          <Typography variant="small" className="text-muted-foreground">
            Year {year}
          </Typography>
        </div>

        <Tabs defaultValue="columns" className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-3">
          <TabsList className="flex-none mb-3 self-start">
            <TabsTrigger value="columns" className="text-xs gap-1.5">
              Columns
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs gap-1.5">
              <Table2 className="size-3" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="columns"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <ColumnSelector
              selected={selected}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onDeselectAll={handleDeselectAll}
            />
          </TabsContent>

          <TabsContent value="preview" className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden">
            <CollPerfExportPreviewTable
              tree={tree}
              year={year}
              quarter={quarter}
              selectedColumns={orderedColumns}
            />
          </TabsContent>
        </Tabs>

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
