"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacSearchGroupItem,
  LbacSearchResponse,
  LbacSearchResultItem,
  PpmpDataResponse,
  PpmpMajorGroupResponse,
  PpmpMinorGroupResponse,
  PpmpPlanItemResponse,
  PpmpProjectGroupResponse,
  SaaobSearchEntry,
  SaaobSearchGroup,
  SaaobSearchResponse,
} from "@/lib/http/client/responses";
import { isLbacSearchGroup, isSaaobGroup } from "@/lib/http/client/responses";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";
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
import { MonthPicker } from "@/components/ui/month-picker";
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

const TOTAL_COLS = 12;
const PARENT_TYPE_MINOR = 6700;
const PARENT_TYPE_PROJECT = 6701;

type FlatRow =
  | { kind: "major"; id: string; data: PpmpMajorGroupResponse }
  | { kind: "minor"; id: string; data: PpmpMinorGroupResponse; majorId: string }
  | { kind: "project"; id: string; data: PpmpProjectGroupResponse; minorId: string }
  | { kind: "item"; id: string; data: PpmpPlanItemResponse; parentType: 6700 | 6701; parentId: string };

type DialogMode =
  | "add-major"
  | "edit-major"
  | "add-minor"
  | "edit-minor"
  | "add-project"
  | "edit-project"
  | "add-item"
  | "edit-item"
  | "move"
  | null;

type DialogPayload = {
  majorId?: string;
  minorId?: string;
  parentType?: 6700 | 6701;
  parentId?: string;
};

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<PpmpDataResponse, ApiResponseException>
  >("/api/forms/ppmp", $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<FlatRow | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [dialogPayload, setDialogPayload] = useState<DialogPayload>({});
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);
  const majorGroups = useMemo(() => tree, [tree]);
  const minorGroups = useMemo(() => collectMinorGroups(tree), [tree]);
  const projectGroups = useMemo(() => collectProjectGroups(tree), [tree]);

  const flatRows = useMemo(
    () => flattenVisibleRows(tree, collapsed, searchQuery),
    [tree, collapsed, searchQuery],
  );

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 44,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setDialogPayload({});
  }, []);

  const onSuccess = useCallback(() => {
    mutate();
    closeDialog();
  }, [mutate, closeDialog]);

  const openAddMinor = useCallback((majorId: string) => {
    setDialogMode("add-minor");
    setDialogPayload({ majorId });
  }, []);

  const openAddProject = useCallback((minorId: string) => {
    setDialogMode("add-project");
    setDialogPayload({ minorId });
  }, []);

  const openAddItemUnderMinor = useCallback((minorId: string) => {
    setDialogMode("add-item");
    setDialogPayload({ parentType: PARENT_TYPE_MINOR, parentId: minorId });
  }, []);

  const openAddItemUnderProject = useCallback((projectId: string) => {
    setDialogMode("add-item");
    setDialogPayload({ parentType: PARENT_TYPE_PROJECT, parentId: projectId });
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;

    const messageByKind: Record<FlatRow["kind"], string> = {
      major: "Delete this major group? This cannot be undone.",
      minor: "Delete this minor group? This cannot be undone.",
      project: "Delete this project group? This cannot be undone.",
      item: "Delete this plan item? This cannot be undone.",
    };
    if (!confirm(messageByKind[selectedRow.kind])) return;

    const endpointByKind: Record<FlatRow["kind"], string> = {
      major: `/api/forms/ppmp/major-group/${selectedRow.id}`,
      minor: `/api/forms/ppmp/minor-group/${selectedRow.id}`,
      project: `/api/forms/ppmp/project-group/${selectedRow.id}`,
      item: `/api/forms/ppmp/item/${selectedRow.id}`,
    };

    const response = await fetch(endpointByKind[selectedRow.kind], { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      alert(payload?.message ?? "Failed to delete.");
      return;
    }
    setSelectedRow(null);
    mutate();
  }, [selectedRow, mutate]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-64 text-xs"
            placeholder="Search PPMP..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogMode("add-major")}
        >
          <Plus className="size-3" />
          Major Group
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selectedRow?.kind !== "major"}
          onClick={() => {
            if (selectedRow?.kind !== "major") return;
            openAddMinor(selectedRow.id);
          }}
        >
          <Plus className="size-3" />
          Minor Group
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selectedRow?.kind !== "minor"}
          onClick={() => {
            if (selectedRow?.kind !== "minor") return;
            openAddProject(selectedRow.id);
          }}
        >
          <Plus className="size-3" />
          Project Group
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selectedRow?.kind !== "minor" && selectedRow?.kind !== "project"}
          onClick={() => {
            if (selectedRow?.kind === "minor") {
              openAddItemUnderMinor(selectedRow.id);
            } else if (selectedRow?.kind === "project") {
              openAddItemUnderProject(selectedRow.id);
            }
          }}
        >
          <Plus className="size-3" />
          Plan Item
        </Button>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit selected"
          title="Edit selected"
          disabled={!selectedRow}
          onClick={() => {
            if (!selectedRow) return;
            if (selectedRow.kind === "major") setDialogMode("edit-major");
            if (selectedRow.kind === "minor") setDialogMode("edit-minor");
            if (selectedRow.kind === "project") setDialogMode("edit-project");
            if (selectedRow.kind === "item") setDialogMode("edit-item");
          }}
        >
          <Pencil />
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Move selected"
          title="Move selected"
          disabled={!selectedRow || selectedRow.kind === "major"}
          onClick={() => setDialogMode("move")}
        >
          <ArrowRightLeft />
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete selected"
          title="Delete selected"
          className="text-destructive hover:text-destructive"
          disabled={!selectedRow}
          onClick={handleDelete}
        >
          <Trash2 />
        </Button>

        {selectedRow && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {labelForRow(selectedRow)}
          </Badge>
        )}
      </div>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No PPMP records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead colSpan={5} className="text-center">PROCUREMENT PROJECT DETAILS</TableHead>
                  <TableHead colSpan={3} className="text-center">PROJECTED TIMELINE (MM/YYYY)</TableHead>
                  <TableHead colSpan={2} className="text-center">FUNDING DETAILS</TableHead>
                  <TableHead rowSpan={2} className="min-w-48 align-middle">Attached Supporting Documents</TableHead>
                  <TableHead rowSpan={2} className="min-w-48 align-middle">Remarks</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="w-[260px] min-w-[260px] whitespace-normal wrap-break-word">
                    General Description and Objective of the Project to be Procured
                  </TableHead>
                  <TableHead className="w-[280px] min-w-[280px] whitespace-normal wrap-break-word">
                    Type of the Project to be Procured (whether Goods, Infrastructure and Consulting Services)
                  </TableHead>
                  <TableHead className="min-w-44">Quantity and Size of the Project to be Procured</TableHead>
                  <TableHead className="min-w-44">Recommended Mode of Procurement</TableHead>
                  <TableHead className="min-w-40">Pre-Procurement Conference, if applicable (YES/NO)</TableHead>
                  <TableHead className="min-w-36">Start of Procurement Activity</TableHead>
                  <TableHead className="min-w-36">End of Procurement Activity</TableHead>
                  <TableHead className="min-w-44">Expected Delivery/Implementation Period</TableHead>
                  <TableHead className="min-w-44">Source of Funds</TableHead>
                  <TableHead className="min-w-40">Estimated Budget/Authorized Budgetary Allocation (Php)</TableHead>
                </TableRow>
                <TableRow>
                  {Array.from({ length: TOTAL_COLS }, (_, idx) => (
                    <TableHead key={`num-${idx + 1}`} className="text-center font-mono text-xs py-1">
                      {idx + 1}
                    </TableHead>
                  ))}
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
                  const isSelected = selectedRow?.id === row.id;

                  if (row.kind === "major") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className={`cursor-pointer select-none bg-emerald-100/60 dark:bg-emerald-950/40 ${isSelected ? "outline-2 outline-primary" : ""}`}
                        onClick={() => setSelectedRow(prev => (prev?.id === row.id ? null : row))}
                        onDoubleClick={() => {
                          setSelectedRow(row);
                          setDialogMode("edit-major");
                        }}
                      >
                        <TableCell className="font-semibold">Source of Funds</TableCell>
                        <TableCell className="font-semibold">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Collapse/Expand"
                              onClick={e => {
                                e.stopPropagation();
                                toggleCollapse(row.id);
                              }}
                            >
                              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                            </Button>
                            {txt(row.data.saaob.name)}
                          </div>
                        </TableCell>
                        <TableCell colSpan={8} />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    );
                  }

                  if (row.kind === "minor") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className={`cursor-pointer select-none bg-sky-100/65 dark:bg-sky-950/40 ${isSelected ? "outline-2 outline-primary" : ""}`}
                        onClick={() => setSelectedRow(prev => (prev?.id === row.id ? null : row))}
                        onDoubleClick={() => {
                          setSelectedRow(row);
                          setDialogMode("edit-minor");
                        }}
                      >
                        <TableCell className="font-semibold">{txt(row.data.lbac.aipRefCode)}</TableCell>
                        <TableCell className="font-semibold">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Collapse/Expand"
                              onClick={e => {
                                e.stopPropagation();
                                toggleCollapse(row.id);
                              }}
                            >
                              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                            </Button>
                            {txt(row.data.lbac.name)}
                          </div>
                        </TableCell>
                        <TableCell colSpan={8} />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    );
                  }

                  if (row.kind === "project") {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className={`cursor-pointer select-none bg-amber-100/75 dark:bg-amber-950/40 ${isSelected ? "outline-2 outline-primary" : ""}`}
                        onClick={() => setSelectedRow(prev => (prev?.id === row.id ? null : row))}
                        onDoubleClick={() => {
                          setSelectedRow(row);
                          setDialogMode("edit-project");
                        }}
                      >
                        <TableCell className="font-semibold">PPA/Training Title</TableCell>
                        <TableCell className="font-semibold">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Collapse/Expand"
                              onClick={e => {
                                e.stopPropagation();
                                toggleCollapse(row.id);
                              }}
                            >
                              {isCollapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                            </Button>
                            {txt(row.data.title)}
                          </div>
                        </TableCell>
                        <TableCell colSpan={8} />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${
                        isSelected
                          ? "bg-accent"
                          : vr.index % 2 === 1
                            ? "bg-muted hover:bg-muted/50"
                            : ""
                      }`}
                      onClick={() => setSelectedRow(prev => (prev?.id === row.id ? null : row))}
                      onDoubleClick={() => {
                        setSelectedRow(row);
                        setDialogMode("edit-item");
                      }}
                    >
                      <TableCell className="w-[260px] min-w-[260px] whitespace-normal wrap-break-word">
                        {txt(row.data.generalDescription)}
                      </TableCell>
                      <TableCell className="w-[280px] min-w-[280px] whitespace-normal wrap-break-word">
                        {humanizeTypeOfProject(row.data.typeOfProject)}
                      </TableCell>
                      <TableCell>{txt(row.data.quantityOrSize)}</TableCell>
                      <TableCell>{txt(row.data.recommendedModeOfProcurement)}</TableCell>
                      <TableCell>{row.data.eligibleForPreProcurementConference ? "Yes" : "No"}</TableCell>
                      <TableCell>{formatMonthYearLabel(row.data.startOfProcurementActivity)}</TableCell>
                      <TableCell>{formatMonthYearLabel(row.data.endOfProcurementActivity)}</TableCell>
                      <TableCell>{formatMonthYearLabel(row.data.expectedDeliveryPeriod)}</TableCell>
                      <TableCell>{txt(row.data.saaob.name)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtMoney(row.data.estimatedBudget)}</TableCell>
                      <TableCell className="w-[240px] min-w-[240px] whitespace-normal wrap-break-word">
                        {txt(row.data.attachedSupportingDocuments)}
                      </TableCell>
                      <TableCell className="w-[240px] min-w-[240px] whitespace-normal wrap-break-word">
                        {txt(row.data.remarks)}
                      </TableCell>
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

      {dialogMode === "add-major" && (
        <MajorGroupDialog
          key="add-major"
          mode="add"
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "edit-major" && selectedRow?.kind === "major" && (
        <MajorGroupDialog
          key={`edit-major-${selectedRow.id}`}
          mode="edit"
          editMajor={selectedRow.data}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "add-minor" && (
        <MinorGroupDialog
          key={`add-minor-${dialogPayload.majorId ?? "none"}`}
          mode="add"
          defaultMajorId={dialogPayload.majorId}
          majorGroups={majorGroups}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "edit-minor" && selectedRow?.kind === "minor" && (
        <MinorGroupDialog
          key={`edit-minor-${selectedRow.id}`}
          mode="edit"
          editMinor={selectedRow.data}
          majorGroups={majorGroups}
          selectedMajorId={selectedRow.majorId}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "add-project" && (
        <ProjectGroupDialog
          key={`add-project-${dialogPayload.minorId ?? "none"}`}
          mode="add"
          defaultMinorId={dialogPayload.minorId}
          minorGroups={minorGroups}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "edit-project" && selectedRow?.kind === "project" && (
        <ProjectGroupDialog
          key={`edit-project-${selectedRow.id}`}
          mode="edit"
          editProject={selectedRow.data}
          minorGroups={minorGroups}
          selectedMinorId={selectedRow.minorId}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "add-item" && (
        <PlanItemDialog
          key={`add-item-${dialogPayload.parentType ?? "none"}-${dialogPayload.parentId ?? "none"}`}
          mode="add"
          defaultParentType={dialogPayload.parentType}
          defaultParentId={dialogPayload.parentId}
          minorGroups={minorGroups}
          projectGroups={projectGroups}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "edit-item" && selectedRow?.kind === "item" && (
        <PlanItemDialog
          key={`edit-item-${selectedRow.id}`}
          mode="edit"
          editItem={selectedRow.data}
          defaultParentType={selectedRow.parentType}
          defaultParentId={selectedRow.parentId}
          minorGroups={minorGroups}
          projectGroups={projectGroups}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
      {dialogMode === "move" && selectedRow && selectedRow.kind !== "major" && (
        <MoveDialog
          key={`move-${selectedRow.kind}-${selectedRow.id}`}
          row={selectedRow}
          majorGroups={majorGroups}
          minorGroups={minorGroups}
          projectGroups={projectGroups}
          onClose={closeDialog}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}

function MajorGroupDialog({
  mode,
  editMajor,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editMajor?: PpmpMajorGroupResponse;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [saaob, setSaaob] = useState<{ id: string; name: string } | null>(
    editMajor ? { id: editMajor.saaob.id, name: editMajor.saaob.name } : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
    if (!saaob?.id) {
      setActionError("Please select a source of funds.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const endpoint = mode === "add"
        ? "/api/forms/ppmp/major-group"
        : `/api/forms/ppmp/major-group/${editMajor!.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saaobId: saaob.id }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save major group.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("Unexpected error while saving major group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Create Major Group" : "Edit Major Group"}</DialogTitle>
          <DialogDescription>Major group source of funds configuration.</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-2">
          <Label>Source of Funds (SAAOB)</Label>
          <SaaobSearchCombobox value={saaob} onChange={setSaaob} disabled={submitting} />
        </div>

        {actionError && <Typography variant="small" className="text-destructive">{actionError}</Typography>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={save} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MinorGroupDialog({
  mode,
  editMinor,
  majorGroups,
  defaultMajorId,
  selectedMajorId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editMinor?: PpmpMinorGroupResponse;
  majorGroups: PpmpMajorGroupResponse[];
  defaultMajorId?: string;
  selectedMajorId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [majorId, setMajorId] = useState(defaultMajorId ?? selectedMajorId ?? majorGroups[0]?.id ?? "");
  const [lbac, setLbac] = useState<{ id: string; name: string } | null>(
    editMinor ? { id: editMinor.lbac.id, name: editMinor.lbac.name } : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
    if (!lbac?.id) {
      setActionError("Please select an LBAC item.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const endpoint = mode === "add"
        ? "/api/forms/ppmp/minor-group"
        : `/api/forms/ppmp/minor-group/${editMinor!.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const body = mode === "add"
        ? { parentId: majorId, lbacId: lbac.id }
        : { lbacId: lbac.id };

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save minor group.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("Unexpected error while saving minor group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Create Minor Group" : "Edit Minor Group"}</DialogTitle>
          <DialogDescription>Minor group maps to a linked LBAC item.</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {mode === "add" && (
            <div className="flex flex-col gap-1">
              <Label>Parent Major Group</Label>
              <Select value={majorId} onValueChange={setMajorId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select major group..." />
                </SelectTrigger>
                <SelectContent>
                  {majorGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.saaob.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label>Linked LBAC Item</Label>
            <LbacSearchCombobox value={lbac} onChange={setLbac} disabled={submitting} />
          </div>
        </div>
        {actionError && <Typography variant="small" className="text-destructive">{actionError}</Typography>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={save} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectGroupDialog({
  mode,
  editProject,
  minorGroups,
  defaultMinorId,
  selectedMinorId,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editProject?: PpmpProjectGroupResponse;
  minorGroups: PpmpMinorGroupResponse[];
  defaultMinorId?: string;
  selectedMinorId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [minorId, setMinorId] = useState(defaultMinorId ?? selectedMinorId ?? minorGroups[0]?.id ?? "");
  const [title, setTitle] = useState(editProject?.title ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
    if (!title.trim()) {
      setActionError("Title is required.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const endpoint = mode === "add"
        ? "/api/forms/ppmp/project-group"
        : `/api/forms/ppmp/project-group/${editProject!.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const body = mode === "add"
        ? { parentId: minorId, title: title.trim() }
        : { title: title.trim() };

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to save project group.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("Unexpected error while saving project group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Create Project Group" : "Edit Project Group"}</DialogTitle>
          <DialogDescription>Project groups hold plan items under a minor group.</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          {mode === "add" && (
            <div className="flex flex-col gap-1">
              <Label>Parent Minor Group</Label>
              <Select value={minorId} onValueChange={setMinorId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select minor group..." />
                </SelectTrigger>
                <SelectContent>
                  {minorGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.lbac.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <Label htmlFor="project-title">Project Group Title</Label>
            <Input
              id="project-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              disabled={submitting}
              placeholder="PPA/Training title"
            />
          </div>
        </div>
        {actionError && <Typography variant="small" className="text-destructive">{actionError}</Typography>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={save} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanItemDialog({
  mode,
  editItem,
  defaultParentType,
  defaultParentId,
  minorGroups,
  projectGroups,
  onSuccess,
  onClose,
}: {
  mode: "add" | "edit";
  editItem?: PpmpPlanItemResponse;
  defaultParentType?: 6700 | 6701;
  defaultParentId?: string;
  minorGroups: PpmpMinorGroupResponse[];
  projectGroups: PpmpProjectGroupResponse[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [parentType, setParentType] = useState<6700 | 6701>(defaultParentType ?? PARENT_TYPE_MINOR);
  const [parentId, setParentId] = useState(defaultParentId ?? minorGroups[0]?.id ?? "");

  const [generalDescription, setGeneralDescription] = useState(editItem?.generalDescription ?? "");
  const [typeOfProject, setTypeOfProject] = useState<PpmpPlanItemResponse["typeOfProject"]>(editItem?.typeOfProject ?? "goods");
  const [quantityOrSize, setQuantityOrSize] = useState(editItem?.quantityOrSize ?? "");
  const [recommendedModeOfProcurement, setRecommendedModeOfProcurement] = useState(editItem?.recommendedModeOfProcurement ?? "");
  const [eligible, setEligible] = useState(editItem?.eligibleForPreProcurementConference ?? false);
  const [startMonth, setStartMonth] = useState(toMonthInput(editItem?.startOfProcurementActivity ?? null));
  const [endMonth, setEndMonth] = useState(toMonthInput(editItem?.endOfProcurementActivity ?? null));
  const [deliveryMonth, setDeliveryMonth] = useState(toMonthInput(editItem?.expectedDeliveryPeriod ?? null));
  const [saaob, setSaaob] = useState<{ id: string; name: string } | null>(
    editItem ? { id: editItem.saaob.id, name: editItem.saaob.name } : null,
  );
  const [estimatedBudget, setEstimatedBudget] = useState(editItem?.estimatedBudget ?? "");
  const [attachedSupportingDocuments, setAttachedSupportingDocuments] = useState(editItem?.attachedSupportingDocuments ?? "");
  const [remarks, setRemarks] = useState(editItem?.remarks ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const parentOptions = parentType === PARENT_TYPE_MINOR ? minorGroups : projectGroups;
  const parentPlaceholder = parentType === PARENT_TYPE_MINOR ? "Select minor group..." : "Select project group...";
  const parentLabel = parentType === PARENT_TYPE_MINOR ? "Parent Minor Group" : "Parent Project Group";

  const save = async () => {
    if (submitting) return;
    if (mode === "add" && !parentId) {
      setActionError("Please select a parent group.");
      return;
    }
    if (!quantityOrSize.trim()) {
      setActionError("Quantity and size is required.");
      return;
    }
    if (!estimatedBudget.trim()) {
      setActionError("Estimated budget is required.");
      return;
    }
    if (!startMonth || !endMonth || !deliveryMonth) {
      setActionError("Please complete all projected timeline fields.");
      return;
    }

    const payload: Record<string, unknown> = {
      typeOfProject,
      quantityOrSize: quantityOrSize.trim(),
      eligibleForPreProcurementConference: eligible,
      startOfProcurementActivity: monthToApiIso(startMonth),
      endOfProcurementActivity: monthToApiIso(endMonth),
      expectedDeliveryPeriod: monthToApiIso(deliveryMonth),
      estimatedBudget: estimatedBudget.trim(),
    };

    if (generalDescription.trim()) payload.generalDescription = generalDescription.trim();
    if (recommendedModeOfProcurement.trim()) payload.recommendedModeOfProcurement = recommendedModeOfProcurement.trim();
    if (saaob?.id) payload.saaobId = saaob.id;
    if (attachedSupportingDocuments.trim()) payload.attachedSupportingDocuments = attachedSupportingDocuments.trim();
    if (remarks.trim()) payload.remarks = remarks.trim();

    setSubmitting(true);
    setActionError(null);
    try {
      let endpoint = "/api/forms/ppmp/item";
      let method = "POST";
      let body: Record<string, unknown> = {
        parentId,
        parentType,
        payload,
      };

      if (mode === "edit" && editItem) {
        endpoint = `/api/forms/ppmp/item/${editItem.id}`;
        method = "PATCH";
        body = payload;
      }

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const resBody = await response.json().catch(() => null);
        setActionError(resBody?.message ?? "Failed to save plan item.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("Unexpected error while saving plan item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[90vh] w-full max-w-[calc(100%-2rem)] sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Create Plan Item" : "Edit Plan Item"}</DialogTitle>
          <DialogDescription>Fill in PPMP plan item details.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-1">
          <div className="grid grid-cols-1 gap-4 pb-2 md:grid-cols-2">
            {mode === "add" && (
              <>
                <div className="flex flex-col gap-1">
                  <Label>Parent Type</Label>
                  <Select
                    value={String(parentType)}
                    onValueChange={v => {
                      const next = Number(v) as 6700 | 6701;
                      setParentType(next);
                      if (next === PARENT_TYPE_MINOR) setParentId(minorGroups[0]?.id ?? "");
                      else setParentId(projectGroups[0]?.id ?? "");
                    }}
                    disabled={submitting}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={String(PARENT_TYPE_MINOR)}>Minor Group</SelectItem>
                      <SelectItem value={String(PARENT_TYPE_PROJECT)}>Project Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label>{parentLabel}</Label>
                  <Select value={parentId} onValueChange={setParentId} disabled={submitting}>
                    <SelectTrigger>
                      <SelectValue placeholder={parentPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>
                          {"title" in option ? option.title : option.lbac.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="flex flex-col gap-1 md:col-span-2">
              <Label htmlFor={`${baseId}-desc`}>General Description and Objective</Label>
              <Textarea
                id={`${baseId}-desc`}
                value={generalDescription}
                onChange={e => setGeneralDescription(e.target.value)}
                rows={2}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Type of Project</Label>
              <Select
                value={typeOfProject}
                onValueChange={v => setTypeOfProject(v as PpmpPlanItemResponse["typeOfProject"])}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="goods">Goods</SelectItem>
                  <SelectItem value="infra">Infrastructure</SelectItem>
                  <SelectItem value="cons-serv">Consulting Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-qty`}>Quantity and Size</Label>
              <Input
                id={`${baseId}-qty`}
                value={quantityOrSize}
                onChange={e => setQuantityOrSize(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-mode`}>Recommended Mode of Procurement</Label>
              <Input
                id={`${baseId}-mode`}
                value={recommendedModeOfProcurement}
                onChange={e => setRecommendedModeOfProcurement(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Pre-Procurement Conference</Label>
              <Select
                value={eligible ? "yes" : "no"}
                onValueChange={v => setEligible(v === "yes")}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-start`}>Start of Procurement Activity</Label>
              <MonthPicker
                id={`${baseId}-start`}
                value={startMonth}
                onChange={setStartMonth}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-end`}>End of Procurement Activity</Label>
              <MonthPicker
                id={`${baseId}-end`}
                value={endMonth}
                onChange={setEndMonth}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-delivery`}>Expected Delivery/Implementation Period</Label>
              <MonthPicker
                id={`${baseId}-delivery`}
                value={deliveryMonth}
                onChange={setDeliveryMonth}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Source of Funds (Override)</Label>
              <SaaobSearchCombobox value={saaob} onChange={setSaaob} disabled={submitting} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-budget`}>Estimated Budget (Php)</Label>
              <Input
                id={`${baseId}-budget`}
                value={estimatedBudget}
                onChange={e => setEstimatedBudget(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label htmlFor={`${baseId}-docs`}>Attached Supporting Documents</Label>
              <Textarea
                id={`${baseId}-docs`}
                value={attachedSupportingDocuments}
                onChange={e => setAttachedSupportingDocuments(e.target.value)}
                rows={2}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <Label htmlFor={`${baseId}-remarks`}>Remarks</Label>
              <Textarea
                id={`${baseId}-remarks`}
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                rows={2}
                disabled={submitting}
              />
            </div>
          </div>
        </ScrollArea>
        {actionError && <Typography variant="small" className="text-destructive">{actionError}</Typography>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={save} disabled={submitting}>{submitting ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  row,
  majorGroups,
  minorGroups,
  projectGroups,
  onSuccess,
  onClose,
}: {
  row: Exclude<FlatRow, { kind: "major" }>;
  majorGroups: PpmpMajorGroupResponse[];
  minorGroups: PpmpMinorGroupResponse[];
  projectGroups: PpmpProjectGroupResponse[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [parentType, setParentType] = useState<6700 | 6701>(
    row.kind === "item" ? row.parentType : PARENT_TYPE_MINOR,
  );
  const [targetId, setTargetId] = useState<string>(
    row.kind === "minor"
      ? majorGroups[0]?.id ?? ""
      : row.kind === "project"
        ? minorGroups[0]?.id ?? ""
        : row.parentType === PARENT_TYPE_MINOR
          ? minorGroups[0]?.id ?? ""
          : projectGroups[0]?.id ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const save = async () => {
    if (submitting) return;
    if (!targetId) {
      setActionError("Please select a destination.");
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      let endpoint = "";
      let body: Record<string, unknown> = {};

      if (row.kind === "minor") {
        endpoint = `/api/forms/ppmp/minor-group/${row.id}/move`;
        body = { majorGroupId: targetId };
      } else if (row.kind === "project") {
        endpoint = `/api/forms/ppmp/project-group/${row.id}/move`;
        body = { minorGroupId: targetId };
      } else {
        endpoint = `/api/forms/ppmp/item/${row.id}/move`;
        body = { parentType, targetId };
      }

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to move selection.");
        return;
      }
      onSuccess();
    } catch {
      setActionError("Unexpected error while moving selection.");
    } finally {
      setSubmitting(false);
    }
  };

  const destinationOptions = row.kind === "minor"
    ? majorGroups.map(group => ({ id: group.id, label: group.saaob.name }))
    : row.kind === "project"
      ? minorGroups.map(group => ({ id: group.id, label: group.lbac.name }))
      : parentType === PARENT_TYPE_MINOR
        ? minorGroups.map(group => ({ id: group.id, label: group.lbac.name }))
        : projectGroups.map(group => ({ id: group.id, label: group.title }));

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Selection</DialogTitle>
          <DialogDescription>Choose the new parent destination.</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-4">
          {row.kind === "item" && (
            <div className="flex flex-col gap-1">
              <Label>Target Parent Type</Label>
              <Select
                value={String(parentType)}
                onValueChange={v => {
                  const nextType = Number(v) as 6700 | 6701;
                  setParentType(nextType);
                  if (nextType === PARENT_TYPE_MINOR) setTargetId(minorGroups[0]?.id ?? "");
                  else setTargetId(projectGroups[0]?.id ?? "");
                }}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={String(PARENT_TYPE_MINOR)}>Minor Group</SelectItem>
                  <SelectItem value={String(PARENT_TYPE_PROJECT)}>Project Group</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <Label>Destination</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={submitting}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination..." />
              </SelectTrigger>
              <SelectContent>
                {destinationOptions.map(option => (
                  <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {actionError && <Typography variant="small" className="text-destructive">{actionError}</Typography>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={save} disabled={submitting}>{submitting ? "Moving..." : "Move"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaaobSearchCombobox({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; name: string } | null;
  onChange: (value: { id: string; name: string } | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSWR<BetterFetchResponse<SaaobSearchResponse, ApiResponseException>>(
    open && query.length >= 2 ? `/api/saaob/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );
  const results = data?.data?.data ?? [];

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-1">
      <Input
        placeholder="Search SAAOB entry..."
        value={open ? query : (value ? value.name : "")}
        disabled={disabled}
        className="truncate"
        title={!open && value ? value.name : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div
          className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          onMouseDown={event => event.preventDefault()}
        >
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {value && (
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
              onMouseDown={() => {
                onChange(null);
                setOpen(false);
                setQuery("");
              }}
            >
              Clear selection
            </button>
          )}
          {renderSaaobNodes(results, onChange, () => {
            setOpen(false);
            setQuery("");
          })}
        </div>
      )}
    </div>
  );
}

function renderSaaobNodes(
  nodes: Array<SaaobSearchGroup | SaaobSearchEntry>,
  onChange: (value: { id: string; name: string } | null) => void,
  onSelect: () => void,
  depth = 0,
) {
  return nodes.map(node => {
    if (isSaaobGroup(node)) {
      return (
        <div key={node.id}>
          <div
            className="px-3 py-1 text-xs font-semibold text-muted-foreground"
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            {node.name}
          </div>
          {renderSaaobNodes(node.children, onChange, onSelect, depth + 1)}
        </div>
      );
    }

    return (
      <button
        key={node.id}
        type="button"
        className="flex w-full flex-col py-2 pr-3 text-left text-sm hover:bg-accent"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onMouseDown={() => {
          onChange({ id: node.id, name: node.name });
          onSelect();
        }}
      >
        <span>{node.name}</span>
        {node.accountCode && <span className="text-xs text-muted-foreground">{node.accountCode}</span>}
      </button>
    );
  });
}

function LbacSearchCombobox({
  value,
  onChange,
  disabled,
}: {
  value: { id: string; name: string } | null;
  onChange: (value: { id: string; name: string } | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useSWR<BetterFetchResponse<LbacSearchResponse, ApiResponseException>>(
    open && query.length >= 2 ? `/api/lbac/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );
  const results = data?.data?.data ?? [];

  return (
    <div className="relative flex w-full min-w-0 flex-col gap-1">
      <Input
        placeholder="Search LBAC item..."
        value={open ? query : (value ? value.name : "")}
        disabled={disabled}
        className="truncate"
        title={!open && value ? value.name : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div
          className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          onMouseDown={event => event.preventDefault()}
        >
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {value && (
            <button
              type="button"
              className="flex w-full px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
              onMouseDown={() => {
                onChange(null);
                setOpen(false);
                setQuery("");
              }}
            >
              Clear selection
            </button>
          )}
          {renderLbacNodes(results, onChange, () => {
            setOpen(false);
            setQuery("");
          })}
        </div>
      )}
    </div>
  );
}

function renderLbacNodes(
  nodes: Array<LbacSearchGroupItem | LbacSearchResultItem>,
  onChange: (value: { id: string; name: string } | null) => void,
  onSelect: () => void,
  depth = 0,
) {
  return nodes.map(node => {
    if (isLbacSearchGroup(node)) {
      return (
        <div key={node.id}>
          <div
            className="px-3 py-1 text-xs font-semibold text-muted-foreground"
            style={{ paddingLeft: `${12 + depth * 12}px` }}
          >
            {node.name}
          </div>
          {renderLbacNodes(node.children, onChange, onSelect, depth + 1)}
        </div>
      );
    }
    return (
      <button
        key={node.id}
        type="button"
        className="flex w-full flex-col py-2 pr-3 text-left text-sm hover:bg-accent"
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onMouseDown={() => {
          onChange({ id: node.id, name: node.mfoPpa });
          onSelect();
        }}
      >
        <span>{node.mfoPpa}</span>
        <span className="text-xs text-muted-foreground">
          {node.aipRefCode?.aipReferenceCode ?? "No AIP Ref Code"}
        </span>
      </button>
    );
  });
}

function flattenVisibleRows(
  majorGroups: PpmpMajorGroupResponse[],
  collapsed: Set<string>,
  query: string,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;

  function itemMatches(item: PpmpPlanItemResponse): boolean {
    return [
      item.generalDescription,
      item.typeOfProject,
      item.quantityOrSize,
      item.recommendedModeOfProcurement,
      item.saaob.name,
      item.attachedSupportingDocuments,
      item.remarks,
      item.estimatedBudget,
      item.startOfProcurementActivity,
      item.endOfProcurementActivity,
      item.expectedDeliveryPeriod,
    ].some(value => (value ?? "").toLowerCase().includes(q));
  }

  function walkProject(project: PpmpProjectGroupResponse, minorId: string): { rows: FlatRow[]; matched: boolean } {
    const localRows: FlatRow[] = [];
    let childMatched = false;
    for (const item of project.children) {
      const matched = !filtering || itemMatches(item);
      if (matched) {
        childMatched = true;
        localRows.push({
          kind: "item",
          id: item.id,
          data: item,
          parentType: PARENT_TYPE_PROJECT,
          parentId: project.id,
        });
      }
    }

    const projectMatched = project.title.toLowerCase().includes(q);
    const matched = !filtering || projectMatched || childMatched;
    if (!matched) return { rows: [], matched: false };

    const resultRows: FlatRow[] = [{ kind: "project", id: project.id, data: project, minorId }];
    if (filtering || !collapsed.has(project.id)) {
      resultRows.push(...localRows);
    }
    return { rows: resultRows, matched: true };
  }

  function walkMinor(minor: PpmpMinorGroupResponse, majorId: string): { rows: FlatRow[]; matched: boolean } {
    const childRows: FlatRow[] = [];
    let anyChildMatched = false;

    for (const child of minor.children) {
      if ("title" in child) {
        const projectResult = walkProject(child, minor.id);
        if (projectResult.matched) {
          anyChildMatched = true;
          childRows.push(...projectResult.rows);
        }
      } else {
        const itemMatched = !filtering || itemMatches(child);
        if (itemMatched) {
          anyChildMatched = true;
          childRows.push({
            kind: "item",
            id: child.id,
            data: child,
            parentType: PARENT_TYPE_MINOR,
            parentId: minor.id,
          });
        }
      }
    }

    const minorMatched = minor.lbac.name.toLowerCase().includes(q) || (minor.lbac.aipRefCode ?? "").toLowerCase().includes(q);
    const matched = !filtering || minorMatched || anyChildMatched;
    if (!matched) return { rows: [], matched: false };

    const resultRows: FlatRow[] = [{ kind: "minor", id: minor.id, data: minor, majorId }];
    if (filtering || !collapsed.has(minor.id)) {
      resultRows.push(...childRows);
    }
    return { rows: resultRows, matched: true };
  }

  for (const major of majorGroups) {
    const childRows: FlatRow[] = [];
    let anyMinorMatched = false;

    for (const minor of major.children) {
      const result = walkMinor(minor, major.id);
      if (result.matched) {
        anyMinorMatched = true;
        childRows.push(...result.rows);
      }
    }

    const majorMatched = major.saaob.name.toLowerCase().includes(q);
    const matched = !filtering || majorMatched || anyMinorMatched;
    if (!matched) continue;

    rows.push({ kind: "major", id: major.id, data: major });
    if (filtering || !collapsed.has(major.id)) {
      rows.push(...childRows);
    }
  }

  return rows;
}

function collectMinorGroups(majorGroups: PpmpMajorGroupResponse[]): PpmpMinorGroupResponse[] {
  const output: PpmpMinorGroupResponse[] = [];
  for (const major of majorGroups) {
    output.push(...major.children);
  }
  return output;
}

function collectProjectGroups(majorGroups: PpmpMajorGroupResponse[]): PpmpProjectGroupResponse[] {
  const output: PpmpProjectGroupResponse[] = [];
  for (const major of majorGroups) {
    for (const minor of major.children) {
      for (const child of minor.children) {
        if ("title" in child) output.push(child);
      }
    }
  }
  return output;
}

function labelForRow(row: FlatRow): string {
  if (row.kind === "major") return `Major: ${row.data.saaob.name}`;
  if (row.kind === "minor") return `Minor: ${row.data.lbac.name}`;
  if (row.kind === "project") return `Project: ${row.data.title}`;
  return `Item: ${row.data.generalDescription ?? row.data.quantityOrSize}`;
}

function humanizeTypeOfProject(value: PpmpPlanItemResponse["typeOfProject"]): string {
  if (value === "goods") return "Goods";
  if (value === "infra") return "Infrastructure";
  return "Consulting Services";
}

function monthToApiIso(value: string): string {
  return `${value}-01T00:00:00+08:00`;
}

function toMonthInput(value: string | null): string {
  if (!value) return "";
  const monthYear = DateTime.fromFormat(value, "LLLL yyyy");
  if (monthYear.isValid) return monthYear.toFormat("yyyy-LL");

  const monthOnly = DateTime.fromFormat(value, "LLLL");
  if (monthOnly.isValid) {
    return monthOnly.set({ year: DateTime.now().year }).toFormat("yyyy-LL");
  }
  return "";
}

function formatMonthYearLabel(value: string | null): string {
  if (!value) return "—";
  const monthYear = DateTime.fromFormat(value, "LLLL yyyy");
  if (monthYear.isValid) return monthYear.toFormat("LLLL yyyy");

  const iso = DateTime.fromISO(value);
  if (iso.isValid) return iso.toFormat("LLLL yyyy");

  const monthOnly = DateTime.fromFormat(value, "LLLL");
  if (monthOnly.isValid) return monthOnly.toFormat("LLLL");
  return value;
}

function fmtMoney(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function txt(value: string | null | undefined): string {
  return value ?? "—";
}
