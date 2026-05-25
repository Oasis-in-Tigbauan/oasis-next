"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Search, Trash2 } from "lucide-react";
import { Decimal } from "decimal.js";
import useSWR from "swr";

import {
  flattenLbacFlatItemsForOffice,
  LBE_F1_BUDGET_TYPES,
  type LbeF1BudgetType,
} from "@/lib/lbac/client";
import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacGroupResponse,
  LbacItemResponse,
  OfficeCodeListResponse,
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

function getBudgetValue(item: LbacItemResponse, budgetType: LbeF1BudgetType): string {
  if (budgetType === "PS") return item.proposedBudgetPS;
  if (budgetType === "MOOE") return item.proposedBudgetMOOE;
  if (budgetType === "FE") return item.proposedBudgetFE;
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

export function ExportLbeFOneDialog({
  open,
  onOpenChange,
  tree,
  exportParams,
}: ExportLbeFOneDialogProps) {
  const [implementingUnitId, setImplementingUnitId] = useState("");
  const [budgetType, setBudgetType] = useState<LbeF1BudgetType>("PS");
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [manageTemplateOpen, setManageTemplateOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: officeCodesData } = useSWR<
    BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>
  >("/api/management/data/office-codes", $fetch);
  const officeCodes = officeCodesData?.data?.data ?? [];

  const availableItems = useMemo(() => {
    if (!implementingUnitId) return [];
    const byOffice = flattenLbacFlatItemsForOffice(tree, implementingUnitId);
    return byOffice.filter(item => includesQuery(item, itemSearch));
  }, [tree, implementingUnitId, itemSearch]);

  const selectedIds = useMemo(() => new Set(selectedItems.map(selected => selected.item.id)), [selectedItems]);

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
    if (!implementingUnitId) {
      setExportError("Please select an office code.");
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
          implementingUnitId,
          budgetType,
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
                Select office, budget type, and items with release values.
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
                    <Label>Office Code</Label>
                    <Select value={implementingUnitId} onValueChange={setImplementingUnitId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select office code..." />
                      </SelectTrigger>
                      <SelectContent>
                        {officeCodes.map(code => (
                          <SelectItem key={code.id} value={code.id}>{code.aa}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Budget Type</Label>
                    <Select value={budgetType} onValueChange={value => setBudgetType(value as LbeF1BudgetType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LBE_F1_BUDGET_TYPES.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
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
                      disabled={!implementingUnitId}
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
                          <td className="border px-2 py-1 text-right">{getBudgetValue(item, budgetType)}</td>
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
                            {implementingUnitId ? "No items found." : "Select an office code first."}
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
                        const authorized = getBudgetValue(entry.item, budgetType);
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
              <div className="border rounded-md overflow-hidden">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className="border px-2 py-1 text-left">PPA Code</th>
                      <th className="border px-2 py-1 text-left">PPA Description</th>
                      <th className="border px-2 py-1 text-left">Object Class/Account Code</th>
                      <th className="border px-2 py-1 text-right">Authorized Appropriation</th>
                      <th className="border px-2 py-1 text-right">For Later Release</th>
                      <th className="border px-2 py-1 text-right">Previously Released Amount</th>
                      <th className="border px-2 py-1 text-right">This Release</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.map(entry => {
                      const authorized = getBudgetValue(entry.item, budgetType);
                      return (
                        <tr key={entry.item.id}>
                          <td className="border px-2 py-1">{entry.item.aipRefCode?.aipReferenceCode ?? ""}</td>
                          <td className="border px-2 py-1">{entry.item.mfoPpa}</td>
                          <td className="border px-2 py-1">{entry.item.other.expenseCode?.accountCode ?? ""}</td>
                          <td className="border px-2 py-1 text-right">{authorized}</td>
                          <td className="border px-2 py-1 text-right">{entry.forLaterRelease}</td>
                          <td className="border px-2 py-1 text-right">{entry.previouslyReleased}</td>
                          <td className="border px-2 py-1 text-right font-mono">
                            {computeThisRelease(authorized, entry.forLaterRelease, entry.previouslyReleased)}
                          </td>
                        </tr>
                      );
                    })}
                    {selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={7} className="border px-2 py-3 text-center text-muted-foreground">
                          Configure and add items first.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                disabled={exporting || !implementingUnitId || selectedItems.length === 0}
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
