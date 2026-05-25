"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  PurchasingItemResponse,
  PurchasingListResponse,
} from "@/lib/http/client/responses";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import { PurchaseOrderDialog, PurchasingFormDialog } from "@/app/(user_required)/(verified_only)/(purchasing_only)/dashboard/forms/purchasing/purchasing-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const TOTAL_COLS = 23;

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<PurchasingListResponse, ApiResponseException>
  >(
    "/api/forms/purchasing",
    $fetch,
  );

  const [selectedItem, setSelectedItem] = useState<PurchasingItemResponse | null>(null);
  const [selectedPoItemIds, setSelectedPoItemIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [createPoOpen, setCreatePoOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return items;
    }

    return items.filter(item => {
      const fields = [
        item.prNumber,
        item.date,
        item.modeOfProcurement?.name,
        item.purchaseOrderNumber,
        item.supplier,
        item.address,
        item.tinNumber,
        item.placeOfDelivery,
        item.dateOfDelivery,
        item.deliveryTerm,
        item.paymentTerm,
        item.unit,
        item.itemDescription,
        item.quantity,
        item.unitCost,
        item.totalCost,
        item.purpose,
        item.requestingOffice.name,
        item.headOfOffice.name,
        item.headOfOffice.position,
        item.approvedBy.name,
        item.approvedBy.position,
      ];

      return fields.some(field => field?.toLowerCase().includes(query));
    });
  }, [items, searchQuery]);

  const selectedPoItems = useMemo(
    () => items.filter(item => selectedPoItemIds.has(item.id)),
    [items, selectedPoItemIds],
  );

  const selectedPoPrNumbers = useMemo(
    () => Array.from(new Set(selectedPoItems.map(item => item.prNumber))),
    [selectedPoItems],
  );

  const canCreatePo = selectedPoItems.length > 0 && selectedPoPrNumbers.length === 1;
  const poSelectionHasMismatch = selectedPoItems.length > 0 && selectedPoPrNumbers.length > 1;

  const areAllFilteredSelected =
    filteredItems.length > 0 && filteredItems.every(item => selectedPoItemIds.has(item.id));

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
            className="pl-7 h-8 w-72 text-xs"
            placeholder="Search purchase request records..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="h-6 mx-1" />

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Create Purchase Request"
          onClick={() => {
            setAddKey(key => key + 1);
            setAddOpen(true);
          }}
        >
          <Plus />
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={!canCreatePo}
          onClick={() => {
            if (!canCreatePo) return;
            setCreatePoOpen(true);
          }}
        >
          Create an Purchase Order (PO)
        </Button>

        {poSelectionHasMismatch && (
          <span className="ml-2 text-xs text-destructive">
            Select only items with the same PR Number for PO creation.
          </span>
        )}

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          disabled={!selectedItem}
          onClick={() => {
            if (!selectedItem) return;
            setEditOpen(true);
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

            const confirmed = confirm("Delete this purchase request item? This cannot be undone.");
            if (!confirmed) return;

            const result = await $fetch<unknown, ApiResponseException>(`/api/forms/purchasing/${selectedItem.id}`, {
              method: "DELETE",
            });

            if (result.error) {
              alert((result.error as ApiResponseException).message ?? "Failed to delete purchase request item.");
              return;
            }

            setSelectedPoItemIds(prev => {
              const next = new Set(prev);
              next.delete(selectedItem.id);
              return next;
            });
            setSelectedItem(null);
            mutate();
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="border rounded-lg p-2">
        {filteredItems.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No purchase request records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="w-max min-w-full table-fixed text-xs [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-10 min-w-10 text-center">
                    <Checkbox
                      aria-label="Select all visible items"
                      checked={areAllFilteredSelected}
                      onCheckedChange={checked => {
                        const shouldSelect = checked === true;
                        setSelectedPoItemIds(prev => {
                          const next = new Set(prev);
                          for (const row of filteredItems) {
                            if (shouldSelect) {
                              next.add(row.id);
                            } else {
                              next.delete(row.id);
                            }
                          }

                          return next;
                        });
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-28 min-w-28">PR Number</TableHead>
                  <TableHead className="w-28 min-w-28">Date</TableHead>
                  <TableHead className="w-40 min-w-40">Mode of Procurement</TableHead>
                  <TableHead className="w-28 min-w-28">PO #</TableHead>
                  <TableHead className="w-52 min-w-52">Supplier</TableHead>
                  <TableHead className="w-64 min-w-64">Address</TableHead>
                  <TableHead className="w-32 min-w-32">TIN Number</TableHead>
                  <TableHead className="w-44 min-w-44">Place of Delivery</TableHead>
                  <TableHead className="w-32 min-w-32">Date of Delivery</TableHead>
                  <TableHead className="w-28 min-w-28">Delivery Term</TableHead>
                  <TableHead className="w-28 min-w-28">Payment Term</TableHead>
                  <TableHead className="w-20 min-w-20">Unit</TableHead>
                  <TableHead className="w-[360px] min-w-[360px] max-w-[360px] whitespace-normal break-words">Item Description</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">Quantity</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">Unit Cost</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">Total Cost</TableHead>
                  <TableHead className="w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words">Purpose</TableHead>
                  <TableHead className="w-44 min-w-44">Requesting Office</TableHead>
                  <TableHead className="w-44 min-w-44">Head of Office</TableHead>
                  <TableHead className="w-36 min-w-36">Position</TableHead>
                  <TableHead className="w-44 min-w-44">Approved By</TableHead>
                  <TableHead className="w-36 min-w-36">Position</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={TOTAL_COLS} style={{ height: `${paddingTop}px` }} />
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
                      <TableCell
                        className="w-10 min-w-10 text-center"
                        onClick={e => e.stopPropagation()}
                      >
                        <Checkbox
                          aria-label={`Select item ${item.id} for PO creation`}
                          checked={selectedPoItemIds.has(item.id)}
                          onCheckedChange={checked => {
                            const shouldSelect = checked === true;
                            setSelectedPoItemIds(prev => {
                              const next = new Set(prev);
                              if (shouldSelect) {
                                next.add(item.id);
                              } else {
                                next.delete(item.id);
                              }

                              return next;
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="w-28 min-w-28">{txt(item.prNumber)}</TableCell>
                      <TableCell className="w-28 min-w-28">{txt(item.date)}</TableCell>
                      <TableCell className="w-40 min-w-40">{txt(item.modeOfProcurement?.name)}</TableCell>
                      <TableCell className="w-28 min-w-28">{txt(item.purchaseOrderNumber)}</TableCell>
                      <TableCell className="w-52 min-w-52">{txt(item.supplier)}</TableCell>
                      <TableCell className="w-64 min-w-64">{txt(item.address)}</TableCell>
                      <TableCell className="w-32 min-w-32">{txt(item.tinNumber)}</TableCell>
                      <TableCell className="w-44 min-w-44">{txt(item.placeOfDelivery)}</TableCell>
                      <TableCell className="w-32 min-w-32">{txt(item.dateOfDelivery)}</TableCell>
                      <TableCell className="w-28 min-w-28">{txt(item.deliveryTerm)}</TableCell>
                      <TableCell className="w-28 min-w-28">{txt(item.paymentTerm)}</TableCell>
                      <TableCell className="w-20 min-w-20">{txt(item.unit)}</TableCell>
                      <TableCell className="w-[360px] min-w-[360px] max-w-[360px] whitespace-normal break-words">{txt(item.itemDescription)}</TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">{fmtMoney(item.quantity)}</TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">{fmtMoney(item.unitCost)}</TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">{fmtMoney(item.totalCost)}</TableCell>
                      <TableCell className="w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words">{txt(item.purpose)}</TableCell>
                      <TableCell className="w-44 min-w-44">{txt(item.requestingOffice.name)}</TableCell>
                      <TableCell className="w-44 min-w-44">{txt(item.headOfOffice.name)}</TableCell>
                      <TableCell className="w-36 min-w-36">{txt(item.headOfOffice.position)}</TableCell>
                      <TableCell className="w-44 min-w-44">{txt(item.approvedBy.name)}</TableCell>
                      <TableCell className="w-36 min-w-36">{txt(item.approvedBy.position)}</TableCell>
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

      <PurchasingFormDialog
        key={`create-${addKey}`}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />

      <PurchasingFormDialog
        key={selectedItem ? `edit-${selectedItem.id}` : "edit-none"}
        mode="edit"
        editItem={selectedItem ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => mutate()}
      />

      <PurchaseOrderDialog
        key={selectedPoItems.length > 0
          ? `po-${selectedPoItems.map(item => item.id).sort().join("-")}`
          : "po-none"}
        items={selectedPoItems}
        open={createPoOpen}
        onOpenChange={setCreatePoOpen}
        onSuccess={() => {
          setSelectedPoItemIds(new Set());
          mutate();
        }}
      />
    </div>
  );
}

function txt(value: Optional<string>): string {
  return value ?? "—";
}

function fmtMoney(value: string): string {
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return parsed.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
