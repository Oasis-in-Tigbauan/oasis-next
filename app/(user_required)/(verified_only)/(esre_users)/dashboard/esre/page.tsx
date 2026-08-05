'use client';

import {Pencil, Plus, Printer, Trash2} from 'lucide-react';
import {useMemo, useState} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

import {EsreFormDialog} from '@/app/(user_required)/(verified_only)/(esre_users)/dashboard/esre/esre-form-dialog';
import {useColumnVisibility} from '@/common/column-visibility';
import {
  ESRE_PAGE_COLUMN_GROUPS,
  ESRE_PAGE_COLUMNS,
  ESRE_PAGE_STORAGE_KEY,
  type EsrePageColumnDef,
} from '@/common/esre/page-columns';
import {ColumnVisibilityPicker} from '@/components/column-visibility-picker';
import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {$fetch} from '@/lib/http/client/fetch';
import {
  ApiResponseException,
  BetterFetchResponse,
  EsreItemResponse,
  EsreListResponse,
} from '@/lib/http/client/responses';

export default function Page() {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<EsreListResponse, ApiResponseException>
  >('/api/esre', $fetch);

  const [selectedItem, setSelectedItem] = useState<EsreItemResponse | null>(null);
  const [selectedChequeItemIds, setSelectedChequeItemIds] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);

  const columnVisibility = useColumnVisibility(
    ESRE_PAGE_STORAGE_KEY,
    ESRE_PAGE_COLUMNS,
    ESRE_PAGE_COLUMN_GROUPS,
  );

  const orderedColumns = useMemo(
    () =>
      columnVisibility.orderedVisible.map((col) =>
        ESRE_PAGE_COLUMNS.find((c) => c.key === col.key)!,
      ),
    [columnVisibility.orderedVisible],
  );

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  const items = data?.data?.data ?? [];
  const selectedChequeItems = items.filter((item) => selectedChequeItemIds.has(item.id));
  const selectedChequeTotal = selectedChequeItems.reduce((sum, item) => {
    const parsed = Number.parseFloat(item.amount.replaceAll(',', ''));
    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);
  const areAllSelected =
    items.length > 0 && items.every((item) => selectedChequeItemIds.has(item.id));

  const printCheque = () => {
    if (selectedChequeItems.length === 0) return;

    const ids = selectedChequeItems.map((item) => item.id).join(',');
    window.open(`/api/esre/cheque?ids=${encodeURIComponent(ids)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex gap-1 p-2 border rounded-lg w-full">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add"
          onClick={() => {
            setAddKey((k) => k + 1);
            setAddOpen(true);
          }}
        >
          <Plus />
        </Button>
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
          onClick={async () => {
            if (!selectedItem) return;
            const confirmed = confirm(
              `Delete this ESRE entry for "${selectedItem.payee}"? This cannot be undone.`,
            );
            if (!confirmed) return;
            const res = await $fetch<unknown, ApiResponseException>(
              `/api/esre/${selectedItem.id}`,
              {method: 'DELETE'},
            );
            if (res.error) {
              toast.error('ESRE entry was not deleted', {
                description:
                  (res.error as ApiResponseException).message ??
                  'Please refresh the list and try again.',
              });
              return;
            }
            setSelectedItem(null);
            mutate();
            toast.success('ESRE entry deleted');
          }}
        >
          <Trash2 />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={selectedChequeItems.length === 0}
          onClick={printCheque}
        >
          <Printer className="size-4 mr-2" />
          Print Cheque
          {selectedChequeItems.length > 0
            ? ` (${selectedChequeItems.length} / ${selectedChequeTotal.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })})`
            : ''}
        </Button>
        <div className="ml-auto">
          <ColumnVisibilityPicker
            groups={columnVisibility.pickerGroups}
            selected={columnVisibility.visibleKeys}
            selectedToggleableCount={columnVisibility.selectedToggleableCount}
            totalToggleableCount={columnVisibility.totalToggleableCount}
            onToggle={columnVisibility.toggle}
            onSelectAll={columnVisibility.selectAll}
            onDeselectAll={columnVisibility.deselectAll}
          />
        </div>
      </div>

      <div className="border rounded-lg p-2">
        {items.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No ESRE records found.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto **:data-[slot=table-container]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-20 [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-[#FFF2CC]">
                <TableRow>
                  <TableHead className="w-10 min-w-10 text-center">
                    <Checkbox
                      aria-label="Select all ESRE rows for cheque printing"
                      checked={areAllSelected}
                      onCheckedChange={(checked) => {
                        const shouldSelect = checked === true;
                        setSelectedChequeItemIds(
                          shouldSelect ? new Set(items.map((item) => item.id)) : new Set(),
                        );
                      }}
                    />
                  </TableHead>
                  {orderedColumns.map((col) => (
                    <TableHead key={col.key} className={col.headerClassName}>
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <EsreTableRow
                    key={item.id}
                    item={item}
                    index={index}
                    selected={selectedItem?.id === item.id}
                    selectedForCheque={selectedChequeItemIds.has(item.id)}
                    onSelect={() => setSelectedItem((prev) => (prev?.id === item.id ? null : item))}
                    onToggleChequeSelection={(checked) => {
                      setSelectedChequeItemIds((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(item.id);
                        } else {
                          next.delete(item.id);
                        }
                        return next;
                      });
                    }}
                    visibleColumns={orderedColumns}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <EsreFormDialog
        key={addKey}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />
      <EsreFormDialog
        key={selectedItem?.id ?? 'edit-no-selection'}
        mode="edit"
        editItem={selectedItem ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => {
          setSelectedItem(null);
          mutate();
        }}
      />
    </div>
  );
}

function EsreTableRow({
  item,
  index,
  selected,
  selectedForCheque,
  onSelect,
  onToggleChequeSelection,
  visibleColumns,
}: {
  item: EsreItemResponse;
  index: number;
  selected: boolean;
  selectedForCheque: boolean;
  onSelect: () => void;
  onToggleChequeSelection: (checked: boolean) => void;
  visibleColumns: EsrePageColumnDef[];
}) {
  return (
    <TableRow
      className={`cursor-pointer select-none ${
        selected ? 'bg-accent' : index % 2 === 1 ? 'bg-muted hover:bg-muted/50' : ''
      }`}
      onClick={onSelect}
    >
      <TableCell className="w-10 text-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Select ESRE row for ${item.payee}`}
          checked={selectedForCheque}
          onCheckedChange={(checked) => onToggleChequeSelection(checked === true)}
        />
      </TableCell>
      {visibleColumns.map((col) => (
        <TableCell key={col.key} className={col.cellClassName}>
          {col.renderCell(item)}
        </TableCell>
      ))}
    </TableRow>
  );
}
