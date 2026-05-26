"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Search, Trash2 } from "lucide-react";
import { Decimal } from "decimal.js";
import useSWR from "swr";

import {
  amountToEnglishWords,
  flattenLbacFlatItemsForAroLink,
  getLbeF1AroCode,
  getLbeF1FormNo,
  getLbeF1Title,
  LBE_F1_ARO_TYPES,
  type LbeF1AroType,
} from "@/lib/lbac/client";
import { $fetch } from "@/lib/http/client/fetch";
import type {
  AroOfficeListResponse,
  ApiResponseException,
  BetterFetchResponse,
  LbacGroupResponse,
  LbacItemResponse,
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

type SelectedItem = {
  item: LbacItemResponse;
  forLaterRelease: string;
  previouslyReleased: string;
};

export interface ExportLbeFOneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tree: LbacGroupResponse[];
  exportParams: {
    year: string;
    quarter: string;
  };
}

function getBudgetValue(item: LbacItemResponse, aroType: LbeF1AroType): string {
  if (aroType === "ps") return item.proposedBudgetPS;
  if (aroType === "mooe") return item.proposedBudgetMOOE;
  if (aroType === "finex") return item.proposedBudgetFE;
  return item.proposedBudgetCO;
}

function computeThisRelease(authorizedAppropriation: string, forLater: string, prevReleased: string): string {
  try {
    const value = new Decimal(authorizedAppropriation || "0")
      .minus(new Decimal(forLater || "0"))
      .minus(new Decimal(prevReleased || "0"));
    return value.toFixed(2);
  } catch {
    return "0.00";
  }
}

function includesQuery(item: LbacItemResponse, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    (item.aipRefCode?.aipReferenceCode.toLowerCase().includes(q) ?? false)
    || item.mfoPpa.toLowerCase().includes(q)
  );
}

function formatCurrency(value: string): string {
  try {
    const amount = new Decimal(value || "0");
    return amount.toNumber().toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return "0.00";
  }
}

function getUtc8Year(dateIso: string | undefined): number {
  const value = dateIso ? new Date(dateIso) : new Date();
  return Number(new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(value));
}

function formatUtc8Date(dateIso: string | undefined): string {
  const value = dateIso ? new Date(dateIso) : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).formatToParts(value);

  const month = parts.find(part => part.type === "month")?.value ?? "01";
  const day = parts.find(part => part.type === "day")?.value ?? "01";
  const year = parts.find(part => part.type === "year")?.value ?? "1970";
  return `${month}/${day}/${year}`;
}

export function ExportLbeFOneDialog({
  open,
  onOpenChange,
  tree,
  exportParams,
}: ExportLbeFOneDialogProps) {
  const [aroLink, setAroLink] = useState("");
  const [aroType, setAroType] = useState<LbeF1AroType>("ps");
  const [lgu, setLgu] = useState("TIGBAUAN, ILOILO");
  const [purpose, setPurpose] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [manageTemplateOpen, setManageTemplateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: aroOfficesData } = useSWR<
    BetterFetchResponse<AroOfficeListResponse, ApiResponseException>
  >("/api/management/data/aro-office", $fetch);
  const aroOffices = aroOfficesData?.data?.data ?? [];

  const availableItems = useMemo(() => {
    if (!aroLink) return [];
    const byAroOffice = flattenLbacFlatItemsForAroLink(tree, aroLink);
    return byAroOffice
      .filter(item => item.other.aro?.type === aroType)
      .filter(item => includesQuery(item, itemSearch));
  }, [tree, aroLink, aroType, itemSearch]);

  const selectedIds = useMemo(() => new Set(selectedItems.map(selected => selected.item.id)), [selectedItems]);

  const previewRows = useMemo(() => selectedItems.map(entry => {
    const authorized = getBudgetValue(entry.item, aroType);
    const thisRelease = computeThisRelease(authorized, entry.forLaterRelease, entry.previouslyReleased);
    return {
      item: entry.item,
      authorized,
      forLaterRelease: entry.forLaterRelease,
      previouslyReleased: entry.previouslyReleased,
      thisRelease,
    };
  }), [selectedItems, aroType]);

  const totals = useMemo(() => {
    let authorized = new Decimal(0);
    let forLater = new Decimal(0);
    let previouslyReleased = new Decimal(0);
    let thisRelease = new Decimal(0);

    for (const row of previewRows) {
      try {
        authorized = authorized.plus(new Decimal(row.authorized || "0"));
        forLater = forLater.plus(new Decimal(row.forLaterRelease || "0"));
        previouslyReleased = previouslyReleased.plus(new Decimal(row.previouslyReleased || "0"));
        thisRelease = thisRelease.plus(new Decimal(row.thisRelease || "0"));
      } catch {
        // Skip malformed values and keep other rows valid.
      }
    }

    return { authorized, forLater, previouslyReleased, thisRelease };
  }, [previewRows]);

  const firstItem = selectedItems[0]?.item;
  const firstAroType = firstItem?.other.aro?.type ?? aroType;
  const firstBudgetType = firstItem?.other.budgetType ?? null;
  const fiscalYear = getUtc8Year(undefined);
  const issueDate = formatUtc8Date(firstItem?.createdAt);
  const aroYear = getUtc8Year(firstItem?.createdAt);
  const aroOfficeCode = firstItem?.other.aro?.office.code ?? "";
  const aroNo = `${getLbeF1AroCode(firstAroType)}-${aroYear}-${aroOfficeCode}`;
  const departmentOffice = firstItem?.other.aro?.office.name ?? "";
  const fundType = firstItem?.other.tagging ?? "";
  const amountInWords = amountToEnglishWords(totals.thisRelease.toFixed(2));

  const addItem = (item: LbacItemResponse) => {
    if (selectedIds.has(item.id)) return;
    setSelectedItems(prev => ([...prev, {
      item,
      forLaterRelease: "0",
      previouslyReleased: "0",
    }]));
  };

  const removeItem = (id: string) => {
    setSelectedItems(prev => prev.filter(entry => entry.item.id !== id));
  };

  const updateSelectedValue = (
    id: string,
    field: "forLaterRelease" | "previouslyReleased",
    value: string,
  ) => {
    setSelectedItems(prev => prev.map(entry => {
      if (entry.item.id !== id) return entry;
      return {
        ...entry,
        [field]: value,
      };
    }));
  };

  const handleExport = async () => {
    if (!aroLink) {
      setExportError("Please select an ARO office.");
      return;
    }
    if (!lgu.trim()) {
      setExportError("Please enter LGU.");
      return;
    }
    if (!purpose.trim()) {
      setExportError("Please enter Purpose.");
      return;
    }
    if (selectedItems.length === 0) {
      setExportError("Please select at least one item.");
      return;
    }

    setExportError(null);
    setExporting(true);

    try {
      const response = await fetch("/api/lbac/export/forms/lbe-f1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          year: Number.parseInt(exportParams.year, 10),
          quarter: Number.parseInt(exportParams.quarter, 10),
          aroLink,
          aroType,
          lgu: lgu.trim(),
          purpose: purpose.trim(),
          items: selectedItems.map(entry => ({
            id: entry.item.id,
            forLaterRelease: entry.forLaterRelease,
            previouslyReleased: entry.previouslyReleased,
          })),
        }),
      });

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
      const filename = filenameMatch?.[1] ?? "lbe-f1.xlsx";

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
              <DialogTitle>LBE Form 1 Export</DialogTitle>
              <DialogDescription>
                Select ARO office, ARO type, and items with release values.
              </DialogDescription>
            </DialogHeader>
          </div>

          <Tabs defaultValue="configure" className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pt-3">
            <TabsList className="flex-none mb-3 self-start">
              <TabsTrigger value="configure" className="text-xs gap-1.5">
                Configure
              </TabsTrigger>
              <TabsTrigger value="preview" className="text-xs gap-1.5">
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="configure" className="mt-0 flex-1 min-h-0 overflow-auto data-[state=inactive]:hidden">
              <div className="flex flex-col gap-4 pb-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label>LGU</Label>
                    <Input
                      value={lgu}
                      onChange={e => setLgu(e.target.value)}
                      placeholder="e.g. TIGBAUAN, ILOILO"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Purpose</Label>
                    <Input
                      value={purpose}
                      onChange={e => setPurpose(e.target.value)}
                      placeholder="e.g. For Executive Governance Program"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
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
                  <div className="flex flex-col gap-1">
                    <Label>ARO Type</Label>
                    <Select value={aroType} onValueChange={value => setAroType(value as LbeF1AroType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LBE_F1_ARO_TYPES.map(type => (
                          <SelectItem key={type} value={type}>{type.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <Label>Search Items</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
                    <Input
                      className="pl-7"
                      value={itemSearch}
                      onChange={e => setItemSearch(e.target.value)}
                      placeholder="Search AIP code or MFO/PPA..."
                      disabled={!aroLink}
                    />
                  </div>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="border px-2 py-1 text-left">AIP Code</th>
                        <th className="border px-2 py-1 text-left">PPA Description</th>
                        <th className="border px-2 py-1 text-right">Authorized</th>
                        <th className="border px-2 py-1 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableItems.slice(0, 40).map(item => (
                        <tr key={item.id}>
                          <td className="border px-2 py-1">{item.aipRefCode?.aipReferenceCode ?? ""}</td>
                          <td className="border px-2 py-1">{item.mfoPpa}</td>
                          <td className="border px-2 py-1 text-right">{getBudgetValue(item, aroType)}</td>
                          <td className="border px-2 py-1 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-xs"
                              disabled={selectedIds.has(item.id)}
                              onClick={() => addItem(item)}
                            >
                              <Plus className="size-3" />
                              Add
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {availableItems.length === 0 && (
                        <tr>
                          <td colSpan={4} className="border px-2 py-3 text-center text-muted-foreground">
                            {aroLink ? "No items found for the selected ARO type." : "Select an ARO office first."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="border rounded-md overflow-hidden">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="border px-2 py-1 text-left">AIP Code</th>
                        <th className="border px-2 py-1 text-left">PPA Description</th>
                        <th className="border px-2 py-1 text-left">Account Code</th>
                        <th className="border px-2 py-1 text-right">Authorized</th>
                        <th className="border px-2 py-1 text-right">For Later Release</th>
                        <th className="border px-2 py-1 text-right">Previously Released</th>
                        <th className="border px-2 py-1 text-right">This Release</th>
                        <th className="border px-2 py-1 text-center">Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map(entry => {
                        const authorized = getBudgetValue(entry.item, aroType);
                        return (
                          <tr key={entry.item.id}>
                            <td className="border px-2 py-1">{entry.item.aipRefCode?.aipReferenceCode ?? ""}</td>
                            <td className="border px-2 py-1">{entry.item.mfoPpa}</td>
                            <td className="border px-2 py-1">{entry.item.other.expenseCode?.accountCode ?? ""}</td>
                            <td className="border px-2 py-1 text-right">{authorized}</td>
                            <td className="border px-2 py-1">
                              <Input
                                value={entry.forLaterRelease}
                                onChange={e => updateSelectedValue(entry.item.id, "forLaterRelease", e.target.value)}
                                className="h-7 text-xs text-right"
                              />
                            </td>
                            <td className="border px-2 py-1">
                              <Input
                                value={entry.previouslyReleased}
                                onChange={e => updateSelectedValue(entry.item.id, "previouslyReleased", e.target.value)}
                                className="h-7 text-xs text-right"
                              />
                            </td>
                            <td className="border px-2 py-1 text-right font-mono">
                              {computeThisRelease(authorized, entry.forLaterRelease, entry.previouslyReleased)}
                            </td>
                            <td className="border px-2 py-1 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs text-destructive hover:text-destructive"
                                onClick={() => removeItem(entry.item.id)}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {selectedItems.length === 0 && (
                        <tr>
                          <td colSpan={8} className="border px-2 py-3 text-center text-muted-foreground">
                            No selected items yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() => setManageTemplateOpen(true)}
                >
                  <FileSpreadsheet className="size-3" />
                  Manage Footer Template
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="mt-0 flex-1 min-h-0 overflow-auto data-[state=inactive]:hidden">
              <div className="border rounded-md p-3 md:p-4 text-xs">
                <div className="flex items-start justify-between gap-4">
                  <div className="font-bold text-sm">{getLbeF1FormNo(firstAroType)}</div>
                  <div className="flex flex-col gap-1 text-right">
                    <div>{firstBudgetType === "ab" ? "[x]" : "[ ]"} ANNUAL BUDGET</div>
                    <div>{firstBudgetType === "sb" ? "[x]" : "[ ]"} SUPPLEMENTAL BUDGET</div>
                    <div>{firstBudgetType === "rb" ? "[x]" : "[ ]"} REENACTED BUDGET</div>
                  </div>
                </div>

                <div className="mt-4 text-center font-bold text-base leading-snug">
                  {getLbeF1Title(firstAroType)}
                </div>
                <div className="text-center mt-1 text-sm">Fiscal Year {fiscalYear}</div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                  <div><span className="font-semibold">LGU:</span> {lgu || "-"}</div>
                  <div><span className="font-semibold">ARO No.:</span> {aroOfficeCode ? aroNo : "-"}</div>
                  <div><span className="font-semibold">Department/Office:</span> {departmentOffice || "-"}</div>
                  <div><span className="font-semibold">Date of Issue:</span> {firstItem ? issueDate : "-"}</div>
                  <div className="md:col-span-2"><span className="font-semibold">Purpose:</span> {purpose || "-"}</div>
                  <div className="md:col-span-2"><span className="font-semibold">Fund Type:</span> {fundType || "-"}</div>
                </div>

                <div className="mt-4 overflow-auto border">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted">
                        <th className="border px-2 py-1 text-center">PPA CODE</th>
                        <th className="border px-2 py-1 text-center">PPA DESCRIPTION</th>
                        <th className="border px-2 py-1 text-center">OBJECT CLASS/ACCOUNT CODE</th>
                        <th className="border px-2 py-1 text-center">AUTHORIZED APPROPRIATION for {getLbeF1AroCode(firstAroType)}</th>
                        <th className="border px-2 py-1 text-center">FOR LATER RELEASE</th>
                        <th className="border px-2 py-1 text-center">PREVIOUSLY RELEASED AMOUNT</th>
                        <th className="border px-2 py-1 text-center">THIS RELEASE</th>
                      </tr>
                      <tr>
                        <th className="border px-2 py-1 text-center">(1)</th>
                        <th className="border px-2 py-1 text-center">(2)</th>
                        <th className="border px-2 py-1 text-center">(3)</th>
                        <th className="border px-2 py-1 text-center">(4)</th>
                        <th className="border px-2 py-1 text-center">(5)</th>
                        <th className="border px-2 py-1 text-center">(6)</th>
                        <th className="border px-2 py-1 text-center">(7)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map(row => (
                        <tr key={row.item.id}>
                          <td className="border px-2 py-1">{row.item.aipRefCode?.aipReferenceCode ?? ""}</td>
                          <td className="border px-2 py-1">{row.item.mfoPpa}</td>
                          <td className="border px-2 py-1">{row.item.other.expenseCode?.accountCode ?? ""}</td>
                          <td className="border px-2 py-1 text-right">{formatCurrency(row.authorized)}</td>
                          <td className="border px-2 py-1 text-right">{formatCurrency(row.forLaterRelease)}</td>
                          <td className="border px-2 py-1 text-right">{formatCurrency(row.previouslyReleased)}</td>
                          <td className="border px-2 py-1 text-right font-semibold">{formatCurrency(row.thisRelease)}</td>
                        </tr>
                      ))}
                      {previewRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="border px-2 py-3 text-center text-muted-foreground">
                            Configure and add items first.
                          </td>
                        </tr>
                      )}
                      <tr className="font-semibold">
                        <td className="border px-2 py-1 text-center" colSpan={3}>TOTAL</td>
                        <td className="border px-2 py-1 text-right">{formatCurrency(totals.authorized.toFixed(2))}</td>
                        <td className="border px-2 py-1 text-right">{formatCurrency(totals.forLater.toFixed(2))}</td>
                        <td className="border px-2 py-1 text-right">{formatCurrency(totals.previouslyReleased.toFixed(2))}</td>
                        <td className="border px-2 py-1 text-right">{formatCurrency(totals.thisRelease.toFixed(2))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-2 border p-2">
                  <span className="font-semibold">AMOUNT IN WORDS: </span>
                  <span className="font-semibold">{amountInWords}</span>
                </div>
                <div className="mt-2 border p-2">
                  <span className="font-semibold">NOTES:</span> The allotments herein released shall be used solely for the purposes indicated and disbursements thereto shall be made in accordance with existing budgeting, accounting and auditing rules and regulations. It is the primary responsibility of the head of the Department/Office/ or Unit concerned to keep expenditures within the limits of the amount allotted.
                </div>
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
                disabled={exporting || !aroLink || selectedItems.length === 0}
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
        apiPath="/api/lbac/templates/lbe-f1"
        title="Manage LBE Form 1 Footer"
        description="Upload or replace the footer template used for LBE Form 1 export."
        templateSections={["footer"]}
      />
    </>
  );
}
