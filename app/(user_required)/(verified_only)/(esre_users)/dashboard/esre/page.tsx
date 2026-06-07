"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import {
  ApiResponseException,
  BetterFetchResponse,
  EsreItemResponse,
  EsreListResponse,
} from "@/lib/http/client/responses";

import { ColumnVisibilityPicker } from "@/components/column-visibility-picker";
import { Button } from "@/components/ui/button";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import { useColumnVisibility } from "@/lib/column-visibility";
import {
  ESRE_PAGE_COLUMN_GROUPS,
  ESRE_PAGE_COLUMNS,
  ESRE_PAGE_STORAGE_KEY,
  type EsrePageColumnDef,
} from "@/lib/esre/page-columns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EsreFormDialog } from "@/app/(user_required)/(verified_only)/(esre_users)/dashboard/esre/esre-form-dialog";

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<EsreListResponse, ApiResponseException>>(
    "/api/esre",
    $fetch,
  );

  const [selectedItem, setSelectedItem] = useState<EsreItemResponse | null>(null);
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
      columnVisibility.orderedVisible.map(
        col => ESRE_PAGE_COLUMNS.find(c => c.key === col.key)!,
      ),
    [columnVisibility.orderedVisible],
  );

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  const items = data?.data?.data ?? [];

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex gap-1 p-2 border rounded-lg w-full">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add"
          onClick={() => { setAddKey(k => k + 1); setAddOpen(true); }}
        >
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          disabled={!selectedItem}
          onClick={() => { if (selectedItem) setEditOpen(true); }}
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
            const confirmed = confirm(`Delete this ESRE entry for "${selectedItem.payee}"? This cannot be undone.`);
            if (!confirmed) return;
            const res = await $fetch<unknown, ApiResponseException>(`/api/esre/${selectedItem.id}`, { method: "DELETE" });
            if (res.error) {
              alert((res.error as ApiResponseException).message ?? "Failed to delete entry. Please try again.");
              return;
            }
            setSelectedItem(null);
            mutate();
          }}
        >
          <Trash2 />
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

      <div className="border rounded-lg">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              {orderedColumns.map(col => (
                <TableHead key={col.key}>{col.label}</TableHead>
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
                onSelect={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
                visibleColumns={orderedColumns}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <EsreFormDialog
        key={addKey}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />
      <EsreFormDialog
        key={selectedItem?.id ?? "edit-no-selection"}
        mode="edit"
        editItem={selectedItem ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => mutate()}
      />
    </div>
  );
}

function EsreTableRow({
  item,
  index,
  selected,
  onSelect,
  visibleColumns,
}: {
  item: EsreItemResponse;
  index: number;
  selected: boolean;
  onSelect: () => void;
  visibleColumns: EsrePageColumnDef[];
}) {
  return (
    <TableRow
      className={
        selected
          ? "bg-accent"
          : index % 2 === 1
            ? "bg-muted hover:bg-muted/50"
            : undefined
      }
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      {visibleColumns.map(col => (
        <TableCell key={col.key}>{col.renderCell(item)}</TableCell>
      ))}
    </TableRow>
  );
}

