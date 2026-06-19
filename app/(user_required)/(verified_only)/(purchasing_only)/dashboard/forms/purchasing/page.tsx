"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileSpreadsheet, Pencil, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { PurchaseOrderDialog, PurchasingFormDialog } from "@/components/purchasing-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function openPrintWindow(title: string, body: string): void {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) {
    toast.error("Print preview was blocked", {
      description: "Allow pop-ups for this site and try again.",
    });
    return;
  }

  printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { text-align: center; font-size: 20px; margin: 0 0 14px; }
    .meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 24px; margin: 12px 0; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #111; padding: 5px; vertical-align: top; }
    th { text-align: center; }
    .right { text-align: right; }
    .center { text-align: center; }
    .signers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 44px; text-align: center; font-size: 11px; }
    .line { border-top: 1px solid #111; padding-top: 5px; font-weight: 700; }
    @page { size: letter portrait; margin: 0.35in; }
  </style>
</head>
<body>${body}</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

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
  const [isExportingPr, setIsExportingPr] = useState(false);
  const [isExportingPo, setIsExportingPo] = useState(false);
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

  const selectedItemsHavePo = useMemo(
    () => selectedPoItems.some(item => item.purchaseOrderNumber?.trim()),
    [selectedPoItems],
  );

  const canCreatePo = selectedPoItems.length > 0 && !selectedItemsHavePo;

  const selectedPrNumbers = useMemo(
    () => Array.from(new Set(
      selectedPoItems
        .map(item => item.prNumber)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    )),
    [selectedPoItems],
  );

  const prExportItem = selectedItem ?? (selectedPrNumbers.length === 1 ? selectedPoItems[0] : null);
  const canExportPr = Boolean(prExportItem);
  const prExportHasMismatch = !selectedItem && selectedPoItems.length > 0 && selectedPrNumbers.length > 1;
  const prActionLabel = prExportItem
    ? `PR ${prExportItem.prNumber}`
    : selectedPoItems.length > 0
      ? "Multiple PR numbers"
      : "Select a PR";

  const selectedPoNumbers = useMemo(
    () => Array.from(new Set(
      selectedPoItems
        .map(item => item.purchaseOrderNumber)
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0),
    )),
    [selectedPoItems],
  );

  const canExportPo = selectedPoItems.length > 0 && selectedPoNumbers.length === 1;
  const poExportHasMismatch = selectedPoItems.length > 0 && selectedPoNumbers.length > 1;
  const poActionLabel = canExportPo
    ? `PO ${selectedPoNumbers[0]}`
    : selectedPoItems.length > 0
      ? "Multiple PO numbers"
      : "Select PO rows";

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

  const downloadWorkbook = async (url: string, fallbackFilename: string) => {
    const res = await fetch(url);
    if (!res.ok) {
      toast.error("Export failed", {
        description: "Please refresh the record and try again.",
      });
      return;
    }

    const blob = await res.blob();
    const contentDisposition = res.headers.get("content-disposition");
    const filename = contentDisposition?.match(/filename="?([^"]+)"?/i)?.[1] ?? fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
    toast.success("Workbook is ready");
  };

  const handleExportPr = async () => {
    if (!prExportItem || isExportingPr) return;

    setIsExportingPr(true);
    try {
      await downloadWorkbook(
        `/api/forms/purchasing/export/pr?id=${prExportItem.id}`,
        `Purchase_Request_${prExportItem.prNumber ?? prExportItem.id}.xlsx`,
      );
    } finally {
      setIsExportingPr(false);
    }
  };

  const handleExportPo = async () => {
    if (!canExportPo || isExportingPo) return;

    const item = selectedPoItems[0];
    if (!item) return;

    setIsExportingPo(true);
    try {
      await downloadWorkbook(
        `/api/forms/purchasing/export/po?id=${item.id}`,
        `Purchase_Order_${selectedPoNumbers[0] ?? item.id}.xlsx`,
      );
    } finally {
      setIsExportingPo(false);
    }
  };

  const printPurchasingRows = (title: string, rows: PurchasingItemResponse[], options: { po: boolean }) => {
    const first = rows[0];
    if (!first) return;

    const itemRows = rows.map((item, index) => `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="center">${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(item.itemDescription)}</td>
        <td class="center">${escapeHtml(item.quantity)}</td>
        <td class="right">${escapeHtml(item.unitCost)}</td>
        <td class="right">${escapeHtml(item.totalCost)}</td>
      </tr>
    `).join("");
    const total = rows.reduce((sum, item) => sum + (Number.parseFloat(item.totalCost) || 0), 0);
    const body = `
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        <div><strong>PR No.:</strong> ${escapeHtml(first.prNumber)}</div>
        ${options.po ? `<div><strong>PO No.:</strong> ${escapeHtml(first.purchaseOrderNumber)}</div>` : ""}
        <div><strong>Date:</strong> ${escapeHtml(first.date)}</div>
        <div><strong>Mode:</strong> ${escapeHtml(first.modeOfProcurement?.name)}</div>
        <div><strong>Supplier:</strong> ${escapeHtml(first.supplier)}</div>
        <div><strong>Address:</strong> ${escapeHtml(first.address)}</div>
      </div>
      <table>
        <thead><tr><th>Item No.</th><th>Unit</th><th>Description</th><th>Qty</th><th>Unit Cost</th><th>Total Cost</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr><th colspan="5" class="right">TOTAL</th><th class="right">${total.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</th></tr></tfoot>
      </table>
      <div class="meta">
        <div><strong>Purpose:</strong> ${escapeHtml(first.purpose)}</div>
        <div><strong>Office:</strong> ${escapeHtml(first.requestingOffice.name)}</div>
      </div>
      <div class="signers">
        <div><div>Requested by:</div><div class="line">${escapeHtml(first.headOfOffice.name)}</div><div>${escapeHtml(first.headOfOffice.position)}</div></div>
        <div><div>Cash Availability:</div><div class="line">${escapeHtml(first.treasurer.name)}</div><div>${escapeHtml(first.treasurer.position)}</div></div>
        <div><div>Approved by:</div><div class="line">${escapeHtml(first.approvedBy.name)}</div><div>${escapeHtml(first.approvedBy.position)}</div></div>
      </div>
    `;
    openPrintWindow(title, body);
  };

  const handlePrintPr = () => {
    if (!prExportItem) return;
    const rows = items.filter(item => item.prNumber === prExportItem.prNumber);
    printPurchasingRows(`Purchase Request ${prExportItem.prNumber}`, rows.length > 0 ? rows : [prExportItem], { po: false });
  };

  const handlePrintPo = () => {
    if (!canExportPo) return;
    const poNumber = selectedPoNumbers[0];
    const rows = selectedPoItems.filter(item => item.purchaseOrderNumber === poNumber);
    printPurchasingRows(`Purchase Order ${poNumber}`, rows, { po: true });
  };

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex flex-wrap items-center gap-2 p-2 border rounded-lg w-full">
        <div className="relative flex min-w-64 flex-1 items-center">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 text-xs"
            placeholder="Search purchase request records..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="hidden h-6 mx-1 md:block" />

        <Button
          variant="outline"
          size="sm"
          aria-label="Create Purchase Request"
          onClick={() => {
            setAddKey(key => key + 1);
            setAddOpen(true);
          }}
        >
          New PR
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
          Create PO
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!canExportPr}>
              PR Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {prActionLabel}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canExportPr || isExportingPr} onClick={handleExportPr}>
              <FileSpreadsheet className="mr-2 size-4" />
              {isExportingPr ? "Exporting..." : "Export XLSX"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canExportPr} onClick={handlePrintPr}>
              <Printer className="mr-2 size-4" />
              Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!canExportPo}>
              PO Actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              {poActionLabel}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canExportPo || isExportingPo} onClick={handleExportPo}>
              <FileSpreadsheet className="mr-2 size-4" />
              {isExportingPo ? "Exporting..." : "Export XLSX"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canExportPo} onClick={handlePrintPo}>
              <Printer className="mr-2 size-4" />
              Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto min-w-48 rounded-md bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
          <span>
            {selectedPoItems.length > 0
              ? `${selectedPoItems.length} row${selectedPoItems.length === 1 ? "" : "s"} selected for PO`
              : selectedItem
                ? `Selected PR ${selectedItem.prNumber}`
                : "Select a row for actions"}
          </span>
          {selectedItemsHavePo && (
            <span className="ml-2 text-destructive">PO already assigned</span>
          )}
          {prExportHasMismatch && (
            <span className="ml-2 text-destructive">Mixed PR numbers</span>
          )}
          {poExportHasMismatch && (
            <span className="ml-2 text-destructive">Mixed PO numbers</span>
          )}
        </div>

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
              toast.error("Purchase request was not deleted", {
                description: (result.error as ApiResponseException).message ?? "Please refresh the list and try again.",
              });
              return;
            }

            setSelectedPoItemIds(prev => {
              const next = new Set(prev);
              next.delete(selectedItem.id);
              return next;
            });
            setSelectedItem(null);
            mutate();
            toast.success("Purchase request deleted");
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
