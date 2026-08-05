'use client';

import {useVirtualizer} from '@tanstack/react-virtual';
import {ChevronDown, ChevronRight, Download, Pencil, Plus, Search, Trash2} from 'lucide-react';
import {useCallback, useId, useMemo, useRef, useState} from 'react';
import useSWR from 'swr';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Textarea} from '@/components/ui/textarea';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  LbacF4ItemResponse,
  LbacF4Response,
} from '@/lib/http/client/responses';

const INDENT_BASE_PX = 12;
const INDENT_PER_DEPTH_PX = 20;
const TOTAL_COLS = 7;

type FlatRow = {
  kind: 'item';
  id: string;
  depth: number;
  data: LbacF4ItemResponse;
};

type DialogMode = 'add' | 'edit' | null;

export default function Page() {
  const currentYear = useMemo(() => _getUtc8Year(), []);
  const [fiscalYear, setFiscalYear] = useState(currentYear);

  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<LbacF4Response, ApiResponseException>
  >(`/api/lbac/f4?forFiscalYear=${fiscalYear}`, $fetch);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRow, setSelectedRow] = useState<FlatRow | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const tree = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);

  const flatRows = useMemo(
    () => flattenVisible(tree, collapsed, 0, searchQuery),
    [tree, collapsed, searchQuery],
  );

  const parentOptions = useMemo(() => collectAllItems(tree), [tree]);

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

  const handleRowClick = useCallback((row: FlatRow) => {
    setSelectedRow((prev) => (prev?.id === row.id ? null : row));
  }, []);

  const handleRowDoubleClick = useCallback((row: FlatRow) => {
    setSelectedRow(row);
    setDialogMode('edit');
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedRow) return;
    const label = selectedRow.data.particulars;
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/lbac/f4/${selectedRow.id}`, {method: 'DELETE'});
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      alert(
        (payload as Record<string, string> | null)?.details ??
          (payload as Record<string, string> | null)?.message ??
          'Failed to delete. Please try again.',
      );
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

  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear + 1; y >= currentYear - 5; y--) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full flex-wrap">
        <div className="flex items-center gap-2 mr-2">
          <Label htmlFor="fiscal-year" className="text-xs whitespace-nowrap">
            Fiscal Year
          </Label>
          <Select
            value={String(fiscalYear)}
            onValueChange={(v) => {
              setFiscalYear(Number(v));
              setSelectedRow(null);
            }}
          >
            <SelectTrigger id="fiscal-year" className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
          onClick={() => setDialogMode('add')}
        >
          <Plus className="size-3" />
          Add
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          title="Edit selected"
          disabled={!selectedRow}
          onClick={() => {
            if (!selectedRow) return;
            setDialogMode('edit');
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

        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled
            title="Export will be available in a future update"
          >
            <Download className="size-3" />
            Export
          </Button>
        </div>

        {selectedRow && (
          <Badge variant="secondary" className="text-xs">
            {`Item: ${selectedRow.data.particulars.slice(0, 40)}${selectedRow.data.particulars.length > 40 ? '…' : ''}`}
          </Badge>
        )}
      </div>

      <div className="border rounded-lg p-2">
        {flatRows.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery
              ? 'No results match your search.'
              : 'No F4 records found for this fiscal year.'}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-10rem)] overflow-auto **:data-[slot=table-container]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-[#FFF2CC]">
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
                  <TableHead colSpan={2} className="text-center border-b">
                    Amounts
                  </TableHead>
                  <TableHead colSpan={2} className="text-center border-b">
                    Variance
                  </TableHead>
                  <TableHead
                    rowSpan={2}
                    className="min-w-[200px] align-middle whitespace-normal break-words"
                  >
                    Remarks
                  </TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="min-w-28 text-right">Estimate</TableHead>
                  <TableHead className="min-w-28 text-right">Actual</TableHead>
                  <TableHead className="min-w-28 text-right">Amounts</TableHead>
                  <TableHead className="min-w-24 text-right">%</TableHead>
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
                  const hasChildren = row.data.children.length > 0;
                  const isCollapsed = collapsed.has(row.id) && !searchQuery.trim();
                  const isSelected = selectedRow?.id === row.id;

                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={row.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${isSelected ? 'outline outline-2 outline-primary bg-muted/30' : ''}`}
                      onClick={() => handleRowClick(row)}
                      onDoubleClick={() => handleRowDoubleClick(row)}
                    >
                      <TableCell
                        className="min-w-[220px] whitespace-normal break-words"
                        style={particularsIndentStyle(row.depth)}
                      >
                        {hasChildren ? (
                          <button
                            type="button"
                            className="flex items-center gap-1 text-left hover:opacity-80 w-full"
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
                            <span>{row.data.particulars}</span>
                          </button>
                        ) : (
                          <span>{row.data.particulars}</span>
                        )}
                      </TableCell>
                      <TableCell>{txt(row.data.accountCode)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(row.data.estimate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmt(row.data.actual)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(row.data.varianceAmounts)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtPercent(row.data.variancePercentage)}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words">
                        {txt(row.data.remarks)}
                      </TableCell>
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

      {dialogMode && (
        <F4ItemFormDialog
          mode={dialogMode}
          fiscalYear={fiscalYear}
          editItem={dialogMode === 'edit' ? selectedRow?.data : undefined}
          defaultParentId={dialogMode === 'add' ? selectedRow?.id : undefined}
          parentOptions={parentOptions}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function F4ItemFormDialog({
  mode,
  fiscalYear,
  editItem,
  defaultParentId,
  parentOptions,
  onSuccess,
  onClose,
}: {
  mode: 'add' | 'edit';
  fiscalYear: number;
  editItem?: LbacF4ItemResponse;
  defaultParentId?: string;
  parentOptions: Array<{id: string; label: string}>;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();
  const [parentId, setParentId] = useState(defaultParentId ?? '');
  const [particulars, setParticulars] = useState(editItem?.particulars ?? '');
  const [accountCode, setAccountCode] = useState(editItem?.accountCode ?? '');
  const [estimate, setEstimate] = useState(editItem?.estimate ?? '');
  const [actual, setActual] = useState(editItem?.actual ?? '');
  const [remarks, setRemarks] = useState(editItem?.remarks ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSave = async () => {
    if (submitting) return;
    if (!particulars.trim()) {
      setActionError('Particulars is required.');
      return;
    }

    if (estimate.trim() && Number.isNaN(Number(estimate))) {
      setActionError('Estimate must be a valid number.');
      return;
    }

    if (actual.trim() && Number.isNaN(Number(actual))) {
      setActionError('Actual must be a valid number.');
      return;
    }

    setSubmitting(true);
    setActionError(null);

    try {
      if (mode === 'add') {
        const content: Record<string, unknown> = {
          particulars: particulars.trim(),
          accountCode: accountCode.trim() || undefined,
          estimate: estimate.trim() || undefined,
          actual: actual.trim() || undefined,
          remarks: remarks.trim() || undefined,
        };

        if (parentId) {
          content.parentId = parentId;
        }

        const res = await fetch('/api/lbac/f4', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            forFiscalYear: fiscalYear,
            contents: [content],
          }),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          setActionError(
            (payload as Record<string, string> | null)?.details ??
              (payload as Record<string, string> | null)?.message ??
              'Failed to create item. Please try again.',
          );
          return;
        }
      } else {
        const body: Record<string, unknown> = {
          particulars: particulars.trim(),
          accountCode: accountCode.trim() || null,
          estimate: estimate.trim() || null,
          actual: actual.trim() || null,
          remarks: remarks.trim() || null,
        };

        const res = await fetch(`/api/lbac/f4/${editItem!.id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          setActionError(
            (payload as Record<string, string> | null)?.details ??
              (payload as Record<string, string> | null)?.message ??
              'Failed to update item. Please try again.',
          );
          return;
        }
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
      <DialogContent className="max-w-lg max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add F4 Item' : 'Edit F4 Item'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? `Create a statement line for fiscal year ${fiscalYear}.`
              : `Editing: ${editItem?.particulars}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {mode === 'add' && (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-parent`}>Parent Item</Label>
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
                  {parentOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-estimate`}>Estimate</Label>
              <Input
                id={`${baseId}-estimate`}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                disabled={submitting}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-actual`}>Actual</Label>
              <Input
                id={`${baseId}-actual`}
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                disabled={submitting}
                className="font-mono"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-remarks`}>Remarks</Label>
            <Textarea
              id={`${baseId}-remarks`}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              disabled={submitting}
              rows={3}
            />
          </div>
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
            {submitting ? 'Saving...' : mode === 'add' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function collectAllItems(
  nodes: LbacF4ItemResponse[],
  depth = 0,
): Array<{id: string; label: string}> {
  const options: Array<{id: string; label: string}> = [];
  const prefix = depth > 0 ? `${'  '.repeat(depth)}└ ` : '';

  for (const node of nodes) {
    options.push({
      id: node.id,
      label: `${prefix}${node.particulars}`,
    });
    options.push(...collectAllItems(node.children, depth + 1));
  }

  return options;
}

function flattenVisible(
  nodes: LbacF4ItemResponse[],
  collapsed: Set<string>,
  depth: number,
  query: string,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const q = query.trim().toLowerCase();
  const filtering = q.length > 0;

  for (const node of nodes) {
    const matches = !filtering || itemMatchesQuery(node, q);
    const childRows = flattenVisible(node.children, collapsed, depth + 1, query);
    const childMatches = childRows.length > 0;

    if (!matches && !childMatches) {
      continue;
    }

    rows.push({kind: 'item', id: node.id, depth, data: node});

    const shouldExpand = filtering || !collapsed.has(node.id);
    if (shouldExpand && node.children.length > 0) {
      rows.push(...childRows);
    }
  }

  return rows;
}

function itemMatchesQuery(item: LbacF4ItemResponse, query: string): boolean {
  return (
    item.particulars.toLowerCase().includes(query) ||
    (item.accountCode?.toLowerCase().includes(query) ?? false) ||
    (item.remarks?.toLowerCase().includes(query) ?? false)
  );
}

function particularsIndentStyle(depth: number): {paddingLeft: string} {
  return {paddingLeft: `${INDENT_BASE_PX + depth * INDENT_PER_DEPTH_PX}px`};
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

function _getUtc8Year(): number {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
}
