'use client';

import {useVirtualizer} from '@tanstack/react-virtual';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  MoveRight,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import {useCallback, useId, useMemo, useRef, useState} from 'react';
import useSWR from 'swr';

import {ExportCollPerfDialog} from '@/app/(user_required)/(verified_only)/(lbac_users)/export-coll-perf-dialog';
import {ManageTemplatesDialog} from '@/app/(user_required)/(verified_only)/(lbac_users)/manage-templates-dialog';
import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import Typography from '@/components/typography';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {ScrollArea} from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  CollPerfGroupResponse,
  CollPerfGroupTotals,
  CollPerfItemResponse,
  CollPerfMonthlyData,
  CollPerfResponse,
} from '@/lib/http/client/responses';

const TOTAL_ROOT_BG = '#FFFF99';
const TOTAL_DEPTH1_BG = '#CCFFFF';
const TOTAL_DEEPER_BG = '#FDE9D9';
const GROUP_ROOT_BG = '#0B5394';
const GROUP_CHILD_BG = '#26a69a';
const INDENT_BASE_PX = 12;
const INDENT_PER_DEPTH_PX = 20;

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

const TOTAL_COLS = 22;

type DialogMode =
  | 'add-group'
  | 'edit-group'
  | 'add-item'
  | 'edit-item'
  | 'move-group'
  | 'move-item'
  | null;

type SelectableRow =
  | {kind: 'group'; id: string; depth: number; data: CollPerfGroupResponse}
  | {kind: 'item'; id: string; depth: number; groupId: string; data: CollPerfItemResponse};

type FlatRow =
  | SelectableRow
  | {
      kind: 'group-total';
      id: string;
      depth: number;
      groupId: string;
      data: CollPerfGroupTotals;
      isRoot: boolean;
    };

export default function Page() {
  const currentYear = useMemo(() => _getUtc8Year(), []);
  const defaultQuarter = useMemo(() => _getUtc8Quarter(), []);

  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<CollPerfResponse, ApiResponseException>
  >('/api/lbac/coll-perf', $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState<SelectableRow | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [manageTemplatesOpen, setManageTemplatesOpen] = useState(false);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);
  const allGroups = useMemo(() => collectCollPerfGroups(tree), [tree]);

  const matchingGroupIds = useMemo(
    () => (searchQuery.trim() ? collectMatchingGroupIds(tree, searchQuery) : new Set<string>()),
    [tree, searchQuery],
  );

  const flatRows = useMemo(
    () => flattenVisible(tree, collapsed, 0, searchQuery, matchingGroupIds),
    [tree, collapsed, searchQuery, matchingGroupIds],
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

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleRowClick = useCallback((row: SelectableRow) => {
    setSelectedRow((prev) => (prev?.id === row.id ? null : row));
  }, []);

  const handleRowDoubleClick = useCallback((row: SelectableRow) => {
    setSelectedRow(row);
    setDialogMode(row.kind === 'group' ? 'edit-group' : 'edit-item');
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;
    const label =
      selectedRow.kind === 'group'
        ? `group "${selectedRow.data.name}"`
        : `item "${selectedRow.data.particulars}"`;
    if (!confirm(`Delete this ${label}? This cannot be undone.`)) return;

    const url =
      selectedRow.kind === 'group'
        ? `/api/lbac/coll-perf/groups/${selectedRow.id}`
        : `/api/lbac/coll-perf/items/${selectedRow.id}`;

    const res = await fetch(url, {method: 'DELETE'});
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      alert(payload?.message ?? 'Failed to delete. Please try again.');
      return;
    }
    setSelectedRow(null);
    mutate();
  }, [selectedRow, mutate]);

  const closeDialog = useCallback(() => setDialogMode(null), []);
  const onSuccess = useCallback(() => {
    mutate();
    closeDialog();
  }, [mutate, closeDialog]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  const selectedItem = selectedRow?.kind === 'item' ? selectedRow.data : null;
  const selectedGroup = selectedRow?.kind === 'group' ? selectedRow.data : null;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full flex-wrap">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-64 text-xs"
            placeholder="Search particulars, account code…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogMode('add-group')}
        >
          <Plus className="size-3" />
          Group
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={allGroups.length === 0}
          onClick={() => setDialogMode('add-item')}
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
            setDialogMode(selectedRow.kind === 'group' ? 'edit-group' : 'edit-item');
          }}
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selectedRow?.kind !== 'item'}
          onClick={() => {
            if (selectedRow?.kind !== 'item') return;
            setDialogMode('move-item');
          }}
        >
          <MoveRight className="size-3" />
          Move Item
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={selectedRow?.kind !== 'group'}
          onClick={() => {
            if (selectedRow?.kind !== 'group') return;
            setDialogMode('move-group');
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
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setManageTemplatesOpen(true)}
        >
          <FileSpreadsheet className="size-3" />
          Templates
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setExportOpen(true)}
        >
          <Download className="size-3" />
          Export
        </Button>
        {selectedRow && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {selectedRow.kind === 'group'
              ? `Group: ${selectedRow.data.name}`
              : `Item: ${selectedRow.data.particulars.slice(0, 40)}${selectedRow.data.particulars.length > 40 ? '…' : ''}`}
          </Badge>
        )}
      </div>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery
              ? 'No results match your search.'
              : 'No collection performance records found.'}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-[#D4F3F3]">
                <TableRow>
                  <TableHead
                    rowSpan={2}
                    className="min-w-[220px] align-middle border-l whitespace-normal break-words"
                  >
                    Particulars
                  </TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle">
                    Account Code
                  </TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle text-right">
                    Income Target
                  </TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle text-right">
                    Total Collection
                  </TableHead>
                  <TableHead rowSpan={2} className="min-w-32 align-middle text-right">
                    Collection Performance
                  </TableHead>
                  <TableHead rowSpan={2} className="min-w-28 align-middle text-right">
                    Excess/Deficit
                  </TableHead>
                  <TableHead colSpan={12} className="text-center border-b">
                    Monthly
                  </TableHead>
                  <TableHead colSpan={4} className="text-center border-b">
                    Quarterly
                  </TableHead>
                </TableRow>
                <TableRow>
                  {MONTH_LABELS.map((label) => (
                    <TableHead key={label} className="min-w-24 text-right">
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-24 text-right">Q1</TableHead>
                  <TableHead className="min-w-24 text-right">Q2</TableHead>
                  <TableHead className="min-w-24 text-right">Q3</TableHead>
                  <TableHead className="min-w-24 text-right">Q4</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{height: `${paddingTop}px`}} />
                  </TableRow>
                )}
                {virtualRows.map((vr) => {
                  const row = flatRows[vr.index]!;

                  if (row.kind === 'group') {
                    const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                    const isSelected = selectedRow?.id === row.id;
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className={`cursor-pointer select-none text-white ${isSelected ? 'outline outline-2 outline-primary' : ''}`}
                        style={{backgroundColor: row.depth === 0 ? GROUP_ROOT_BG : GROUP_CHILD_BG}}
                        onClick={() => handleRowClick(row)}
                        onDoubleClick={() => handleRowDoubleClick(row)}
                      >
                        <TableCell
                          className="min-w-[220px] whitespace-normal break-words"
                          style={particularsIndentStyle(row.depth)}
                        >
                          <button
                            type="button"
                            className="flex items-center gap-1 font-semibold uppercase text-white text-left hover:opacity-80 w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapse(row.id);
                            }}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="size-3 shrink-0" />
                            ) : (
                              <ChevronDown className="size-3 shrink-0" />
                            )}
                            <span>{row.data.name}</span>
                          </button>
                        </TableCell>
                        <TableCell colSpan={TOTAL_COLS - 1} />
                      </TableRow>
                    );
                  }

                  if (row.kind === 'group-total') {
                    const label = row.isRoot ? 'Grand Total' : 'Total';
                    return (
                      <TableRow
                        ref={rowVirtualizer.measureElement}
                        key={row.id}
                        data-index={vr.index}
                        className="font-bold"
                        style={{backgroundColor: totalRowBackground(row.depth, row.isRoot)}}
                      >
                        <TableCell
                          className="min-w-[220px] whitespace-normal break-words font-semibold"
                          style={particularsIndentStyle(row.depth)}
                        >
                          {label}
                        </TableCell>
                        <CollPerfNumericCells data={row.data} accountCodeCell="" />
                      </TableRow>
                    );
                  }

                  const item = row.data;
                  const isSelected = selectedRow?.id === row.id;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${_collPerfRowClass(item.collectionPerformance, isSelected)}`}
                      title="Double-click to edit"
                      onClick={() => handleRowClick(row)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    >
                      <TableCell
                        className="min-w-[220px] whitespace-normal break-words"
                        style={particularsIndentStyle(row.depth)}
                      >
                        {item.particulars}
                      </TableCell>
                      <CollPerfNumericCells data={item} accountCodeCell={txt(item.accountCode)} />
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{height: `${paddingBottom}px`}} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {dialogMode === 'add-group' && (
        <GroupFormDialog
          mode="add"
          allGroups={allGroups}
          defaultParentId={selectedRow?.kind === 'group' ? selectedRow.id : undefined}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === 'edit-group' && selectedGroup && (
        <GroupFormDialog
          mode="edit"
          editGroup={selectedGroup}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === 'add-item' && (
        <ItemFormDialog
          mode="add"
          currentYear={currentYear}
          allGroups={allGroups}
          defaultGroupId={selectedRow?.kind === 'group' ? selectedRow.id : undefined}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === 'edit-item' && selectedItem && (
        <ItemFormDialog
          mode="edit"
          currentYear={currentYear}
          editItem={selectedItem}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === 'move-item' && selectedRow?.kind === 'item' && (
        <MoveItemDialog
          itemRow={selectedRow}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
      {dialogMode === 'move-group' && selectedRow?.kind === 'group' && (
        <MoveGroupDialog
          groupRow={selectedRow}
          tree={tree}
          allGroups={allGroups}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      <ManageTemplatesDialog
        open={manageTemplatesOpen}
        onOpenChange={setManageTemplatesOpen}
        apiPath="/api/lbac/templates/coll-perf"
        title="Manage Export Footer"
        description="Upload or replace the Excel footer template appended to collection performance exports (LBac Form No. 1)."
        templateSections={['footer']}
      />

      <ExportCollPerfDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        exportApiBase="/api/lbac/export/coll-perf"
        tree={tree}
        year={currentYear}
        defaultQuarter={defaultQuarter}
      />
    </div>
  );
}

function GroupFormDialog({
  mode,
  editGroup,
  allGroups,
  defaultParentId,
  onSuccess,
  onClose,
}: {
  mode: 'add' | 'edit';
  editGroup?: CollPerfGroupResponse;
  allGroups: CollPerfGroupResponse[];
  defaultParentId?: string;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [name, setName] = useState(editGroup?.name ?? '');
  const [parentId, setParentId] = useState(defaultParentId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;
    if (!name.trim()) {
      setActionError('Group name is required.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const body: Record<string, unknown> = {name: name.trim()};
      if (mode === 'add' && parentId) {
        body.parentId = parentId;
      }
      const res = await fetch(
        mode === 'add'
          ? '/api/lbac/coll-perf/groups'
          : `/api/lbac/coll-perf/groups/${editGroup!.id}`,
        {
          method: mode === 'add' ? 'POST' : 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? 'Failed to save group. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      setActionError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Group' : 'Edit Group'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Create a new collection performance group.'
              : `Editing group: ${editGroup?.name}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-name`}>Group Name *</Label>
            <Input
              id={`${baseId}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              placeholder="Group name"
            />
          </div>
          {mode === 'add' && (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-parent`}>Parent Group</Label>
              <Select
                value={parentId || '__root__'}
                onValueChange={(v) => setParentId(v === '__root__' ? '' : v)}
                disabled={submitting}
              >
                <SelectTrigger id={`${baseId}-parent`}>
                  <SelectValue placeholder="Root (no parent)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__root__">Root (no parent)</SelectItem>
                  {allGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {actionError && (
          <Typography variant="small" className="text-destructive">
            {actionError}
          </Typography>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : mode === 'add' ? 'Create Group' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ItemFormDialog({
  mode,
  editItem,
  allGroups,
  defaultGroupId,
  currentYear,
  onSuccess,
  onClose,
}: {
  mode: 'add' | 'edit';
  editItem?: CollPerfItemResponse;
  allGroups: CollPerfGroupResponse[];
  defaultGroupId?: string;
  currentYear: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [parentId, setParentId] = useState(defaultGroupId ?? '');
  const [particulars, setParticulars] = useState(editItem?.particulars ?? '');
  const [accountCode, setAccountCode] = useState(editItem?.accountCode ?? '');
  const [incomeTarget, setIncomeTarget] = useState(editItem?.incomeTarget ?? '');
  const [monthlyValues, setMonthlyValues] = useState<Record<number, string>>(() =>
    buildMonthlyValueMap(editItem?.monthlyData),
  );
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;
    if (!particulars.trim()) {
      setActionError('Particulars is required.');
      return;
    }
    if (mode === 'add' && !parentId) {
      setActionError('Please select a parent group.');
      return;
    }
    if (!incomeTarget.trim() || Number.isNaN(Number(incomeTarget))) {
      setActionError('Income target must be a valid number.');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    try {
      const monthlyData = MONTH_NUMBERS.map((month) => ({
        month,
        year: currentYear,
        value: monthlyValues[month]?.trim() || '0',
      }));

      const body: Record<string, unknown> = {
        particulars: particulars.trim(),
        accountCode: accountCode.trim() || null,
        incomeTarget: incomeTarget.trim(),
        monthlyData,
      };

      let res: Response;
      if (mode === 'add') {
        res = await fetch('/api/lbac/coll-perf/items', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({parentId, ...body}),
        });
      } else {
        res = await fetch(`/api/lbac/coll-perf/items/${editItem!.id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? 'Failed to save item. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      setActionError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Item' : 'Edit Item'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Create a collection performance item with monthly values for the current year.'
              : `Editing: ${editItem?.particulars}`}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-1">
          <div className="flex flex-col gap-4">
            {mode === 'add' && (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-parent`}>Parent Group *</Label>
                <Select value={parentId} onValueChange={setParentId} disabled={submitting}>
                  <SelectTrigger id={`${baseId}-parent`}>
                    <SelectValue placeholder="Select group..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-particulars`}>Particulars *</Label>
              <Input
                id={`${baseId}-particulars`}
                value={particulars}
                onChange={(e) => setParticulars(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-account`}>Account Code</Label>
              <Input
                id={`${baseId}-account`}
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-income`}>Income Target *</Label>
              <Input
                id={`${baseId}-income`}
                value={incomeTarget}
                onChange={(e) => setIncomeTarget(e.target.value)}
                disabled={submitting}
                className="font-mono"
                inputMode="decimal"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Monthly Collection ({currentYear})</Label>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MONTH_NUMBERS.map((month, idx) => (
                  <div key={month} className="flex flex-col gap-1">
                    <Label
                      htmlFor={`${baseId}-m${month}`}
                      className="text-xs text-muted-foreground"
                    >
                      {MONTH_LABELS[idx]}
                    </Label>
                    <Input
                      id={`${baseId}-m${month}`}
                      value={monthlyValues[month] ?? ''}
                      onChange={(e) =>
                        setMonthlyValues((prev) => ({...prev, [month]: e.target.value}))
                      }
                      disabled={submitting}
                      className="font-mono text-right h-8 text-xs"
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              <Typography variant="small" className="text-muted-foreground">
                Quarterly totals, collection performance, and excess/deficit are calculated
                automatically after save.
              </Typography>
            </div>
          </div>
        </ScrollArea>
        {actionError && (
          <Typography variant="small" className="text-destructive">
            {actionError}
          </Typography>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Saving...' : mode === 'add' ? 'Create Item' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveItemDialog({
  itemRow,
  allGroups,
  onSuccess,
  onClose,
}: {
  itemRow: Extract<SelectableRow, {kind: 'item'}>;
  allGroups: CollPerfGroupResponse[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [targetGroupId, setTargetGroupId] = useState(itemRow.groupId);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;
    if (!targetGroupId) {
      setActionError('Please select a target group.');
      return;
    }
    if (targetGroupId === itemRow.groupId) {
      onClose();
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/lbac/coll-perf/items/${itemRow.id}/move`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({parentId: targetGroupId}),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? 'Failed to move item. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      setActionError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Item</DialogTitle>
          <DialogDescription>
            Move &ldquo;{itemRow.data.particulars}&rdquo; to a different group.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-target`}>Target Group</Label>
          <Select value={targetGroupId} onValueChange={setTargetGroupId} disabled={submitting}>
            <SelectTrigger id={`${baseId}-target`}>
              <SelectValue placeholder="Select target group..." />
            </SelectTrigger>
            <SelectContent>
              {allGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {actionError && (
          <Typography variant="small" className="text-destructive">
            {actionError}
          </Typography>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Moving...' : 'Move Item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveGroupDialog({
  groupRow,
  tree,
  allGroups,
  onSuccess,
  onClose,
}: {
  groupRow: Extract<SelectableRow, {kind: 'group'}>;
  tree: CollPerfGroupResponse[];
  allGroups: CollPerfGroupResponse[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [targetGroupId, setTargetGroupId] = useState<string>('__root__');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const excludedIds = useMemo(() => {
    const ids = new Set<string>([groupRow.id]);
    const node = findGroupInTree(tree, groupRow.id);
    if (node) {
      for (const descendantId of collectDescendantGroupIds(node)) {
        ids.add(descendantId);
      }
    }
    return ids;
  }, [groupRow.id, tree]);

  const eligibleGroups = allGroups.filter((g) => !excludedIds.has(g.id));

  const handleSave = async () => {
    if (submitting) return;
    setSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/lbac/coll-perf/groups/${groupRow.id}/move`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          parentId: targetGroupId === '__root__' ? null : targetGroupId,
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setActionError(payload?.message ?? 'Failed to move group. Please try again.');
        return;
      }
      onSuccess();
    } catch {
      setActionError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Group</DialogTitle>
          <DialogDescription>
            Move &ldquo;{groupRow.data.name}&rdquo; to a different parent group, or to the root
            level.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-target`}>Target Parent</Label>
          <Select value={targetGroupId} onValueChange={setTargetGroupId} disabled={submitting}>
            <SelectTrigger id={`${baseId}-target`}>
              <SelectValue placeholder="Select target..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">Root (no parent)</SelectItem>
              {eligibleGroups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {actionError && (
          <Typography variant="small" className="text-destructive">
            {actionError}
          </Typography>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? 'Moving...' : 'Move Group'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function findGroupInTree(
  nodes: (CollPerfGroupResponse | CollPerfItemResponse)[],
  id: string,
): CollPerfGroupResponse | null {
  for (const node of nodes) {
    if (node.type === 6780) {
      const group = node as CollPerfGroupResponse;
      if (group.id === id) return group;
      const found = findGroupInTree(group.children, id);
      if (found) return found;
    }
  }
  return null;
}

function collectDescendantGroupIds(group: CollPerfGroupResponse): string[] {
  const result: string[] = [];
  const walk = (node: CollPerfGroupResponse) => {
    for (const child of node.children) {
      if (child.type === 6780) {
        const childGroup = child as CollPerfGroupResponse;
        result.push(childGroup.id);
        walk(childGroup);
      }
    }
  };
  walk(group);
  return result;
}

function buildMonthlyValueMap(monthlyData?: CollPerfMonthlyData[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const month of MONTH_NUMBERS) {
    map[month] = '';
  }
  if (monthlyData) {
    for (const entry of monthlyData) {
      map[entry.month] = entry.value;
    }
  }
  return map;
}

function collectCollPerfGroups(
  nodes: (CollPerfGroupResponse | CollPerfItemResponse)[],
  result: CollPerfGroupResponse[] = [],
): CollPerfGroupResponse[] {
  for (const node of nodes) {
    if (node.type === 6780) {
      const group = node as CollPerfGroupResponse;
      result.push(group);
      collectCollPerfGroups(group.children, result);
    }
  }
  return result;
}

function CollPerfNumericCells({
  data,
  accountCodeCell,
}: {
  data: CollPerfItemResponse | CollPerfGroupTotals;
  accountCodeCell: string;
}) {
  return (
    <>
      <TableCell>{accountCodeCell}</TableCell>
      <TableCell className="text-right font-mono">{fmt(data.incomeTarget)}</TableCell>
      <TableCell className="text-right font-mono">{fmt(data.totalCollection)}</TableCell>
      <TableCell className="text-right font-mono">
        {fmtPercent(data.collectionPerformance)}
      </TableCell>
      <TableCell className="text-right font-mono">{fmt(data.excessOrDeficit)}</TableCell>
      {MONTH_NUMBERS.map((month) => (
        <TableCell key={month} className="text-right font-mono">
          {fmt(monthValue(data.monthlyData, month))}
        </TableCell>
      ))}
      <TableCell className="text-right font-mono">{fmt(data.quarterlyData.q1)}</TableCell>
      <TableCell className="text-right font-mono">{fmt(data.quarterlyData.q2)}</TableCell>
      <TableCell className="text-right font-mono">{fmt(data.quarterlyData.q3)}</TableCell>
      <TableCell className="text-right font-mono">{fmt(data.quarterlyData.q4)}</TableCell>
    </>
  );
}

function particularsIndentStyle(depth: number): {paddingLeft: string} {
  return {paddingLeft: `${INDENT_BASE_PX + depth * INDENT_PER_DEPTH_PX}px`};
}

function totalRowBackground(depth: number, isRoot: boolean): string {
  if (isRoot) return TOTAL_ROOT_BG;
  if (depth === 1) return TOTAL_DEPTH1_BG;
  return TOTAL_DEEPER_BG;
}

function monthValue(monthlyData: CollPerfMonthlyData[], month: number): string | undefined {
  return monthlyData.find((m) => m.month === month)?.value;
}

function collectMatchingGroupIds(
  nodes: (CollPerfGroupResponse | CollPerfItemResponse)[],
  query: string,
): Set<string> {
  const matched = new Set<string>();
  function walk(
    nodes2: (CollPerfGroupResponse | CollPerfItemResponse)[],
    ancestors: string[],
  ): boolean {
    let anyMatch = false;
    for (const node of nodes2) {
      if (node.type === 6780) {
        const g = node as CollPerfGroupResponse;
        const childMatch = walk(g.children, [...ancestors, g.id]);
        if (childMatch) {
          matched.add(g.id);
          for (const a of ancestors) matched.add(a);
          anyMatch = true;
        }
      } else if (itemMatchesQuery(node as CollPerfItemResponse, query)) {
        for (const a of ancestors) matched.add(a);
        anyMatch = true;
      }
    }
    return anyMatch;
  }
  walk(nodes, []);
  return matched;
}

function itemMatchesQuery(item: CollPerfItemResponse, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.particulars.toLowerCase().includes(q) ||
    (item.accountCode?.toLowerCase().includes(q) ?? false)
  );
}

function flattenVisible(
  nodes: (CollPerfGroupResponse | CollPerfItemResponse)[],
  collapsed: Set<string>,
  depth: number,
  query: string,
  matchingGroupIds: Set<string>,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const filtering = query.trim().length > 0;

  for (const node of nodes) {
    if (node.type === 6780) {
      const group = node as CollPerfGroupResponse;
      if (filtering && !matchingGroupIds.has(group.id)) continue;
      rows.push({kind: 'group', id: group.id, depth, data: group});
      const shouldExpand = filtering || !collapsed.has(group.id);
      if (shouldExpand) {
        for (const child of group.children) {
          if (child.type === 6781) {
            const item = child as CollPerfItemResponse;
            if (filtering && !itemMatchesQuery(item, query)) continue;
            rows.push({kind: 'item', id: item.id, depth: depth + 1, groupId: group.id, data: item});
          } else {
            rows.push(...flattenVisible([child], collapsed, depth + 1, query, matchingGroupIds));
          }
        }
        rows.push({
          kind: 'group-total',
          id: `total-${group.id}`,
          depth,
          groupId: group.id,
          data: group.totals,
          isRoot: depth === 0,
        });
      }
    }
  }
  return rows;
}

function fmt(val: string | null | undefined): string {
  if (!val) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return val;
  return n.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function fmtPercent(val: string | null | undefined): string {
  if (!val) return '—';
  const n = Number(val);
  if (Number.isNaN(n)) return val;
  return `${n.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}%`;
}

function txt(val: string | null | undefined): string {
  return val ?? '—';
}

function _collPerfRowClass(collectionPerformance: string | undefined, isSelected: boolean): string {
  if (isSelected) return 'bg-accent';
  const pct = Number(collectionPerformance);
  if (Number.isNaN(pct)) return '';
  if (pct < 0) return 'bg-red-50 hover:bg-red-100/80';
  if (Math.abs(pct - 100) < 0.01) return 'bg-green-50 hover:bg-green-100/80';
  return '';
}

function _getUtc8Year(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}

function _getUtc8Quarter(): number {
  const month = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCMonth();
  return Math.floor(month / 3) + 1;
}
