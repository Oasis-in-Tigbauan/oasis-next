"use client";

import React, { useCallback, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  isSaaobDataGroup,
  type ApiResponseException,
  type BetterFetchResponse,
  type SaaobDataResponse,
  type SaaobSummaryDataResponse,
  type SaaobSummaryGroupResponse,
  type SaaobSummaryItemResponse,
} from "@/lib/http/client/responses";
import {
  collectSaaobSummaryGroups,
  filterSaaobSummaryTreeByQuery,
  flattenSaaobSummaryVisible,
  type SaaobSummaryFlatRow,
  type SaaobTreeNode,
} from "@/lib/saaob/client";
import {
  SaaobPageAggregateRow,
  SaaobPageGroupRow,
  SaaobPageSpacerRow,
  SaaobPageTableHeader,
  useSaaobColumnVisibility,
} from "@/lib/saaob/page-table";

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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableHeader,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";
import { ColumnVisibilityPicker } from "@/components/column-visibility-picker";

const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

type DialogMode = "add-group" | "edit-group" | "add-item" | "edit-item" | null;

export default function Page() {
  const [currentYear] = useState(() => _getUtc8Year());
  const [selectedMonth, setSelectedMonth] = useState(() => _getUtc8Month());

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<BetterFetchResponse<SaaobSummaryDataResponse, ApiResponseException>>(
    `/api/saaob/accounts-summary?year=${currentYear}&month=${selectedMonth}`,
    $fetch,
  );

  const { data: saaobData } = useSWR<BetterFetchResponse<SaaobDataResponse, ApiResponseException>>(
    `/api/saaob?year=${currentYear}&month=${selectedMonth}`,
    $fetch,
  );

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<SaaobSummaryFlatRow | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const columnVisibility = useSaaobColumnVisibility("accounts-summary");

  const tree = useMemo(() => data?.data?.data ?? [], [data]);
  const saaobRawTree = useMemo<SaaobTreeNode[]>(
    () => (saaobData?.data?.data ?? []) as SaaobTreeNode[],
    [saaobData],
  );

  const allSummaryGroups = useMemo(() => collectSaaobSummaryGroups(tree), [tree]);

  const filteredTree = useMemo(
    () => filterSaaobSummaryTreeByQuery(tree, searchQuery),
    [tree, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenSaaobSummaryVisible(filteredTree, collapsed, 0, searchQuery.trim().length > 0),
    [filteredTree, collapsed, searchQuery],
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

  const selectedItemRow = selectedRow?.kind === "item" ? selectedRow : null;
  const selectedGroup = selectedRow?.kind === "group" ? selectedRow.data : null;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((row: SaaobSummaryFlatRow) => {
    setSelectedRow(prev => (prev?.id === row.id ? null : row));
  }, []);

  const handleRowDoubleClick = useCallback((row: SaaobSummaryFlatRow) => {
    setSelectedRow(row);
    setDialogMode(row.kind === "group" ? "edit-group" : "edit-item");
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;

    const label = selectedRow.kind === "group"
      ? `group "${selectedRow.data.name}"`
      : `item "${selectedRow.data.name}"`;

    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    const url = selectedRow.kind === "group"
      ? `/api/saaob/accounts-summary/groups/${selectedRow.id}`
      : `/api/saaob/accounts-summary/items/${selectedRow.id}`;

    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      alert(payload?.message ?? "Failed to delete. Please try again.");
      return;
    }

    setSelectedRow(null);
    setDialogMode(null);
    mutate();
  }, [selectedRow, mutate]);

  const closeDialog = useCallback(() => setDialogMode(null), []);
  const onSuccess = useCallback(() => {
    mutate();
    closeDialog();
  }, [mutate, closeDialog]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search summary data..."
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
          disabled={allSummaryGroups.length === 0}
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
              ? `Group: ${selectedRow.data.name}`
              : `Item: ${selectedRow.data.name}`}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <ColumnVisibilityPicker
            groups={columnVisibility.pickerGroups}
            selected={columnVisibility.visibleKeys}
            selectedToggleableCount={columnVisibility.selectedToggleableCount}
            totalToggleableCount={columnVisibility.totalToggleableCount}
            onToggle={columnVisibility.toggle}
            onSelectAll={columnVisibility.selectAll}
            onDeselectAll={columnVisibility.deselectAll}
          />
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            disabled={selectedMonth === 1}
            onClick={() => setSelectedMonth(m => m - 1)}
          >
            <ChevronLeft />
          </Button>

          <Select
            value={String(selectedMonth)}
            onValueChange={v => setSelectedMonth(Number(v))}
          >
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            disabled={selectedMonth === 12}
            onClick={() => setSelectedMonth(m => m + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No Summary of Accounts records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <SaaobPageTableHeader visibleColumns={columnVisibility.orderedVisible} />
              </TableHeader>

              <TableBody>
                {paddingTop > 0 && (
                  <SaaobPageSpacerRow visibleCount={columnVisibility.visibleCount} height={paddingTop} />
                )}

                {virtualRows.map(virtualRow => {
                  const row = flatRows[virtualRow.index]!;

                  if (row.kind === "group") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    const isSelected = selectedRow?.id === row.id;

                    return (
                      <SaaobPageGroupRow
                        key={row.id}
                        visibleColumns={columnVisibility.orderedVisible}
                        visibleCount={columnVisibility.visibleCount}
                        name={row.data.name}
                        depth={row.depth}
                        isCollapsed={isCollapsed}
                        isSelected={isSelected}
                        onToggleCollapse={() => toggleCollapse(row.id)}
                        onClick={() => handleRowClick(row)}
                        onDoubleClick={() => handleRowDoubleClick(row)}
                        measureRef={rowVirtualizer.measureElement}
                        dataIndex={virtualRow.index}
                      />
                    );
                  }

                  const item = row.data;
                  const isSelected = selectedRow?.id === row.id;

                  return (
                    <SaaobPageAggregateRow
                      key={row.id}
                      visibleColumns={columnVisibility.orderedVisible}
                      data={item}
                      name={item.name}
                      depth={row.depth}
                      blankAccountAndRemarks
                      rowClassName={
                        isSelected
                          ? "bg-accent cursor-pointer"
                          : virtualRow.index % 2 === 1
                            ? "bg-muted hover:bg-muted/50 cursor-pointer"
                            : "cursor-pointer"
                      }
                      measureRef={rowVirtualizer.measureElement}
                      dataIndex={virtualRow.index}
                      onClick={() => handleRowClick(row)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    />
                  );
                })}

                {paddingBottom > 0 && (
                  <SaaobPageSpacerRow visibleCount={columnVisibility.visibleCount} height={paddingBottom} />
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dialogMode === "add-group" && (
        <SummaryGroupFormDialog
          mode="add"
          allGroups={allSummaryGroups}
          defaultParentId={selectedGroup?.id}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "edit-group" && selectedGroup && (
        <SummaryGroupFormDialog
          mode="edit"
          editGroup={selectedGroup}
          allGroups={allSummaryGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "add-item" && (
        <SummaryItemFormDialog
          mode="add"
          allSummaryGroups={allSummaryGroups}
          saaobRawTree={saaobRawTree}
          defaultParentGroupId={selectedGroup?.id ?? allSummaryGroups[0]?.id ?? ""}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "edit-item" && selectedItemRow && (
        <SummaryItemFormDialog
          mode="edit"
          editItem={selectedItemRow.data}
          allSummaryGroups={allSummaryGroups}
          saaobRawTree={saaobRawTree}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function SummaryGroupFormDialog({
  mode,
  editGroup,
  allGroups,
  defaultParentId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editGroup?: SaaobSummaryGroupResponse;
  allGroups: SaaobSummaryGroupResponse[];
  defaultParentId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [name, setName] = useState(editGroup?.name ?? "");
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) {
      setActionError("Group name is required.");
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (mode === "add" && parentId) {
        body.parentId = parentId;
      }

      const response = await fetch(
        mode === "add"
          ? "/api/saaob/accounts-summary/groups"
          : `/api/saaob/accounts-summary/groups/${editGroup!.id}`,
        {
          method: mode === "add" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save group. Please try again.");
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
            {mode === "add"
              ? "Create a new Summary of Accounts group."
              : `Editing group: ${editGroup?.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-name`}>Group Name *</Label>
            <Input
              id={`${baseId}-name`}
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={submitting}
              placeholder="Group name"
            />
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
                  {allGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving..." : mode === "add" ? "Create Group" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function renderSaaobGroupTree(
  nodes: SaaobTreeNode[],
  depth: number,
  selectedGroupIds: Set<string>,
  toggleGroup: (id: string) => void,
  submitting: boolean,
): React.ReactNode {
  return nodes.map(node => {
    if (!isSaaobDataGroup(node)) return null;
    return (
      <div key={node.id}>
        <label
          className="flex items-center gap-2 rounded px-1 py-1.5 hover:bg-accent cursor-pointer select-none"
          style={{ paddingLeft: `${0.25 + depth * 1.25}rem` }}
        >
          <Checkbox
            checked={selectedGroupIds.has(node.id)}
            onCheckedChange={() => toggleGroup(node.id)}
            disabled={submitting}
          />
          <span className="text-sm">{node.name}</span>
        </label>
        {node.children.length > 0 && renderSaaobGroupTree(
          node.children,
          depth + 1,
          selectedGroupIds,
          toggleGroup,
          submitting,
        )}
      </div>
    );
  });
}

function SummaryItemFormDialog({
  mode,
  editItem,
  allSummaryGroups,
  saaobRawTree,
  defaultParentGroupId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editItem?: SaaobSummaryItemResponse;
  allSummaryGroups: SaaobSummaryGroupResponse[];
  saaobRawTree: SaaobTreeNode[];
  defaultParentGroupId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [name, setName] = useState(editItem?.name ?? "");
  const [parentGroupId, setParentGroupId] = useState(defaultParentGroupId ?? "");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    new Set(editItem?.linkedGroupIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleGroup = useCallback((id: string) => {
    setSelectedGroupIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSave = async () => {
    if (submitting) return;

    if (!name.trim()) {
      setActionError("Name is required.");
      return;
    }

    if (mode === "add" && !parentGroupId) {
      setActionError("Please select a parent group.");
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const linkedGroupIds = [...selectedGroupIds];

      let response: Response;
      if (mode === "add") {
        response = await fetch("/api/saaob/accounts-summary/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), parentGroupId, linkedGroupIds }),
        });
      } else {
        response = await fetch(`/api/saaob/accounts-summary/items/${editItem!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), linkedGroupIds }),
        });
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save item. Please try again.");
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
      <DialogContent className="max-h-[90vh] min-w-[52rem]">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Item" : "Edit Item"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Create a new Summary of Accounts item."
              : `Editing item: ${editItem?.name}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            {mode === "add" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-parent`}>Parent Group *</Label>
                <Select
                  value={parentGroupId}
                  onValueChange={setParentGroupId}
                  disabled={submitting}
                >
                  <SelectTrigger id={`${baseId}-parent`}>
                    <SelectValue placeholder="Select a group..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allSummaryGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-name`}>Name *</Label>
              <Input
                id={`${baseId}-name`}
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={submitting}
                placeholder="Summary item name"
              />
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <Label>Linked SAAOB Groups</Label>
              <p className="text-xs text-muted-foreground">
                Select the SAAOB groups whose entries will be aggregated into this summary item.
              </p>

              {saaobRawTree.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No SAAOB groups available.</p>
              ) : (
                <ScrollArea className="h-52 rounded-md border p-2">
                  <div className="flex flex-col gap-0.5">
                    {renderSaaobGroupTree(saaobRawTree, 0, selectedGroupIds, toggleGroup, submitting)}
                  </div>
                </ScrollArea>
              )}

              {selectedGroupIds.size > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedGroupIds.size} group{selectedGroupIds.size !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving..." : mode === "add" ? "Create Item" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function _getUtc8Year(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

function _getUtc8Month(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCMonth() + 1;
}
