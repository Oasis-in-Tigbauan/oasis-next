"use client";

import { useState } from "react";
import { Pencil, Plus, Search, Shuffle, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  SaaobDataResponse,
  SaaobGroupResponse,
  SaaobStatisticGroupResponse,
  SaaobStatisticsDataResponse,
  SaaobSummaryDataResponse,
  SaaobSummaryGroupResponse,
  SaaobSummaryItemResponse,
} from "@/lib/http/client/responses";
import {
  collectSaaobStatisticGroups,
  type SaaobStatisticFlatRow,
} from "@/common/saaob/client";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";
import { Badge } from "@/components/ui/badge";
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

import SaaobReadOnlyStatistics from "../../../../dashboard/saaob/saaob-read-only-statistics";

const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

function getUtc8Year() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
  }).format(new Date()));
}

function getUtc8Month() {
  return Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "numeric",
  }).format(new Date()));
}

type StatisticType = "budget" | "sum_per_sector";
type DialogMode = "add-group" | "add-item" | "edit" | "move" | null;

type MainSelectorNode = {
  id: string;
  name: string;
  children: MainSelectorNode[];
};

type SummarySelectorRow =
  | { kind: "group"; id: string; name: string; depth: number }
  | { kind: "item"; id: string; name: string; depth: number };

function flattenStatisticGroupsForSelect(
  nodes: Array<SaaobStatisticGroupResponse>,
  depth = 0,
  result: Array<{ id: string; name: string; depth: number }> = [],
): Array<{ id: string; name: string; depth: number }> {
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    const childGroups = node.children.filter((child): child is SaaobStatisticGroupResponse => "children" in child);
    flattenStatisticGroupsForSelect(childGroups, depth + 1, result);
  }
  return result;
}

function toMainSelectorTree(nodes: SaaobGroupResponse[]): MainSelectorNode[] {
  return nodes.map(node => ({
    id: node.id,
    name: node.name,
    children: toMainSelectorTree(node.children.filter((child): child is SaaobGroupResponse => "children" in child)),
  }));
}

function filterMainSelectorTree(nodes: MainSelectorNode[], query: string): MainSelectorNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const result: MainSelectorNode[] = [];
  for (const node of nodes) {
    const filteredChildren = filterMainSelectorTree(node.children, normalized);
    const matchesSelf = node.name.toLowerCase().includes(normalized);
    if (matchesSelf || filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }
  }
  return result;
}

function flattenMainSelectorRows(
  nodes: MainSelectorNode[],
  depth = 0,
  result: Array<{ id: string; name: string; depth: number }> = [],
): Array<{ id: string; name: string; depth: number }> {
  for (const node of nodes) {
    result.push({ id: node.id, name: node.name, depth });
    flattenMainSelectorRows(node.children, depth + 1, result);
  }
  return result;
}

function filterSummarySelectorTree(
  nodes: Array<SaaobSummaryGroupResponse | SaaobSummaryItemResponse>,
  query: string,
): Array<SaaobSummaryGroupResponse | SaaobSummaryItemResponse> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const result: Array<SaaobSummaryGroupResponse | SaaobSummaryItemResponse> = [];
  for (const node of nodes) {
    if ("children" in node) {
      const filteredChildren = filterSummarySelectorTree(node.children, normalized);
      const matchesSelf = node.name.toLowerCase().includes(normalized);
      if (matchesSelf || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
      continue;
    }

    if (node.name.toLowerCase().includes(normalized)) {
      result.push(node);
    }
  }
  return result;
}

function flattenSummarySelectorRows(
  nodes: Array<SaaobSummaryGroupResponse | SaaobSummaryItemResponse>,
  depth = 0,
  result: SummarySelectorRow[] = [],
): SummarySelectorRow[] {
  for (const node of nodes) {
    if ("children" in node) {
      result.push({ kind: "group", id: node.id, name: node.name, depth });
      flattenSummarySelectorRows(node.children, depth + 1, result);
      continue;
    }
    result.push({ kind: "item", id: node.id, name: node.name, depth });
  }
  return result;
}

function uniqueGroupOptionsById(
  options: Array<{ id: string; name: string; depth: number }>,
): Array<{ id: string; name: string; depth: number }> {
  const seen = new Set<string>();
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const option of options) {
    if (seen.has(option.id)) continue;
    seen.add(option.id);
    result.push(option);
  }
  return result;
}

async function parseApiError(response: Response): Promise<string> {
  const json = await response.json().catch(() => null);
  if (json && typeof json.message === "string") return json.message;
  return "Request failed.";
}

export default function Page() {
  const [year] = useState(() => getUtc8Year());
  const [month, setMonth] = useState(() => getUtc8Month());

  const [selectedBudgetRow, setSelectedBudgetRow] = useState<SaaobStatisticFlatRow | null>(null);
  const [selectedSummaryRow, setSelectedSummaryRow] = useState<SaaobStatisticFlatRow | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogType, setDialogType] = useState<StatisticType>("budget");
  const [dialogRow, setDialogRow] = useState<SaaobStatisticFlatRow | null>(null);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("root");
  const [moveParentId, setMoveParentId] = useState<string>("root");
  const [selectedMainGroupIds, setSelectedMainGroupIds] = useState<string[]>([]);
  const [selectedSummaryItemIds, setSelectedSummaryItemIds] = useState<string[]>([]);
  const [selectorSearchQuery, setSelectorSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data: budgetData,
    error: budgetError,
    isLoading: budgetLoading,
    mutate: mutateBudget,
  } = useSWR<BetterFetchResponse<SaaobStatisticsDataResponse, ApiResponseException>>(
    `/api/saaob/statistics/budget?year=${year}&month=${month}`,
    $fetch,
  );

  const {
    data: summaryData,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR<BetterFetchResponse<SaaobStatisticsDataResponse, ApiResponseException>>(
    `/api/saaob/statistics/summary-sector?year=${year}&month=${month}`,
    $fetch,
  );

  const {
    data: mainData,
    error: mainDataError,
    isLoading: mainDataLoading,
  } = useSWR<BetterFetchResponse<SaaobDataResponse, ApiResponseException>>(
    `/api/saaob?year=${year}&month=${month}`,
    $fetch,
  );

  const {
    data: summaryAccounts,
    error: summaryAccountsError,
    isLoading: summaryAccountsLoading,
  } = useSWR<BetterFetchResponse<SaaobSummaryDataResponse, ApiResponseException>>(
    `/api/saaob/accounts-summary?year=${year}&month=${month}`,
    $fetch,
  );

  if (budgetLoading || summaryLoading || mainDataLoading || summaryAccountsLoading) {
    return <Loading />;
  }

  if (
    budgetError || summaryError || mainDataError || summaryAccountsError
    || budgetData?.error || summaryData?.error || mainData?.error || summaryAccounts?.error
  ) {
    return <DeadHamster />;
  }

  const budgetTree = budgetData?.data?.data ?? [];
  const summaryTree = summaryData?.data?.data ?? [];

  const budgetGroups = collectSaaobStatisticGroups(budgetTree);
  const summaryGroups = collectSaaobStatisticGroups(summaryTree);

  const mainGroupTree = toMainSelectorTree(mainData?.data?.data ?? []);
  const summarySelectorTree = summaryAccounts?.data?.data ?? [];

  const groupOptions = dialogType === "budget" ? budgetGroups : summaryGroups;
  const flattenedGroupOptions = uniqueGroupOptionsById(flattenStatisticGroupsForSelect(groupOptions));

  const filteredMainGroupTree = filterMainSelectorTree(mainGroupTree, selectorSearchQuery);
  const filteredSummarySelectorTree = filterSummarySelectorTree(summarySelectorTree, selectorSearchQuery);
  const mainSelectorRows = flattenMainSelectorRows(filteredMainGroupTree);
  const summarySelectorRows = flattenSummarySelectorRows(filteredSummarySelectorTree);

  function openDialog(mode: Exclude<DialogMode, null>, type: StatisticType, row?: SaaobStatisticFlatRow | null) {
    setDialogMode(mode);
    setDialogType(type);
    setDialogRow(row ?? null);

    if (mode === "add-group") {
      setName("");
      setParentId("root");
      setSelectedMainGroupIds([]);
      setSelectedSummaryItemIds([]);
      setSelectorSearchQuery("");
      return;
    }

    if (mode === "add-item") {
      setName("");
      setParentId("root");
      setSelectedMainGroupIds([]);
      setSelectedSummaryItemIds([]);
      setSelectorSearchQuery("");
      return;
    }

    if (mode === "edit") {
      setName(row?.data.name ?? "");
      if (row?.kind === "item") {
        setSelectedMainGroupIds(row.data.selectedMainGroupIds ?? []);
        setSelectedSummaryItemIds(row.data.selectedSummaryItemIds ?? []);
      } else {
        setSelectedMainGroupIds([]);
        setSelectedSummaryItemIds([]);
      }
      setSelectorSearchQuery("");
      return;
    }

    if (mode === "move") {
      setMoveParentId(row?.data.parentId ?? "root");
    }
  }

  async function refreshActiveType(type: StatisticType) {
    if (type === "budget") {
      await mutateBudget();
      return;
    }
    await mutateSummary();
  }

  async function handleDelete(type: StatisticType) {
    const row = type === "budget" ? selectedBudgetRow : selectedSummaryRow;
    if (!row) return;

    const response = await fetch(`/api/saaob/statistics/${row.id}`, { method: "DELETE" });
    if (!response.ok) {
      alert(await parseApiError(response));
      return;
    }

    if (type === "budget") setSelectedBudgetRow(null);
    else setSelectedSummaryRow(null);

    await refreshActiveType(type);
  }

  async function handleSubmitDialog() {
    if (!dialogMode) return;

    setIsSubmitting(true);
    try {
      const endpointBase = dialogType === "budget"
        ? "/api/saaob/statistics/budget"
        : "/api/saaob/statistics/summary-sector";

      if (dialogMode === "add-group") {
        const response = await fetch(endpointBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            isGroup: true,
            parentId: parentId === "root" ? undefined : parentId,
          }),
        });
        if (!response.ok) {
          alert(await parseApiError(response));
          return;
        }
      }

      if (dialogMode === "add-item") {
        const response = await fetch(endpointBase, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            isGroup: false,
            parentId: parentId === "root" ? undefined : parentId,
            selectedMainGroupIds,
            selectedSummaryItemIds,
          }),
        });
        if (!response.ok) {
          alert(await parseApiError(response));
          return;
        }
      }

      if (dialogMode === "edit" && dialogRow) {
        const response = await fetch(`/api/saaob/statistics/${dialogRow.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            ...(dialogRow.kind === "item" ? { selectedMainGroupIds, selectedSummaryItemIds } : {}),
          }),
        });
        if (!response.ok) {
          alert(await parseApiError(response));
          return;
        }
      }

      if (dialogMode === "move" && dialogRow) {
        const response = await fetch(`/api/saaob/statistics/${dialogRow.id}/move`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parentId: moveParentId === "root" ? null : moveParentId,
          }),
        });
        if (!response.ok) {
          alert(await parseApiError(response));
          return;
        }
      }

      setDialogMode(null);
      await refreshActiveType(dialogType);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-4 pt-0 w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Typography variant="h3">Statistics</Typography>
        <div className="flex items-center gap-2">
          <Typography variant="muted">Month</Typography>
          <Select value={String(month)} onValueChange={value => setMonth(Number(value))}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Typography variant="h4">Summary per Sector</Typography>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openDialog("add-group", "sum_per_sector")}>
              <Plus className="size-4" /> Group
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDialog("add-item", "sum_per_sector")}>
              <Plus className="size-4" /> Item
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!selectedSummaryRow}
              onClick={() => openDialog("edit", "sum_per_sector", selectedSummaryRow)}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!selectedSummaryRow}
              onClick={() => openDialog("move", "sum_per_sector", selectedSummaryRow)}
            >
              <Shuffle />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!selectedSummaryRow}
              className="text-destructive"
              onClick={() => handleDelete("sum_per_sector")}
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        {selectedSummaryRow && (
          <Badge variant="secondary" className="w-fit">
            Selected: {selectedSummaryRow.data.name}
          </Badge>
        )}

        <SaaobReadOnlyStatistics
          data={summaryTree}
          selectedRowId={selectedSummaryRow?.id}
          onRowClick={row => setSelectedSummaryRow((prev: SaaobStatisticFlatRow | null) => (prev?.id === row.id ? null : row))}
          onRowDoubleClick={row => openDialog("edit", "sum_per_sector", row)}
        />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Typography variant="h4">Budget Statistics</Typography>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openDialog("add-group", "budget")}>
              <Plus className="size-4" /> Group
            </Button>
            <Button variant="outline" size="sm" onClick={() => openDialog("add-item", "budget")}>
              <Plus className="size-4" /> Item
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!selectedBudgetRow}
              onClick={() => openDialog("edit", "budget", selectedBudgetRow)}
            >
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!selectedBudgetRow}
              onClick={() => openDialog("move", "budget", selectedBudgetRow)}
            >
              <Shuffle />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!selectedBudgetRow}
              className="text-destructive"
              onClick={() => handleDelete("budget")}
            >
              <Trash2 />
            </Button>
          </div>
        </div>

        {selectedBudgetRow && (
          <Badge variant="secondary" className="w-fit">
            Selected: {selectedBudgetRow.data.name}
          </Badge>
        )}

        <SaaobReadOnlyStatistics
          data={budgetTree}
          selectedRowId={selectedBudgetRow?.id}
          onRowClick={row => setSelectedBudgetRow((prev: SaaobStatisticFlatRow | null) => (prev?.id === row.id ? null : row))}
          onRowDoubleClick={row => openDialog("edit", "budget", row)}
        />
      </section>

      <Dialog open={dialogMode !== null} onOpenChange={open => !open && setDialogMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {
                dialogMode === "add-group" ? "Add Group"
                  : dialogMode === "add-item" ? "Add Item"
                    : dialogMode === "move" ? "Move Entry"
                      : "Edit Entry"
              }
            </DialogTitle>
            <DialogDescription>
              {dialogType === "budget" ? "Budget statistics" : "Summary per Sector statistics"}
            </DialogDescription>
          </DialogHeader>

          {(dialogMode === "add-group" || dialogMode === "add-item" || dialogMode === "edit") && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={name} onChange={event => setName(event.target.value)} />
              </div>

              {(dialogMode === "add-group" || dialogMode === "add-item") && (
                <div className="space-y-1">
                  <Label>Parent</Label>
                  <Select value={parentId} onValueChange={setParentId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="root">Root</SelectItem>
                      {flattenedGroupOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>
                          {`${"\u00A0\u00A0".repeat(option.depth)}${option.name}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {((dialogMode === "add-item") || (dialogMode === "edit" && dialogRow?.kind === "item")) && (
                <div className="space-y-2">
                  <Label>Selected References</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={selectorSearchQuery}
                      onChange={event => setSelectorSearchQuery(event.target.value)}
                      className="pl-7"
                      placeholder="Search references..."
                    />
                  </div>
                  <ScrollArea className="h-44 rounded border p-2">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Typography variant="small" className="font-semibold">
                          Main Data Groups
                        </Typography>
                        {mainSelectorRows.length === 0 ? (
                          <Typography variant="muted" className="text-xs">No matching main groups.</Typography>
                        ) : (
                          <div className="space-y-1">
                            {mainSelectorRows.map(option => (
                              <label key={`main-${option.id}`} className="flex items-center gap-2 text-sm">
                                <Checkbox
                                  checked={selectedMainGroupIds.includes(option.id)}
                                  onCheckedChange={checked => {
                                    setSelectedMainGroupIds(prev => {
                                      if (checked) return [...prev, option.id];
                                      return prev.filter(id => id !== option.id);
                                    });
                                  }}
                                />
                                <span style={{ paddingLeft: `${option.depth * 12}px` }} className="font-medium">
                                  {option.name}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Typography variant="small" className="font-semibold">
                          Summary of Accounts
                        </Typography>
                        {summarySelectorRows.length === 0 ? (
                          <Typography variant="muted" className="text-xs">No matching summary entries.</Typography>
                        ) : (
                          <div className="space-y-1">
                            {summarySelectorRows.map(option => {
                              if (option.kind === "group") {
                                return (
                                  <div
                                    key={`summary-group-${option.id}`}
                                    className="text-xs text-muted-foreground font-semibold"
                                    style={{ paddingLeft: `${option.depth * 12}px` }}
                                  >
                                    {option.name}
                                  </div>
                                );
                              }

                              return (
                                <label key={`summary-item-${option.id}`} className="flex items-center gap-2 text-sm">
                                  <Checkbox
                                    checked={selectedSummaryItemIds.includes(option.id)}
                                    onCheckedChange={checked => {
                                      setSelectedSummaryItemIds(prev => {
                                        if (checked) return [...prev, option.id];
                                        return prev.filter(id => id !== option.id);
                                      });
                                    }}
                                  />
                                  <span style={{ paddingLeft: `${option.depth * 12}px` }}>
                                    {option.name}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {dialogMode === "move" && (
            <div className="space-y-1">
              <Label>New Parent</Label>
              <Select value={moveParentId} onValueChange={setMoveParentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Root</SelectItem>
                  {flattenedGroupOptions
                    .filter(option => option.id !== dialogRow?.id)
                    .map(option => (
                      <SelectItem key={option.id} value={option.id}>
                        {`${"\u00A0\u00A0".repeat(option.depth)}${option.name}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode(null)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmitDialog} disabled={isSubmitting || !name.trim() && dialogMode !== "move"}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
