"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, ChevronLeft, ChevronRight, Download, FileSpreadsheet, MoveRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  ExpenseClassListResponse,
  OfficesListResponse,
  SaaobDataResponse,
  SaaobEntryResponse,
  SaaobGroupResponse,
} from "@/lib/http/client/responses";
import {
  collectSaaobGroups,
  filterSaaobTreeByQuery,
  flattenSaaobVisible,
  fmtAmount,
  fmtPercent,
  type SaaobFlatRow,
  txt,
} from "@/lib/saaob/client";

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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";
import { ManageTemplatesDialog } from "@/app/(user_required)/(verified_only)/(saaob_group)/manage-templates-dialog";
import { ExportDialog } from "@/app/(user_required)/(verified_only)/(saaob_group)/export-dialog";

const TOTAL_COLS = 23;

const MONTH_NAMES = [
  "January", "February", "March", "April",
  "May", "June", "July", "August",
  "September", "October", "November", "December",
];

type DialogMode = "add-group" | "edit-group" | "add-entry" | "edit-entry" | "move-entry" | "move-group" | null;
type ExpenseClassOption = ExpenseClassListResponse["data"][number];
type OfficeOption = OfficesListResponse["data"][number];
type SelectedEntryRow = Extract<SaaobFlatRow, { kind: "entry" }>;
type SelectedGroupRow = Extract<SaaobFlatRow, { kind: "group" }>;

export default function Page() {
  const [currentYear] = useState(() => _getUtc8Year());
  const [selectedMonth, setSelectedMonth] = useState(() => _getUtc8Month());

  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<BetterFetchResponse<SaaobDataResponse, ApiResponseException>>(
    `/api/saaob?year=${currentYear}&month=${selectedMonth}`,
    $fetch,
  );

  const { data: expenseClassesData } = useSWR<
    BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>
  >("/api/management/data/expense-classes", $fetch);

  const { data: officesData } = useSWR<
    BetterFetchResponse<OfficesListResponse, ApiResponseException>
  >("/api/saaob/offices", $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<SaaobFlatRow | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data]);
  const expenseClasses = useMemo(() => expenseClassesData?.data?.data ?? [], [expenseClassesData]);
  const offices = useMemo(() => officesData?.data?.data ?? [], [officesData]);

  const allGroups = useMemo(() => collectSaaobGroups(tree), [tree]);

  const filteredTree = useMemo(
    () => filterSaaobTreeByQuery(tree, searchQuery),
    [tree, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenSaaobVisible(filteredTree, collapsed, 0, searchQuery.trim().length > 0),
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

  const selectedEntryRow = selectedRow?.kind === "entry" ? selectedRow : null;
  const selectedGroupRow = selectedRow?.kind === "group" ? selectedRow : null;
  const selectedGroup = selectedRow?.kind === "group" ? selectedRow.data : null;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((row: SaaobFlatRow) => {
    if (row.kind === "total") return;
    setSelectedRow(prev => (prev?.id === row.id ? null : row));
  }, []);

  const handleRowDoubleClick = useCallback((row: SaaobFlatRow) => {
    if (row.kind === "total") return;
    setSelectedRow(row);
    setDialogMode(row.kind === "group" ? "edit-group" : "edit-entry");
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;

    if (selectedRow.kind === "total") return;

    const label = selectedRow.kind === "group"
      ? `group \"${selectedRow.data.name}\"`
      : `entry \"${selectedRow.data.name}\"`;

    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;

    const url = selectedRow.kind === "group"
      ? `/api/saaob/groups/${selectedRow.id}`
      : `/api/saaob/entries/${selectedRow.id}`;

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
            placeholder="Search SAAOB data..."
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
          disabled={allGroups.length === 0}
          onClick={() => setDialogMode("add-entry")}
        >
          <Plus className="size-3" />
          Entry
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          title="Edit selected"
          disabled={!selectedRow}
          onClick={() => {
            if (!selectedRow) return;
            setDialogMode(selectedRow.kind === "group" ? "edit-group" : "edit-entry");
          }}
        >
          <Pencil />
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!selectedEntryRow}
          onClick={() => {
            if (!selectedEntryRow) return;
            setDialogMode("move-entry");
          }}
        >
          <MoveRight className="size-3" />
          Move Entry
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!selectedGroupRow}
          onClick={() => {
            if (!selectedGroupRow) return;
            setDialogMode("move-group");
          }}
        >
          <MoveRight className="size-3" />
          Move Group
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

        {selectedRow && selectedRow.kind !== "total" && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {selectedRow.kind === "group"
              ? `Group: ${selectedRow.data.name}`
              : `Entry: ${selectedRow.data.name}`}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExportOpen(true)}
          >
            <Download className="size-3" />
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setManageTemplatesOpen(true)}
          >
            <FileSpreadsheet className="size-3" />
            Manage Headers/Footers
          </Button>

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
            {searchQuery ? "No results match your search." : "No SAAOB records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal">Functions/Program/Project/Activity</TableHead>
                  <TableHead className="min-w-32">Account Code</TableHead>
                  <TableHead className="min-w-36 text-right">Annual Budget</TableHead>
                  <TableHead className="min-w-36 text-right">Supplemental/Continuing</TableHead>
                  <TableHead className="min-w-36 text-right">Appropriation</TableHead>
                  <TableHead className="min-w-36 text-right">Allotment (Quarterly)</TableHead>
                  <TableHead className="min-w-32 text-right">Obligation</TableHead>
                  <TableHead className="min-w-36 text-right">Unobligated Balance</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage (%)</TableHead>
                  <TableHead className="min-w-36">Remarks</TableHead>
                  <TableHead className="min-w-40 text-right">Quarterly Allotment Balance</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage (%)</TableHead>
                  <TableHead className="min-w-32 text-right">Disbursed</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage (%)</TableHead>
                  <TableHead className="min-w-32 text-right">Variance</TableHead>
                  <TableHead className="min-w-32 text-right">LBAC Budget</TableHead>
                  <TableHead className="min-w-32 text-right">Variance Budget</TableHead>
                  <TableHead className="min-w-32 text-right">LBAC Obligated</TableHead>
                  <TableHead className="min-w-36 text-right">Variance Obligated</TableHead>
                  <TableHead className="min-w-40 text-right">Obligation with PRs</TableHead>
                  <TableHead className="min-w-36 text-right">Unobligated Balance</TableHead>
                  <TableHead className="min-w-28 text-right">Percentage %</TableHead>
                  <TableHead className="min-w-28 text-right">PRs</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{ height: `${paddingTop}px` }} />
                  </TableRow>
                )}

                {virtualRows.map(virtualRow => {
                  const row = flatRows[virtualRow.index]!;

                  if (row.kind === "group") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    const isSelected = selectedRow?.id === row.id;

                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={virtualRow.index}
                        className={`bg-muted/50 cursor-pointer select-none ${isSelected ? "outline outline-2 outline-primary" : ""}`}
                        onClick={() => handleRowClick(row)}
                        onDoubleClick={() => handleRowDoubleClick(row)}
                      >
                        <TableCell>
                          <button
                            type="button"
                            className="flex items-center gap-1 font-semibold text-left hover:text-primary w-full"
                            style={{ paddingLeft: `${row.depth * 14}px` }}
                            onClick={e => {
                              e.stopPropagation();
                              toggleCollapse(row.id);
                            }}
                          >
                            {isCollapsed
                              ? <ChevronRight className="size-3 shrink-0" />
                              : <ChevronDown className="size-3 shrink-0" />}
                            <span>{row.data.name}</span>
                          </button>
                        </TableCell>
                        <TableCell colSpan={TOTAL_COLS - 1} />
                      </TableRow>
                    );
                  }

                  if (row.kind === "total") {
                    const total = row.data;
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={virtualRow.index}
                        style={{ backgroundColor: "#FFF2CC" }}
                      >
                        <TableCell
                          className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal break-words font-bold"
                          style={{ paddingLeft: `${row.depth * 14 + 4}px` }}
                        >
                          Total: {row.groupName}
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.annualBudget)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.supplementalOrContinuing)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.appropriation)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.allotment)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.obligation)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.unObligatedBalance)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtPercent(total.percentage)}</TableCell>
                        <TableCell />
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.quarterlyAllotmentBalance.value)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtPercent(total.other.quarterlyAllotmentBalance.percentage)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.disbursed.value)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtPercent(total.other.disbursed.percentage)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.disbursed.variance)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.lbacBudget.value)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.lbacBudget.variance)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.lbacBudget.obligated)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.lbacBudget.varianceObligated)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.obligationWithPRs.value)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.obligationWithPRs.balance)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtPercent(total.other.obligationWithPRs.percentage)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{fmtAmount(total.other.pr)}</TableCell>
                      </TableRow>
                    );
                  }

                  const entryItem = row.data;
                  const isSelected = selectedRow?.id === row.id;

                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={virtualRow.index}
                      className={`cursor-pointer select-none ${_qabRowClass(entryItem.other.quarterlyAllotmentBalance.percentage, isSelected)}`}
                      title="Double-click to edit"
                      onClick={() => handleRowClick(row)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    >
                      <TableCell
                        className="w-[460px] min-w-[460px] max-w-[460px] whitespace-normal break-words"
                        style={{ paddingLeft: `${row.depth * 14 + 4}px` }}
                      >
                        {entryItem.name}
                      </TableCell>
                      <TableCell>{txt(entryItem.accountCode)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.annualBudget)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.supplementalOrContinuing)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.appropriation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.allotment)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.obligation)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.unObligatedBalance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(entryItem.percentage)}</TableCell>
                      <TableCell>{txt(entryItem.other.remarks)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.quarterlyAllotmentBalance.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(entryItem.other.quarterlyAllotmentBalance.percentage)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.disbursed.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(entryItem.other.disbursed.percentage)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.disbursed.variance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.lbacBudget.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.lbacBudget.variance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.lbacBudget.obligated)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.lbacBudget.varianceObligated)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.obligationWithPRs.value)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.obligationWithPRs.balance)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtPercent(entryItem.other.obligationWithPRs.percentage)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtAmount(entryItem.other.pr)}</TableCell>
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

      {dialogMode === "add-group" && (
        <GroupFormDialog
          mode="add"
          allGroups={allGroups}
          offices={offices}
          defaultParentId={selectedGroup?.id}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "edit-group" && selectedGroup && (
        <GroupFormDialog
          mode="edit"
          editGroup={selectedGroup}
          allGroups={allGroups}
          offices={offices}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "add-entry" && (
        <EntryFormDialog
          mode="add"
          allGroups={allGroups}
          expenseClasses={expenseClasses}
          defaultGroupId={selectedGroup?.id ?? allGroups[0]?.id ?? ""}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "edit-entry" && selectedEntryRow && (
        <EntryFormDialog
          mode="edit"
          editEntry={selectedEntryRow.data}
          allGroups={allGroups}
          expenseClasses={expenseClasses}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "move-entry" && selectedEntryRow && (
        <MoveEntryDialog
          entryRow={selectedEntryRow}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "move-group" && selectedGroupRow && (
        <MoveGroupDialog
          groupRow={selectedGroupRow}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      <ManageTemplatesDialog
        open={manageTemplatesOpen}
        onOpenChange={setManageTemplatesOpen}
        apiPath="/api/saaob/templates/data"
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exportApiBase="/api/saaob/export/data"
        exportParams={{ year: String(currentYear), month: String(selectedMonth) }}
        tree={tree}
      />
    </div>
  );
}

function GroupFormDialog({
  mode,
  editGroup,
  allGroups,
  offices,
  defaultParentId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editGroup?: SaaobGroupResponse;
  allGroups: SaaobGroupResponse[];
  offices: OfficeOption[];
  defaultParentId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [name, setName] = useState(editGroup?.name ?? "");
  const [parentId, setParentId] = useState(defaultParentId ?? "");
  const [officeId, setOfficeId] = useState(editGroup?.officeId ?? "");
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
      body.officeId = officeId || null;
      if (mode === "add" && parentId) {
        body.parentId = parentId;
      }

      const response = await fetch(
        mode === "add" ? "/api/saaob/groups" : `/api/saaob/groups/${editGroup!.id}`,
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
            {mode === "add" ? "Create a new SAAOB group." : `Editing group: ${editGroup?.name}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-name`}>Function/Program/Project/Activity *</Label>
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

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-office`}>Assigned Office</Label>
            <Select
              value={officeId || "__none__"}
              onValueChange={value => setOfficeId(value === "__none__" ? "" : value)}
              disabled={submitting}
            >
              <SelectTrigger id={`${baseId}-office`}>
                <SelectValue placeholder="No office assignment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {offices.map(item => (
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

function EntryFormDialog({
  mode,
  editEntry,
  allGroups,
  expenseClasses,
  defaultGroupId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editEntry?: SaaobEntryResponse;
  allGroups: SaaobGroupResponse[];
  expenseClasses: ExpenseClassOption[];
  defaultGroupId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();

  const [parentId, setParentId] = useState(defaultGroupId ?? "");
  const [name, setName] = useState(editEntry?.name ?? "");
  const [annualBudget, setAnnualBudget] = useState(editEntry?.annualBudget ?? "");
  const [allotmentShouldCopyFromAppropriation, setAllotmentShouldCopyFromAppropriation] = useState(
    editEntry?.allotmentShouldCopyFromAppropriation ?? false,
  );
  const [remarks, setRemarks] = useState(editEntry?.other.remarks ?? "");
  const [linkedExpenseClass, setLinkedExpenseClass] = useState<ExpenseClassOption | null>(null);

  const [nameFocused, setNameFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filteredExpenseClasses = useMemo(() => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return [];

    return expenseClasses
      .filter(item => item.accountName.toLowerCase().includes(normalized))
      .slice(0, 10);
  }, [expenseClasses, name]);

  const handleSave = async () => {
    if (submitting) return;

    if (mode === "add" && !parentId) {
      setActionError("Please select a parent group.");
      return;
    }

    if (!name.trim()) {
      setActionError("Function/Program/Project/Activity is required.");
      return;
    }

    if (!annualBudget.trim()) {
      setActionError("Annual Budget is required.");
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        annualBudget: annualBudget.trim(),
      };

      if (remarks.trim()) body.remarks = remarks.trim();
      if (linkedExpenseClass?.id) body.expenseCodeId = linkedExpenseClass.id;
      body.allotmentShouldCopyFromAppropriation = allotmentShouldCopyFromAppropriation;

      if (mode === "add") {
        body.parentId = parentId;
      }

      const response = await fetch(
        mode === "add" ? "/api/saaob/entries" : `/api/saaob/entries/${editEntry!.id}`,
        {
          method: mode === "add" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save entry. Please try again.");
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
      <DialogContent className="max-h-[90vh] min-w-[60%]">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Entry" : "Edit Entry"}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Create a new SAAOB entry."
              : `Editing entry: ${editEntry?.name}`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[68vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            {mode === "add" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-group`}>Parent Group *</Label>
                <Select
                  value={parentId}
                  onValueChange={setParentId}
                  disabled={submitting}
                >
                  <SelectTrigger id={`${baseId}-group`}>
                    <SelectValue placeholder="Select a group..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allGroups.map(group => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-name`}>Function/Program/Project/Activity *</Label>

              <div className="relative">
                <Input
                  id={`${baseId}-name`}
                  value={name}
                  onFocus={() => setNameFocused(true)}
                  onBlur={() => setTimeout(() => setNameFocused(false), 120)}
                  onChange={e => {
                    const next = e.target.value;
                    setName(next);

                    if (
                      linkedExpenseClass
                      && next.trim().toLowerCase() !== linkedExpenseClass.accountName.toLowerCase()
                    ) {
                      setLinkedExpenseClass(null);
                    }
                  }}
                  disabled={submitting}
                  placeholder="Type to search expense classes or enter any custom name"
                />

                {nameFocused && filteredExpenseClasses.length > 0 && (
                  <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {filteredExpenseClasses.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
                        onMouseDown={() => {
                          setName(item.accountName);
                          setLinkedExpenseClass(item);
                          setNameFocused(false);
                        }}
                      >
                        <span className="font-medium">{item.accountName}</span>
                        <span className="text-xs text-muted-foreground">{item.accountCode ?? "No account code"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Selecting a suggestion links this entry to its expense code. Typing a different value removes the link.
              </p>

              {linkedExpenseClass && (
                <div className="flex items-center gap-2 text-xs">
                  <Badge variant="secondary">
                    Linked: {linkedExpenseClass.accountName}
                    {linkedExpenseClass.accountCode ? ` (${linkedExpenseClass.accountCode})` : ""}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => setLinkedExpenseClass(null)}
                  >
                    Clear link
                  </Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-annual-budget`}>Annual Budget *</Label>
                <Input
                  id={`${baseId}-annual-budget`}
                  value={annualBudget}
                  onChange={e => setAnnualBudget(e.target.value)}
                  disabled={submitting}
                  placeholder="0.00"
                />
                <label className="flex items-center gap-2 mt-1 cursor-pointer select-none">
                  <Checkbox
                    id={`${baseId}-allotment-copy`}
                    checked={allotmentShouldCopyFromAppropriation}
                    onCheckedChange={v => setAllotmentShouldCopyFromAppropriation(v === true)}
                    disabled={submitting}
                  />
                  <span className="text-xs text-muted-foreground">
                    Copy allotment from appropriation (instead of quarterly formula)
                  </span>
                </label>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-remarks`}>Remarks</Label>
              <Textarea
                id={`${baseId}-remarks`}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                disabled={submitting}
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Saving..." : mode === "add" ? "Create Entry" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveEntryDialog({
  entryRow,
  allGroups,
  onSuccess,
  onClose,
}: {
  entryRow: SelectedEntryRow;
  allGroups: SaaobGroupResponse[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [targetGroupId, setTargetGroupId] = useState(entryRow.groupId);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;
    if (!targetGroupId) {
      setActionError("Please select a target group.");
      return;
    }

    if (targetGroupId === entryRow.groupId) {
      onClose();
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const response = await fetch(`/api/saaob/entries/${entryRow.id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroupId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to move entry. Please try again.");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Entry</DialogTitle>
          <DialogDescription>
            Move {entryRow.data.name} to a different group.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-target-group`}>Target Group</Label>
          <Select
            value={targetGroupId}
            onValueChange={setTargetGroupId}
            disabled={submitting}
          >
            <SelectTrigger id={`${baseId}-target-group`}>
              <SelectValue placeholder="Select target group..." />
            </SelectTrigger>
            <SelectContent>
              {allGroups.map(group => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Moving..." : "Move Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveGroupDialog({
  groupRow,
  allGroups,
  onSuccess,
  onClose,
}: {
  groupRow: SelectedGroupRow;
  allGroups: SaaobGroupResponse[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [targetGroupId, setTargetGroupId] = useState<string>("__root__");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Groups that cannot be a target: the group itself and all its descendants
  const excludedIds = useMemo(() => {
    const ids = new Set<string>([groupRow.id]);
    const collectDescendants = (id: string) => {
      for (const g of allGroups) {
        if ((g as SaaobGroupResponse & { parentId?: string }).parentId === id) {
          ids.add(g.id);
          collectDescendants(g.id);
        }
      }
    };
    collectDescendants(groupRow.id);
    return ids;
  }, [groupRow.id, allGroups]);

  const eligibleGroups = allGroups.filter(g => !excludedIds.has(g.id));

  const handleSave = async () => {
    if (submitting) return;

    const resolvedTarget = targetGroupId === "__root__" ? null : targetGroupId;

    setSubmitting(true);
    setActionError(null);

    try {
      const response = await fetch(`/api/saaob/groups/${groupRow.id}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetGroupId: resolvedTarget }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to move group. Please try again.");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Group</DialogTitle>
          <DialogDescription>
            Move &ldquo;{groupRow.data.name}&rdquo; to a different parent group, or to the root level.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-target-group`}>Target Parent</Label>
          <Select
            value={targetGroupId}
            onValueChange={setTargetGroupId}
            disabled={submitting}
          >
            <SelectTrigger id={`${baseId}-target-group`}>
              <SelectValue placeholder="Select target..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">Root (no parent)</SelectItem>
              {eligibleGroups.map(group => (
                <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {actionError && (
          <Typography variant="small" className="text-destructive">{actionError}</Typography>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "Moving..." : "Move Group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function _qabRowClass(qabPercentage: string | undefined, isSelected: boolean): string {
  if (isSelected) return "bg-accent";
  const pct = Number(qabPercentage);
  if (Number.isNaN(pct)) return "";
  if (pct < 0) return "bg-red-50 hover:bg-red-100/80";
  if (Math.abs(pct - 100) < 0.01) return "bg-green-50 hover:bg-green-100/80";
  return "";
}

function _getUtc8Year(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

function _getUtc8Month(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCMonth() + 1;
}
