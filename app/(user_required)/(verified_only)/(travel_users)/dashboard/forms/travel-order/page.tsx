'use client';

import {useVirtualizer} from '@tanstack/react-virtual';
import {Check, Pencil, Plus, Printer, Search, Trash2} from 'lucide-react';
import {DateTime} from 'luxon';
import {useMemo, useRef, useState} from 'react';
import useSWR from 'swr';

import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
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
import {Separator} from '@/components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import * as permissions from '@/lib/db/permissions';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  TravelOrderItemResponse,
  TravelOrderListResponse,
  UserResponse,
} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

import {TravelOrderFormDialog} from './travel-order-form-dialog';
import {TravelOrderPrintDialog} from './travel-order-print-dialog';

const TOTAL_COLS = 16;

const STATUS_LABELS: Record<string, string> = {
  'co-hr': 'CO-HR',
  filed: 'Filed',
  missing: 'Missing',
  cancelled: 'Cancelled',
};

const CATEGORY_LABELS: Record<string, string> = {
  official: 'Official',
  personal: 'Personal',
};

function formatDateOfTravel(item: TravelOrderItemResponse): string {
  const startFormatted = DateTime.fromISO(item.startDate).toFormat('MMMM d, yyyy');
  if (!item.endDate) return startFormatted;
  const endFormatted = DateTime.fromISO(item.endDate).toFormat('MMMM d, yyyy');
  return `${startFormatted} \u2013 ${endFormatted}`;
}

function formatDate(isoString: string): string {
  return DateTime.fromISO(isoString).toFormat('MMMM d, yyyy');
}

export default function Page() {
  const {data: meData, isLoading: meLoading} = useSWR<
    BetterFetchResponse<UserResponse, ApiResponseException>
  >('/api/account/me', $fetch);

  const permissionMap = useMemo(
    () => new Set(meData?.data?.data?.office?.role?.permissions ?? []),
    [meData],
  );

  const canWrite = permissionMap.has(permissions.TRAVEL_WRITE);
  const canApprove = permissionMap.has(permissions.TRAVEL_APPROVER);

  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<TravelOrderListResponse, ApiResponseException>
  >('/api/forms/travel-order', $fetch);

  const [selectedItem, setSelectedItem] = useState<TravelOrderItemResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const fields = [
        String(item.refNumber),
        item.travelOrderStatus,
        item.requestor.name,
        item.requestor.office.name,
        item.requestor.officePosition.name,
        item.category,
        formatDate(item.date),
        formatDateOfTravel(item),
        item.location,
        item.purpose,
        item.notes ?? '',
        item.approvedBy?.name ?? '',
      ];
      return fields.some((f) => f.toLowerCase().includes(query));
    });
  }, [items, searchQuery]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: filteredItems.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0;

  async function handleDelete() {
    if (!selectedItem) return;
    setIsDeleting(true);
    try {
      const res = await $fetch<unknown, ApiResponseException>(
        `/api/forms/travel-order/${selectedItem.id}`,
        {method: 'DELETE'},
      );
      if (res.error) {
        alert('Failed to delete travel order. Please try again.');
        return;
      }
      setSelectedItem(null);
      setDeleteOpen(false);
      mutate();
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleApprove() {
    if (!selectedItem) return;
    setIsApproving(true);
    try {
      const res = await $fetch<unknown, ApiResponseException>(
        `/api/forms/travel-order/${selectedItem.id}/approve`,
        {method: 'POST'},
      );
      if (res.error) {
        alert('Failed to approve travel order. Please try again.');
        return;
      }
      setSelectedItem(null);
      setApproveOpen(false);
      mutate();
    } finally {
      setIsApproving(false);
    }
  }

  if (meLoading || isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full bg-card">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-72 text-xs"
            placeholder="Search travel orders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="New Travel Order"
          onClick={() => {
            setAddKey((k) => k + 1);
            setAddOpen(true);
          }}
        >
          <Plus />
        </Button>

        {canWrite && (
          <>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Edit"
              disabled={!selectedItem}
              onClick={() => {
                if (selectedItem) setEditOpen(true);
              }}
            >
              <Pencil />
            </Button>

            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Delete"
              disabled={!selectedItem}
              onClick={() => {
                if (selectedItem) setDeleteOpen(true);
              }}
            >
              <Trash2 />
            </Button>
          </>
        )}

        <Separator orientation="vertical" className="h-6 mx-1" />

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div
            className={cn(
              'hidden min-w-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors md:flex',
              selectedItem
                ? 'border-[oklch(0.78_0.06_258)] bg-[oklch(0.965_0.018_258)] text-foreground dark:border-[oklch(0.58_0.07_258)] dark:bg-[oklch(0.26_0.035_258)]'
                : 'border-transparent bg-muted/40 text-muted-foreground',
            )}
          >
            <Printer className="size-3.5 shrink-0" />
            {selectedItem ? (
              <>
                <span className="shrink-0 font-medium">Print target</span>
                <span className="truncate text-muted-foreground">
                  REF #{selectedItem.refNumber} - {selectedItem.requestor.name}
                </span>
              </>
            ) : (
              <span>Select a row to print</span>
            )}
          </div>

          <Button
            variant={selectedItem ? 'default' : 'outline'}
            size="sm"
            className={cn('h-8 gap-2', !selectedItem && 'px-2')}
            aria-label="Export Printable PDF"
            disabled={!selectedItem}
            onClick={() => {
              if (selectedItem) setPrintOpen(true);
            }}
          >
            <Printer />
            <span className="hidden sm:inline">Export PDF</span>
          </Button>
        </div>

        {canApprove && (
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Approve"
            disabled={!selectedItem}
            onClick={() => {
              if (selectedItem) setApproveOpen(true);
            }}
          >
            <Check />
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg p-2">
        {filteredItems.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No results match your search.' : 'No travel orders found.'}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="w-max min-w-full table-fixed text-xs [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-16 min-w-16">REF #</TableHead>
                  <TableHead className="w-24 min-w-24">TO Status</TableHead>
                  <TableHead className="w-36 min-w-36">Date</TableHead>
                  <TableHead className="w-40 min-w-40">Name</TableHead>
                  <TableHead className="w-40 min-w-40">Office</TableHead>
                  <TableHead className="w-40 min-w-40">Position</TableHead>
                  <TableHead className="w-24 min-w-24">Category</TableHead>
                  <TableHead className="w-56 min-w-56">Date of Travel</TableHead>
                  <TableHead className="w-24 min-w-24">No. of Days</TableHead>
                  <TableHead className="w-40 min-w-40">Location</TableHead>
                  <TableHead className="w-48 min-w-48">Purpose/Reason</TableHead>
                  <TableHead className="w-24 min-w-24">Time</TableHead>
                  <TableHead className="w-40 min-w-40">Claims</TableHead>
                  <TableHead className="w-40 min-w-40">Notes</TableHead>
                  <TableHead className="w-40 min-w-40">Approved By</TableHead>
                  <TableHead className="w-40 min-w-40">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{height: `${paddingTop}px`}} />
                  </TableRow>
                )}

                {virtualRows.map((vr) => {
                  const item = filteredItems[vr.index]!;
                  const selected = selectedItem?.id === item.id;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={item.id}
                      data-index={vr.index}
                      className={cn(
                        'cursor-pointer select-none transition-colors duration-150 ease-out',
                        selected
                          ? 'bg-[oklch(0.965_0.018_258)] shadow-[inset_0_0_0_1px_oklch(0.78_0.06_258)] hover:bg-[oklch(0.948_0.024_258)] dark:bg-[oklch(0.26_0.035_258)] dark:shadow-[inset_0_0_0_1px_oklch(0.58_0.07_258)] dark:hover:bg-[oklch(0.29_0.04_258)]'
                          : vr.index % 2 === 1
                            ? 'bg-muted/70 hover:bg-muted'
                            : 'hover:bg-muted/45',
                      )}
                      title={
                        selected
                          ? 'Selected for PDF export. Double-click to edit.'
                          : 'Click to select for export. Double-click to edit.'
                      }
                      onClick={() =>
                        setSelectedItem((prev) => (prev?.id === item.id ? null : item))
                      }
                      onDoubleClick={() => {
                        if (!canWrite) return;
                        setSelectedItem(item);
                        setEditOpen(true);
                      }}
                    >
                      <TableCell className="w-16 min-w-16 font-mono">
                        <span
                          className={cn(
                            'inline-flex min-w-8 items-center justify-center rounded px-1.5 py-0.5 text-[11px]',
                            selected
                              ? 'bg-[oklch(0.88_0.045_258)] font-semibold text-[oklch(0.34_0.09_258)] dark:bg-[oklch(0.36_0.05_258)] dark:text-[oklch(0.88_0.04_258)]'
                              : 'bg-transparent',
                          )}
                        >
                          {item.refNumber}
                        </span>
                      </TableCell>
                      <TableCell className="w-24 min-w-24">
                        {STATUS_LABELS[item.travelOrderStatus] ?? item.travelOrderStatus}
                      </TableCell>
                      <TableCell className="w-36 min-w-36">{formatDate(item.date)}</TableCell>
                      <TableCell className="w-40 min-w-40">{item.requestor.name}</TableCell>
                      <TableCell className="w-40 min-w-40">{item.requestor.office.name}</TableCell>
                      <TableCell className="w-40 min-w-40">
                        {item.requestor.officePosition.name}
                      </TableCell>
                      <TableCell className="w-24 min-w-24">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </TableCell>
                      <TableCell className="w-56 min-w-56">{formatDateOfTravel(item)}</TableCell>
                      <TableCell className="w-24 min-w-24 text-center">{item.noOfDays}</TableCell>
                      <TableCell className="w-40 min-w-40">{item.location}</TableCell>
                      <TableCell className="w-48 min-w-48">{item.purpose}</TableCell>
                      <TableCell className="w-24 min-w-24">{item.time}</TableCell>
                      <TableCell className="w-40 min-w-40">
                        {item.subjectToClaims ? 'Subject to Claims' : 'Not Subject to Claims'}
                      </TableCell>
                      <TableCell className="w-40 min-w-40">{item.notes ?? '-'}</TableCell>
                      <TableCell className="w-40 min-w-40">
                        {item.approvedBy?.name ?? '-'}
                      </TableCell>
                      <TableCell className="w-40 min-w-40">
                        {item.approvedBy?.position.name ?? '-'}
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

      {/* Create dialog */}
      <TravelOrderFormDialog
        key={`create-${addKey}`}
        mode="add"
        open={addOpen}
        canDelegate={canWrite}
        onOpenChange={setAddOpen}
        onSuccess={() => {
          mutate();
          setSelectedItem(null);
        }}
      />

      {/* Edit dialog */}
      <TravelOrderFormDialog
        key={selectedItem ? `edit-${selectedItem.id}` : 'edit-none'}
        mode="edit"
        editItem={selectedItem ?? undefined}
        open={editOpen}
        canDelegate={false}
        onOpenChange={setEditOpen}
        onSuccess={() => {
          mutate();
          setSelectedItem(null);
        }}
      />

      <TravelOrderPrintDialog item={selectedItem} open={printOpen} onOpenChange={setPrintOpen} />

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Travel Order</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete travel order{' '}
              <strong>REF #{selectedItem?.refNumber}</strong> for{' '}
              <strong>{selectedItem?.requestor.name}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve confirmation */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Travel Order</DialogTitle>
            <DialogDescription>
              Approve travel order <strong>REF #{selectedItem?.refNumber}</strong> for{' '}
              <strong>{selectedItem?.requestor.name}</strong>? Your identity will be recorded as the
              approver.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isApproving}
              onClick={() => setApproveOpen(false)}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={isApproving} onClick={handleApprove}>
              {isApproving ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
