"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Table2 } from "lucide-react";
import useSWR from "swr";

import {
  filterLbacTreeByAroLink,
  flattenLbacForm3ForExport,
  flattenLbacForm5AForExport,
  flattenLbacForm5ForExport,
  getLbeForm5CellValue,
  getForm3CellValue,
  getForm3QuarterEndingLabel,
  getForm5ACellValue,
  getForm5CellValue,
  getForm5SemesterEndingLabel,
  LBE_FORM5_EXPORT_COLUMNS,
  LBAC_FORM3_EXPORT_COLUMNS,
  LBAC_FORM5A_EXPORT_COLUMNS,
  LBAC_FORM5_EXPORT_COLUMNS,
  type LbeForm5ExportColumnKey,
  type LbacForm3ExportColumnKey,
  type LbacForm5AExportColumnKey,
  type LbacForm5ExportColumnKey,
  type LbacFormExportFlatRow,
} from "@/lib/lbac/client";
import { LBAC_GROUP_DEPTH_CHILD_COLOR, LBAC_GROUP_DEPTH_ROOT_COLOR, LBAC_TOTAL_CHILD_COLOR, LBAC_TOTAL_ROOT_COLOR } from "@/lib/lbac/export-layout";
import { $fetch } from "@/lib/http/client/fetch";
import type {
  AroOfficeListResponse,
  ApiResponseException,
  BetterFetchResponse,
  LbacGroupResponse,
} from "@/lib/http/client/responses";

import { ManageTemplatesDialog } from "@/app/(user_required)/(verified_only)/(lbac_users)/manage-templates-dialog";
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

const PREVIEW_LIMIT = 120;

type FormType = "form-3" | "form-5" | "lbe-f5" | "form-5a";

export interface ExportFormsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formType: FormType;
  tree: LbacGroupResponse[];
  exportParams: {
    year: string;
    quarter: string;
  };
}

function formLabel(formType: FormType): string {
  if (formType === "form-3") return "LBAC Form 3";
  if (formType === "form-5") return "LBAC Form 5";
  if (formType === "lbe-f5") return "LBE Form 5";
  return "LBE Form 5A";
}

function templateApiPath(formType: FormType): string {
  if (formType === "form-3") return "/api/lbac/templates/form-3";
  if (formType === "form-5") return "/api/lbac/templates/form-5";
  if (formType === "lbe-f5") return "/api/lbac/templates/lbe-f5";
  return "/api/lbac/templates/form-5a";
}

function exportApiPath(formType: FormType): string {
  if (formType === "form-3") return "/api/lbac/export/forms/form-3";
  if (formType === "form-5") return "/api/lbac/export/forms/form-5";
  if (formType === "lbe-f5") return "/api/lbac/export/forms/lbe-f5";
  return "/api/lbac/export/forms/form-5a";
}

export function ExportFormsDialog({
  open,
  onOpenChange,
  formType,
  tree,
  exportParams,
}: ExportFormsDialogProps) {
  const [aroLink, setAroLink] = useState("");
  const [form5Quarter, setForm5Quarter] = useState(() => {
    const parsed = Number.parseInt(exportParams.quarter, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 4) return String(parsed);
    return "1";
  });
  const [lgu, setLgu] = useState("TIGBAUAN, ILOILO");
  const [majorFinalOutput, setMajorFinalOutput] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [manageTemplateOpen, setManageTemplateOpen] = useState(false);

  const { data: aroOfficesData } = useSWR<
    BetterFetchResponse<AroOfficeListResponse, ApiResponseException>
  >("/api/management/data/aro-office", $fetch);
  const aroOffices = useMemo(
    () => aroOfficesData?.data?.data ?? [],
    [aroOfficesData?.data?.data],
  );

  const filteredTree = useMemo(() => {
    if (!aroLink) return [];
    return filterLbacTreeByAroLink(tree, aroLink);
  }, [tree, aroLink]);

  const selectedAroOffice = useMemo(
    () => aroOffices.find(office => office.id === aroLink) ?? null,
    [aroOffices, aroLink],
  );

  const selectedYear = Number.parseInt(exportParams.year, 10);
  const selectedQuarter = Number.parseInt(exportParams.quarter, 10);
  const selectedForm5Quarter = Number.parseInt(form5Quarter, 10);
  const effectiveForm5Quarter = Number.isFinite(selectedForm5Quarter) && selectedForm5Quarter >= 1 && selectedForm5Quarter <= 4
    ? selectedForm5Quarter
    : 1;
  const form3QuarterEndingLabel = Number.isFinite(selectedYear) && Number.isFinite(selectedQuarter)
    ? getForm3QuarterEndingLabel(selectedYear, selectedQuarter)
    : "";
  const selectedFiscalYear = Number.isFinite(selectedYear) ? selectedYear : new Date().getFullYear();

  const handleExport = async () => {
    if (!aroLink) {
      setExportError("Please select an ARO office.");
      return;
    }
    if ((formType === "lbe-f5" || formType === "form-5a") && !lgu.trim()) {
      setExportError("Please provide LGU.");
      return;
    }
    if ((formType === "lbe-f5" || formType === "form-5a") && !majorFinalOutput.trim()) {
      setExportError("Please provide Major Final Output (MFO).");
      return;
    }

    setExportError(null);
    setExporting(true);

    try {
      const params = new URLSearchParams({
        ...exportParams,
        aroLink,
      });
      if (formType === "form-5") {
        params.set("quarter", form5Quarter);
      }
      if (formType === "lbe-f5" || formType === "form-5a") {
        params.set("lgu", lgu.trim());
        params.set("mfo", majorFinalOutput.trim());
      }

      const response = await fetch(`${exportApiPath(formType)}?${params.toString()}`);
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
      const filename = filenameMatch?.[1] ?? `${formType}.xlsx`;

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
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex flex-col sm:max-w-none w-[96vw] h-[88vh] p-0 gap-0 overflow-hidden">
          <div className="flex-none px-6 pt-6 pb-3 border-b">
            <DialogHeader>
              <DialogTitle>{formLabel(formType)} Export</DialogTitle>
              <DialogDescription>
                Fixed-column export with ARO office filtering and footer template support.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="px-6 pt-3 pb-2 border-b">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1 w-80">
                <Label>ARO Office</Label>
                <Select value={aroLink} onValueChange={setAroLink}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ARO office..." />
                  </SelectTrigger>
                  <SelectContent>
                    {aroOffices.map(office => (
                      <SelectItem key={office.id} value={office.id}>{office.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formType === "form-5" && (
                <div className="flex flex-col gap-1 md:max-w-md">
                  <Label>Quarter Selector</Label>
                  <Select value={form5Quarter} onValueChange={setForm5Quarter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Quarter 1</SelectItem>
                      <SelectItem value="2">Quarter 2</SelectItem>
                      <SelectItem value="3">Quarter 3</SelectItem>
                      <SelectItem value="4">Quarter 4</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {(formType === "lbe-f5" || formType === "form-5a") && (
                <>
                  <div className="flex flex-col gap-1 md:max-w-md">
                    <Label>LGU</Label>
                    <Input
                      value={lgu}
                      onChange={event => setLgu(event.target.value)}
                      placeholder="e.g. TIGBAUAN, ILOILO"
                    />
                  </div>
                  <div className="flex flex-col gap-1 md:max-w-md">
                    <Label>Major Final Output (MFO)</Label>
                    <Input
                      value={majorFinalOutput}
                      onChange={event => setMajorFinalOutput(event.target.value)}
                      placeholder="Enter major final output"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-3">
            <TabsList className="flex-none mb-3 self-start">
              <TabsTrigger value="preview" className="text-xs gap-1.5">
                <Table2 className="size-3" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="template" className="text-xs gap-1.5">
                <FileSpreadsheet className="size-3" />
                Template
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="flex-1 min-h-0 mt-0 overflow-hidden data-[state=inactive]:hidden">
              {formType === "form-3" && (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="rounded-md border p-3 text-xs">
                    <div className="font-semibold italic">LBAc Form No.3</div>
                    <div className="mt-1 text-center text-lg font-bold leading-tight">Quarterly Physical Report of Operations</div>
                    <div className="text-center text-base font-bold leading-tight">{form3QuarterEndingLabel}</div>
                    <div className="mt-2">
                      <span className="font-medium">Department/Office: </span>
                      <span className="font-bold text-blue-700">{selectedAroOffice?.name ?? ""}</span>
                    </div>
                  </div>
                  <FormPreviewTable
                    tree={filteredTree}
                    columns={LBAC_FORM3_EXPORT_COLUMNS}
                    getCellValue={(row, key) => getForm3CellValue(
                      row as LbacFormExportFlatRow,
                      key as LbacForm3ExportColumnKey,
                    )}
                    valueColumnKey="majorFinalOutput"
                  />
                </div>
              )}
              {formType === "form-5" && (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="rounded-md border p-3 text-xs">
                    <div className="font-semibold italic">LBAc Form No.5</div>
                    <div className="mt-1 text-center text-lg font-bold leading-tight">PHYSICAL AND FINANCIAL PERFORMANCE EVALUATION FORM</div>
                    <div className="text-center text-base">{getForm5SemesterEndingLabel(selectedFiscalYear, effectiveForm5Quarter)}</div>
                    <div className="mt-2"><span className="font-medium">DEPARTMENT/OFFICE: </span><span className="font-bold text-blue-700">{selectedAroOffice?.name ?? ""}</span></div>
                  </div>
                  <Form5LbacPreviewTable
                    tree={filteredTree}
                    getCellValue={(row, key) => getForm5CellValue(
                      row as LbacFormExportFlatRow,
                      key as LbacForm5ExportColumnKey,
                      effectiveForm5Quarter,
                    )}
                  />
                </div>
              )}
              {formType === "lbe-f5" && (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="rounded-md border p-3 text-xs">
                    <div className="font-semibold italic">LBE FORM NO.5</div>
                    <div className="mt-1 text-center text-lg font-bold leading-tight">SUMMARY OF FINANCIAL AND PHYSICAL PERFORMANCE TARGETS</div>
                    <div className="text-center text-base">FY {selectedFiscalYear}</div>
                    <div className="mt-2"><span className="font-medium">LGU: </span>{lgu}</div>
                    <div><span className="font-medium">Department/Office: </span><span className="font-bold text-blue-700">{selectedAroOffice?.name ?? ""}</span></div>
                    <div><span className="font-medium">Major Final Output (MFO): </span>{majorFinalOutput}</div>
                  </div>
                  <FormPreviewTable
                    tree={filteredTree}
                    columns={LBE_FORM5_EXPORT_COLUMNS}
                    getCellValue={(row, key) => getLbeForm5CellValue(
                      row as LbacFormExportFlatRow,
                      key as LbeForm5ExportColumnKey,
                    )}
                    valueColumnKey="programProjectActivity"
                    indexLabels={["(1)", "(2)", "(3)", "(4)", "(5)", "(6)"]}
                  />
                </div>
              )}
              {formType === "form-5a" && (
                <div className="flex h-full min-h-0 flex-col gap-2">
                  <div className="rounded-md border p-3 text-xs">
                    <div className="font-semibold italic">LBE FORM NO.5A</div>
                    <div className="mt-1 text-center text-lg font-bold leading-tight">DETAILED FINANCIAL AND PHYSICAL PERFORMANCE TARGETS</div>
                    <div className="text-center text-base">FY {selectedFiscalYear}</div>
                    <div className="mt-2"><span className="font-medium">LGU: </span>{lgu}</div>
                    <div><span className="font-medium">Department/Office: </span><span className="font-bold text-blue-700">{selectedAroOffice?.name ?? ""}</span></div>
                    <div><span className="font-medium">Major Final Output (MFO): </span>{majorFinalOutput}</div>
                  </div>
                  <Form5APreviewTable
                    tree={filteredTree}
                    getCellValue={(row, key) => getForm5ACellValue(
                      row as LbacFormExportFlatRow,
                      key as LbacForm5AExportColumnKey,
                    )}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="template" className="mt-0 data-[state=inactive]:hidden">
              <div className="flex flex-col gap-3">
                <Typography variant="small" className="text-muted-foreground">
                  Manage footer template for {formLabel(formType)}.
                </Typography>
                <Button
                  className="w-fit"
                  variant="outline"
                  onClick={() => setManageTemplateOpen(true)}
                >
                  <FileSpreadsheet className="size-3" />
                  Manage Footer Template
                </Button>
              </div>
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
                disabled={exporting || !aroLink}
                onClick={() => void handleExport()}
              >
                <Download className="size-3.5" />
                {exporting ? "Exporting..." : "Export"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ManageTemplatesDialog
        open={manageTemplateOpen}
        onOpenChange={setManageTemplateOpen}
        apiPath={templateApiPath(formType)}
        title={`Manage ${formLabel(formType)} Footer`}
        description={`Upload or replace the footer template used for ${formLabel(formType)} export.`}
        templateSections={["footer"]}
      />
    </>
  );
}

function FormPreviewTable({
  tree,
  columns,
  getCellValue,
  valueColumnKey,
  indexLabels,
}: {
  tree: LbacGroupResponse[];
  columns: ReadonlyArray<{ key: string; label: string; numeric: boolean }>;
  getCellValue: (row: unknown, key: string) => string | number;
  valueColumnKey: string;
  indexLabels?: string[];
}) {
  const flat = useMemo(() => {
    if (columns === LBAC_FORM3_EXPORT_COLUMNS) return flattenLbacForm3ForExport(tree);
    if (columns === LBAC_FORM5_EXPORT_COLUMNS || columns === LBE_FORM5_EXPORT_COLUMNS) {
      return flattenLbacForm5ForExport(tree);
    }
    return flattenLbacForm5AForExport(tree);
  }, [tree, columns]);

  const rows = flat.slice(0, PREVIEW_LIMIT);
  const truncated = flat.length > PREVIEW_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Select an ARO office to preview data.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-[10px]">
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
            {indexLabels && indexLabels.length === columns.length && (
              <tr>
                {indexLabels.map((label, index) => (
                  <th
                    key={`${label}-${index}`}
                    className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const bg = row.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR;
                return (
                  <tr key={row.id} style={{ backgroundColor: bg, color: "#fff" }}>
                    {columns.map(col => {
                      const raw = getCellValue(row, col.key);
                      const display = col.key === valueColumnKey ? String(raw) : "";
                      return (
                        <td
                          key={col.key}
                          className={`border border-border px-2 py-1 ${col.key === valueColumnKey ? "font-semibold whitespace-normal break-words max-w-xs" : ""}`}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              if (row.kind === "group-total") {
                const bg = row.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR;
                return (
                  <tr key={row.id} className="font-bold" style={{ backgroundColor: bg }}>
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono" : ""}`}
                      >
                        {String(getCellValue(row, col.key))}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  {columns.map(col => (
                    <td
                      key={col.key}
                      className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono whitespace-nowrap" : "whitespace-normal break-words max-w-xs"}`}
                    >
                      {String(getCellValue(row, col.key))}
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

function Form5LbacPreviewTable({
  tree,
  getCellValue,
}: {
  tree: LbacGroupResponse[];
  getCellValue: (row: unknown, key: string) => string | number;
}) {
  const formatAmount = (value: unknown): string => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0.00";
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const flat = useMemo(() => flattenLbacForm5ForExport(tree), [tree]);
  const rows = flat.slice(0, PREVIEW_LIMIT);
  const truncated = flat.length > PREVIEW_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Select an ARO office to preview data.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-[10px]">
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th rowSpan={2} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">PPA Code</th>
              <th rowSpan={2} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">PPA Description/ Major Final Output</th>
              <th colSpan={4} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Physical Performance</th>
              <th colSpan={4} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Financial Performance</th>
            </tr>
            <tr>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Target Output</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Actual Output</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Variance</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">% of Accomplishment</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Allotment Released</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Actual Obligations Incurred</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Variance</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">Absorptive Capacity</th>
            </tr>
            <tr>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(1)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(2)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(3)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(4)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(5)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(6)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(7)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(8)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(9)=(7)-(8)</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(10)=(8)/(7)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const bg = row.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR;
                return (
                  <tr key={row.id} style={{ backgroundColor: bg, color: "#fff" }}>
                    {LBAC_FORM5_EXPORT_COLUMNS.map(col => {
                      const raw = getCellValue(row, col.key);
                      const display = col.key === "ppaDescription" ? String(raw) : "";
                      return (
                        <td
                          key={col.key}
                          className={`border border-border px-2 py-1 ${col.key === "ppaDescription" ? "font-semibold whitespace-normal break-words max-w-xs" : ""}`}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              if (row.kind === "group-total") {
                const bg = row.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR;
                return (
                  <tr key={row.id} className="font-bold" style={{ backgroundColor: bg }}>
                    {LBAC_FORM5_EXPORT_COLUMNS.map(col => (
                      <td
                        key={col.key}
                        className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono" : ""}`}
                      >
                        {col.key === "absorptiveCapacity"
                          ? `${(Number(getCellValue(row, col.key)) * 100).toFixed(2)}%`
                          : col.key === "allotmentReleased" || col.key === "actualObligationsIncurred" || col.key === "financialVariance"
                            ? formatAmount(getCellValue(row, col.key))
                            : String(getCellValue(row, col.key))}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  {LBAC_FORM5_EXPORT_COLUMNS.map(col => (
                    <td
                      key={col.key}
                      className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono whitespace-nowrap" : "whitespace-normal break-words max-w-xs"}`}
                    >
                      {col.key === "absorptiveCapacity"
                        ? `${(Number(getCellValue(row, col.key)) * 100).toFixed(2)}%`
                        : col.key === "allotmentReleased" || col.key === "actualObligationsIncurred" || col.key === "financialVariance"
                          ? formatAmount(getCellValue(row, col.key))
                          : String(getCellValue(row, col.key))}
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

function Form5APreviewTable({
  tree,
  getCellValue,
}: {
  tree: LbacGroupResponse[];
  getCellValue: (row: unknown, key: string) => string | number;
}) {
  const flat = useMemo(() => flattenLbacForm5AForExport(tree), [tree]);
  const rows = flat.slice(0, PREVIEW_LIMIT);
  const truncated = flat.length > PREVIEW_LIMIT;

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Select an ARO office to preview data.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-[10px]">
      <div className="flex-1 overflow-auto border rounded-md min-h-0">
        <table className="w-full border-collapse min-w-max text-sm">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th rowSpan={2} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">
                Program/Project/Activity
              </th>
              <th colSpan={5} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">
                FINANCIAL ALLOCATION
              </th>
              <th colSpan={4} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">
                PHYSICAL TARGETS
              </th>
            </tr>
            <tr>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">1ST QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">2ND QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">3RD QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">4TH QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">TOTAL</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">1ST QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">2ND QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">3RD QUARTER</th>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">4TH QUARTER</th>
            </tr>
            <tr>
              <th className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(1)</th>
              <th colSpan={5} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(2)</th>
              <th colSpan={4} className="border border-border px-2 py-1 text-center font-bold text-[10px] whitespace-nowrap">(3)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (row.kind === "group") {
                const bg = row.depth === 0 ? LBAC_GROUP_DEPTH_ROOT_COLOR : LBAC_GROUP_DEPTH_CHILD_COLOR;
                return (
                  <tr key={row.id} style={{ backgroundColor: bg, color: "#fff" }}>
                    {LBAC_FORM5A_EXPORT_COLUMNS.map(col => {
                      const raw = getCellValue(row, col.key);
                      const display = col.key === "programProjectActivity" ? String(raw) : "";
                      return (
                        <td
                          key={col.key}
                          className={`border border-border px-2 py-1 ${col.key === "programProjectActivity" ? "font-semibold whitespace-normal break-words max-w-xs" : ""}`}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              }

              if (row.kind === "group-total") {
                const bg = row.isRoot ? LBAC_TOTAL_ROOT_COLOR : LBAC_TOTAL_CHILD_COLOR;
                return (
                  <tr key={row.id} className="font-bold" style={{ backgroundColor: bg }}>
                    {LBAC_FORM5A_EXPORT_COLUMNS.map(col => (
                      <td
                        key={col.key}
                        className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono" : ""}`}
                      >
                        {String(getCellValue(row, col.key))}
                      </td>
                    ))}
                  </tr>
                );
              }

              return (
                <tr key={row.id} className="hover:bg-muted/30">
                  {LBAC_FORM5A_EXPORT_COLUMNS.map(col => (
                    <td
                      key={col.key}
                      className={`border border-border px-2 py-1 ${col.numeric ? "text-right font-mono whitespace-nowrap" : "whitespace-normal break-words max-w-xs"}`}
                    >
                      {String(getCellValue(row, col.key))}
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
