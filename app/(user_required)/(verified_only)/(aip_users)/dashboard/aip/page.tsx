"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronRight, File, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  AipListResponse,
  AipNodeResponse,
  AipReferenceResponse,
  AipReferenceSingleResponse,
  ApiResponseException,
  BetterFetchResponse,
} from "@/lib/http/client/responses";
import { cn } from "@/lib/utils";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import { AipFormDialog } from "@/app/(user_required)/(verified_only)/(aip_users)/dashboard/aip/aip-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type EntryType = "group" | "item";

type FlatTree = {
  nodeMap: Map<string, AipNodeResponse>;
  groupList: AipNodeResponse[];
};

type VisibleRow = {
  node: AipNodeResponse;
  depth: number;
};

const monthNames = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const moneyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function toAmount(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

function formatMonth(value: number | null): string {
  if (!value || value < 1 || value > 12) return "-";
  return monthNames[value] ?? "-";
}

function flattenVisibleRows(
  nodes: AipNodeResponse[],
  expandedIds: Set<string>,
  depth = 0,
): VisibleRow[] {
  const rows: VisibleRow[] = [];

  for (const node of nodes) {
    rows.push({ node, depth });

    if (node.type === "group" && expandedIds.has(node.id) && node.children.length > 0) {
      rows.push(...flattenVisibleRows(node.children, expandedIds, depth + 1));
    }
  }

  return rows;
}

export default function Page() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    BetterFetchResponse<AipListResponse, ApiResponseException>
  >("/api/aip", $fetch);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addGroupKey, setAddGroupKey] = useState(0);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemKey, setAddItemKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  const [deleteBusy, setDeleteBusy] = useState(false);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveParentId, setMoveParentId] = useState<string>("");
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const roots = useMemo(() => data?.data?.data ?? [], [data]);
  const visibleRows = useMemo(
    () => flattenVisibleRows(roots, expandedIds),
    [roots, expandedIds],
  );

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 52,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0
    ? totalSize - virtualRows[virtualRows.length - 1].end
    : 0;

  const flatTree = useMemo<FlatTree>(() => {
    const nodeMap = new Map<string, AipNodeResponse>();
    const groupList: AipNodeResponse[] = [];

    const visit = (node: AipNodeResponse) => {
      nodeMap.set(node.id, node);
      if (node.type === "group") {
        groupList.push(node);
      }
      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of roots) {
      visit(node);
    }

    return { nodeMap, groupList };
  }, [roots]);

  const selectedNode = selectedId ? flatTree.nodeMap.get(selectedId) ?? null : null;
  const selectedGroup = selectedNode?.type === "group" ? selectedNode : null;

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleChecked = (id: string, checked: boolean) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const isDescendant = (groupId: string, targetId: string): boolean => {
    const group = flatTree.nodeMap.get(groupId);
    if (!group) return false;

    const stack = [...group.children];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current.id === targetId) return true;
      if (current.children.length > 0) {
        stack.push(...current.children);
      }
    }

    return false;
  };

  const refreshAfterMutation = async () => {
    await mutate();
  };

  const handleDelete = async () => {
    if (!selectedNode || deleteBusy) return;

    if (selectedNode.type === "group" && selectedNode.children.length > 0) {
      alert("Cannot delete this group while it still has nested groups/items.");
      return;
    }

    const confirmed = confirm(
      `Delete this ${selectedNode.type}? This action cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleteBusy(true);

    const endpoint = selectedNode.type === "group"
      ? `/api/aip/groups/${selectedNode.id}`
      : `/api/aip/items/${selectedNode.id}`;

    const response = await $fetch<unknown, ApiResponseException>(endpoint, {
      method: "DELETE",
    });

    setDeleteBusy(false);

    if (response.error) {
      alert(response.error.message ?? `Failed to delete ${selectedNode.type}.`);
      return;
    }

    setCheckedIds(prev => {
      const next = new Set(prev);
      next.delete(selectedNode.id);
      return next;
    });
    setSelectedId(null);
    await refreshAfterMutation();
  };

  const handleConvert = async (item: AipReferenceResponse, targetType: EntryType) => {
    if (item.type === "group" && targetType === "item") {
      const current = flatTree.nodeMap.get(item.id);
      if (current && current.children.length > 0) {
        alert("Cannot convert a group with children into an item. Move or delete children first.");
        return;
      }
    }

    const response = await $fetch<AipReferenceSingleResponse, ApiResponseException>("/api/aip/convert", {
      method: "POST",
      body: {
        id: item.id,
        targetType,
      },
    });

    if (response.error) {
      alert(response.error.message ?? "Failed to convert AIP reference.");
      return;
    }

    await refreshAfterMutation();
    setEditOpen(false);
  };

  const handleMove = async () => {
    if (moveBusy) return;

    if (!moveParentId) {
      alert("Select a target group first.");
      return;
    }

    const ids = [...checkedIds];
    if (ids.length === 0) {
      alert("Select at least one group/item to move.");
      return;
    }

    const validIds: string[] = [];
    const skippedIds: string[] = [];

    for (const id of ids) {
      const node = flatTree.nodeMap.get(id);
      if (!node) {
        skippedIds.push(id);
        continue;
      }

      if (id === moveParentId) {
        skippedIds.push(id);
        continue;
      }

      if (node.type === "group" && isDescendant(node.id, moveParentId)) {
        skippedIds.push(id);
        continue;
      }

      validIds.push(id);
    }

    if (validIds.length === 0) {
      alert("No valid selections to move. Invalid targets were skipped.");
      return;
    }

    setMoveBusy(true);

    const response = await $fetch<unknown, ApiResponseException>("/api/aip/move", {
      method: "POST",
      body: {
        ids: validIds,
        parentId: moveParentId,
      },
    });

    setMoveBusy(false);

    if (response.error) {
      alert(response.error.message ?? "Failed to move selected entries.");
      return;
    }

    setCheckedIds(new Set());
    await refreshAfterMutation();

    if (skippedIds.length > 0) {
      alert(`Moved ${validIds.length} entr${validIds.length === 1 ? "y" : "ies"}. Skipped ${skippedIds.length} invalid entr${skippedIds.length === 1 ? "y" : "ies"}.`);
    }
  };

  const handleCreateOrUpdateSuccess = async (saved: AipReferenceResponse) => {
    if (saved.parentId) {
      setExpandedIds(prev => {
        const next = new Set(prev);
        next.add(saved.parentId!);
        if (saved.type === "group") {
          next.add(saved.id);
        }
        return next;
      });
    }

    setSelectedId(saved.id);
    await refreshAfterMutation();

    requestAnimationFrame(() => {
      const row = document.getElementById(`aip-row-${saved.id}`);
      if (!row) return;

      row.focus();
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-3 p-4 pt-0 w-full">
      <div className="flex flex-wrap gap-2 p-2 border rounded-lg w-full items-center">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add Group"
          title="Add group"
          onClick={() => {
            setAddGroupKey(k => k + 1);
            setAddGroupOpen(true);
          }}
        >
          <Plus />
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add Item"
          title="Add item under selected group"
          disabled={!selectedGroup}
          onClick={() => {
            setAddItemKey(k => k + 1);
            setAddItemOpen(true);
          }}
        >
          <File />
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          title="Edit selected"
          disabled={!selectedNode}
          onClick={() => setEditOpen(true)}
        >
          <Pencil />
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete"
          title="Delete selected"
          disabled={!selectedNode || deleteBusy}
          onClick={handleDelete}
        >
          <Trash2 />
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Select value={moveParentId || "__none__"} onValueChange={v => setMoveParentId(v === "__none__" ? "" : v)}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select target group for move" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select target group...</SelectItem>
              {flatTree.groupList.map(group => (
                <SelectItem key={group.id} value={group.id}>
                  {group.aipReferenceCode} - {group.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            disabled={checkedIds.size === 0 || !moveParentId || moveBusy}
            onClick={handleMove}
          >
            {moveBusy ? "Moving..." : `Move Selected (${checkedIds.size})`}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-2">
        {isValidating ? (
          <div className="px-2 py-1 text-xs text-muted-foreground">Refreshing...</div>
        ) : null}

        {roots.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No AIP references found.
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="[&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead rowSpan={2} className="min-w-8"></TableHead>
                  <TableHead rowSpan={2} className="min-w-64">AIP Reference Code</TableHead>
                  <TableHead rowSpan={2} className="min-w-80">Program/Project/Activity Description</TableHead>
                  <TableHead rowSpan={2} className="min-w-56">Implementing Office</TableHead>
                  <TableHead colSpan={2} className="text-center">Schedule of Implementation</TableHead>
                  <TableHead rowSpan={2} className="min-w-72">Expected Outputs</TableHead>
                  <TableHead rowSpan={2} className="min-w-56">Funding Source</TableHead>
                  <TableHead colSpan={4} className="text-center">Amount</TableHead>
                  <TableHead colSpan={4} className="text-center">Amount In Thousands</TableHead>
                  <TableHead colSpan={2} className="text-center">Amount of Climate Change PPAs</TableHead>
                  <TableHead rowSpan={2} className="min-w-48">CC Topology Code</TableHead>
                  <TableHead rowSpan={2} className="min-w-24">Gadable</TableHead>
                  <TableHead rowSpan={2} className="min-w-40">GAD Amount</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="text-center">Start</TableHead>
                  <TableHead className="text-center">Completion</TableHead>
                  <TableHead className="text-right">PS</TableHead>
                  <TableHead className="text-right">MOOE</TableHead>
                  <TableHead className="text-right">CO</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">PS</TableHead>
                  <TableHead className="text-right">MOOE</TableHead>
                  <TableHead className="text-right">CO</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Climate Change Adaption</TableHead>
                  <TableHead className="text-right">Climate Change Mitigation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 ? (
                  <TableRow>
                    <TableCell colSpan={21} style={{ height: `${paddingTop}px` }} />
                  </TableRow>
                ) : null}

                {virtualRows.map(virtualRow => {
                  const { node, depth } = visibleRows[virtualRow.index]!;
                  const isGroup = node.type === "group";
                  const isExpanded = isGroup && expandedIds.has(node.id);
                  const isSelected = selectedId === node.id;
                  const isChecked = checkedIds.has(node.id);

                  const amountPS = toAmount(node.amountPS);
                  const amountMOOE = toAmount(node.amountMOOE);
                  const amountCO = toAmount(node.amountCO);
                  const amountTotal = amountPS + amountMOOE + amountCO;
                  const amountCCAdapt = toAmount(node.amountCCAdapt);
                  const amountCCMitigate = toAmount(node.amountCCMitigate);
                  const gadAmount = toAmount(node.gadAmount);

                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      id={`aip-row-${node.id}`}
                      key={node.id}
                      data-index={virtualRow.index}
                      data-state={isSelected ? "selected" : undefined}
                      className={cn("cursor-pointer", isSelected ? "bg-accent" : undefined)}
                      onClick={() => setSelectedId(node.id)}
                      tabIndex={0}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isChecked}
                          onClick={e => e.stopPropagation()}
                          onCheckedChange={checked => toggleChecked(node.id, checked === true)}
                          aria-label={`Select ${node.type}`}
                        />
                      </TableCell>

                      <TableCell>
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingLeft: `${depth * 16}px` }}
                        >
                          {isGroup ? (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center"
                              onClick={e => {
                                e.stopPropagation();
                                toggleExpanded(node.id);
                              }}
                              aria-label={isExpanded ? "Collapse group" : "Expand group"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block size-4" />
                          )}

                          {isGroup ? <Folder className="size-4" /> : <File className="size-4" />}
                          <span className="whitespace-normal break-words">{node.aipReferenceCode}</span>
                        </div>
                      </TableCell>

                      <TableCell className="whitespace-normal break-words">{node.description}</TableCell>
                      <TableCell className="whitespace-normal break-words">{node.implementingOffice ?? "-"}</TableCell>
                      <TableCell className="text-center">{formatMonth(node.implementationStart)}</TableCell>
                      <TableCell className="text-center">{formatMonth(node.implementationCompletion)}</TableCell>
                      <TableCell className="whitespace-normal break-words">{node.expectedOutputs ?? "-"}</TableCell>
                      <TableCell className="whitespace-normal break-words">{node.fundingSource ?? "-"}</TableCell>

                      <TableCell className="text-right">{formatMoney(amountPS)}</TableCell>
                      <TableCell className="text-right">{formatMoney(amountMOOE)}</TableCell>
                      <TableCell className="text-right">{formatMoney(amountCO)}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(amountTotal)}</TableCell>

                      <TableCell className="text-right">{formatMoney(amountPS / 1000)}</TableCell>
                      <TableCell className="text-right">{formatMoney(amountMOOE / 1000)}</TableCell>
                      <TableCell className="text-right">{formatMoney(amountCO / 1000)}</TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(amountTotal / 1000)}</TableCell>

                      <TableCell className="text-right">{formatMoney(amountCCAdapt)}</TableCell>
                      <TableCell className="text-right">{formatMoney(amountCCMitigate)}</TableCell>
                      <TableCell>{node.ccTopologyCode ?? "-"}</TableCell>
                      <TableCell>{node.gadable ? "Yes" : "No"}</TableCell>
                      <TableCell className="text-right">{formatMoney(gadAmount)}</TableCell>
                    </TableRow>
                  );
                })}

                {paddingBottom > 0 ? (
                  <TableRow>
                    <TableCell colSpan={21} style={{ height: `${paddingBottom}px` }} />
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AipFormDialog
        key={`add-group-${addGroupKey}`}
        mode="add"
        entryType="group"
        open={addGroupOpen}
        onOpenChange={setAddGroupOpen}
        onSuccess={handleCreateOrUpdateSuccess}
        parentGroupId={selectedGroup?.id}
      />

      <AipFormDialog
        key={`add-item-${addItemKey}`}
        mode="add"
        entryType="item"
        open={addItemOpen}
        onOpenChange={setAddItemOpen}
        onSuccess={handleCreateOrUpdateSuccess}
        parentGroupId={selectedGroup?.id}
      />

      <AipFormDialog
        key={selectedNode?.id ?? "aip-edit-empty"}
        mode="edit"
        entryType={selectedNode?.type ?? "group"}
        editItem={selectedNode ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={handleCreateOrUpdateSuccess}
        onConvert={handleConvert}
      />
    </div>
  );
}
