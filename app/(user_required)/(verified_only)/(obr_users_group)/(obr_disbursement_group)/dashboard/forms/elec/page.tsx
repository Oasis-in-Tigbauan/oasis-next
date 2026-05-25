"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  ElecItemResponse,
  ElecListResponse,
} from "@/lib/http/client/responses";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import { ElecFormDialog } from "@/app/(user_required)/(verified_only)/(obr_users_group)/(obr_disbursement_group)/dashboard/forms/elec/elec-form-dialog";
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

const TAX_TYPE_LABELS: Record<string, string> = {
  "vat-g": "VAT - Goods",
  "vat-s": "VAT - Services",
  "nvat-g": "Non-VAT Goods",
  "nvat-s": "Non-VAT Services",
};

const TOTAL_COLS = 10;

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<ElecListResponse, ApiResponseException>
  >("/api/forms/elec", $fetch);

  const [selectedItem, setSelectedItem] = useState<ElecItemResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;
    return items.filter(item => {
      const fields = [
        item.dv.disbursementVoucherNumber,
        item.billingName,
        item.meterSerial,
        item.account,
        item.gross,
        item.vatableSales,
        TAX_TYPE_LABELS[item.taxType] ?? item.taxType,
      ];
      return fields.some(f => f?.toLowerCase().includes(query));
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
            className="pl-7 h-8 w-72 text-xs"
            placeholder="Search electricity bill records..."
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
            const confirmed = confirm(
              `Delete the electricity bill for "${selectedItem.billingName}"? This cannot be undone.`,
            );
            if (!confirmed) return;

            const res = await $fetch<unknown, ApiResponseException>(
              `/api/forms/elec/${selectedItem.id}`,
              { method: "DELETE" },
            );
            if (res.error) {
              alert(
                (res.error as ApiResponseException).message ??
                  "Failed to delete record. Please try again.",
              );
              return;
            }
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
            {searchQuery
              ? "No results match your search."
              : "No electricity bill records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="w-max min-w-full table-fixed text-xs [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-40 min-w-40">DV #</TableHead>
                  <TableHead className="w-48 min-w-48">Billing Name</TableHead>
                  <TableHead className="w-36 min-w-36">Meter Serial #</TableHead>
                  <TableHead className="w-36 min-w-36">Account</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">Gross</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">Vatable Sales</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">VAT 5%</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">EVAT 2%</TableHead>
                  <TableHead className="w-28 min-w-28 text-right">NET</TableHead>
                  <TableHead className="w-36 min-w-36">Tax Type</TableHead>
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
                      onClick={() =>
                        setSelectedItem(prev => (prev?.id === item.id ? null : item))
                      }
                      onDoubleClick={() => {
                        setSelectedItem(item);
                        setEditOpen(true);
                      }}
                    >
                      <TableCell className="w-40 min-w-40">
                        {item.dv.disbursementVoucherNumber}
                      </TableCell>
                      <TableCell className="w-48 min-w-48">{item.billingName}</TableCell>
                      <TableCell className="w-36 min-w-36">{item.meterSerial}</TableCell>
                      <TableCell className="w-36 min-w-36">{item.account}</TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">
                        {fmtMoney(item.gross)}
                      </TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">
                        {fmtMoney(item.vatableSales)}
                      </TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">
                        {fmtMoney(item.vat5)}
                      </TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">
                        {fmtMoney(item.evat2)}
                      </TableCell>
                      <TableCell className="w-28 min-w-28 text-right font-mono">
                        {fmtMoney(item.net)}
                      </TableCell>
                      <TableCell className="w-36 min-w-36">
                        {TAX_TYPE_LABELS[item.taxType] ?? item.taxType}
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

      <ElecFormDialog
        key={`create-${addKey}`}
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={() => mutate()}
      />

      <ElecFormDialog
        key={selectedItem ? `edit-${selectedItem.id}` : "edit-none"}
        mode="edit"
        editItem={selectedItem ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => mutate()}
      />
    </div>
  );
}

function fmtMoney(value: string): string {
  const parsed = Number(value.replaceAll(",", ""));
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
