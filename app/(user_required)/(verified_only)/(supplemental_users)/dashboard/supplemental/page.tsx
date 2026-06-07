"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  SupplementalItemResponse,
  SupplementalListResponse,
} from "@/lib/http/client/responses";

import { ColumnVisibilityPicker } from "@/components/column-visibility-picker";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import { useColumnVisibility } from "@/lib/column-visibility";
import {
  SUPPLEMENTAL_PAGE_COLUMN_GROUPS,
  SUPPLEMENTAL_PAGE_COLUMNS,
  SUPPLEMENTAL_PAGE_STORAGE_KEY,
} from "@/lib/supplemental/page-columns";
import { SupplementalFormDialog } from "@/app/(user_required)/(verified_only)/(supplemental_users)/dashboard/supplemental/supplemental-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<BetterFetchResponse<SupplementalListResponse, ApiResponseException>>(
    "/api/supplemental",
    $fetch,
  );

  const [selectedItem, setSelectedItem] = useState<SupplementalItemResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const columnVisibility = useColumnVisibility(
    SUPPLEMENTAL_PAGE_STORAGE_KEY,
    SUPPLEMENTAL_PAGE_COLUMNS,
    SUPPLEMENTAL_PAGE_COLUMN_GROUPS,
  );

  const orderedColumns = useMemo(
    () =>
      columnVisibility.orderedVisible.map(
        col => SUPPLEMENTAL_PAGE_COLUMNS.find(c => c.key === col.key)!,
      ),
    [columnVisibility.orderedVisible],
  );

  const items = data?.data?.data;
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sourceItems = items ?? [];
    if (!query) return sourceItems;

    return sourceItems.filter(item => {
      return (
        item.supplementalOrAugmentation?.toLowerCase().includes(query) ||
        item.saaob?.name?.toLowerCase().includes(query) ||
        item.quarter.toLowerCase().includes(query) ||
        item.amount.toLowerCase().includes(query) ||
        item.aipCode?.aipRefCode?.toLowerCase().includes(query)
      );
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

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search supplemental records..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Add"
          onClick={() => {
            setAddKey(k => k + 1);
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
            const confirmed = confirm("Delete this supplemental entry? This cannot be undone.");
            if (!confirmed) return;

            const res = await $fetch<unknown, ApiResponseException>(`/api/supplemental/${selectedItem.id}`, {
              method: "DELETE",
            });
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

      <div className="border rounded-lg p-2">
        {filteredItems.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No supplemental records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="w-max min-w-full table-fixed text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  {orderedColumns.map(col => (
                    <TableHead key={col.key} className={col.headerClassName}>
                      {col.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={columnVisibility.visibleCount} style={{ height: `${paddingTop}px` }} />
                  </TableRow>
                )}

                {virtualRows.map(vr => {
                  const item = filteredItems[vr.index]!;
                  const selected = selectedItem?.id === item.id;

                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={item.id}
                      data-index={vr.index}
                      className={`cursor-pointer select-none ${
                        selected
                          ? "bg-accent"
                          : vr.index % 2 === 1
                            ? "bg-muted hover:bg-muted/50"
                            : ""
                      }`}
                      title="Double-click to edit"
                      onClick={() => setSelectedItem(prev => (prev?.id === item.id ? null : item))}
                      onDoubleClick={() => {
                        setSelectedItem(item);
                        setEditOpen(true);
                      }}
                    >
                      {orderedColumns.map(col => (
                        <TableCell key={col.key} className={col.cellClassName}>
                          {col.renderCell(item)}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}

                {paddingBottom > 0 && (
                  <TableRow>
                    <TableCell colSpan={columnVisibility.visibleCount} style={{ height: `${paddingBottom}px` }} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <SupplementalFormDialog
        key={addKey}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />
      <SupplementalFormDialog
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
