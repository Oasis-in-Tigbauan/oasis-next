"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  AipSearchResultItem,
  BetterFetchResponse,
  ExpenseClassListResponse,
  ObrMainDataAipReference,
  ObrMainDataItemResponse,
  ObrMainDataListResponse,
  ObrRequestDetail,
  ObrRequestSummaryListResponse,
  ObrRequestSummaryItem,
  OfficeCodeListResponse,
  ObrRequestDetailResponse,
  SaaobSearchResponse,
  SaaobSearchGroup,
  SaaobSearchEntry,
} from "@/lib/http/client/responses";
import { isSaaobGroup } from "@/lib/http/client/responses";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";
import { ColumnVisibilityPicker } from "@/components/column-visibility-picker";
import { useColumnVisibility } from "@/common/column-visibility";
import {
  OBR_MAIN_MANAGE_PAGE_COLUMN_GROUPS,
  OBR_MAIN_MANAGE_PAGE_COLUMNS,
  OBR_MAIN_MANAGE_PAGE_STORAGE_KEY,
} from "@/common/obr/page-columns";

type AipRefRow = {
  rowId: string;
  aipId: string;
  aipCode: string;
  aipDescription: string;
  amount: string;
};

type CreateItemRow = {
  rowId: string;
  payee: string;
  address: string;
  responsibilityCenterId: string;
  expenseCodeId: string;
  particulars: string;
  amount: string;
  prNumber: string;
  prAmount: string;
  saaob: { id: string; name: string } | null;
  aipRefs: AipRefRow[];
};

function emptyCreateItem(): CreateItemRow {
  return {
    rowId: crypto.randomUUID(),
    payee: "",
    address: "",
    responsibilityCenterId: "",
    expenseCodeId: "",
    particulars: "",
    amount: "",
    prNumber: "",
    prAmount: "",
    saaob: null,
    aipRefs: [],
  };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatCurrency(value: string | null): string {
  if (!value) return "-";

  const trimmed = value.trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(trimmed)) return "-";

  const isNegative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[-+]/, "");
  const [rawInt, rawFrac = ""] = unsigned.split(".");

  const normalizedInt = rawInt.replace(/^0+(?=\d)/, "") || "0";
  const paddedFrac = (rawFrac + "000").slice(0, 3);
  const centPart = paddedFrac.slice(0, 2);
  const roundingDigit = Number.parseInt(paddedFrac[2] ?? "0", 10);

  let cents = BigInt(`${normalizedInt}${centPart}`);
  if (roundingDigit >= 5) cents += 1n;

  const centsStr = cents.toString().padStart(3, "0");
  const integerPart = centsStr.slice(0, -2) || "0";
  const fractionalPart = centsStr.slice(-2);
  const intWithGrouping = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const roundedIsZero = cents === 0n;
  const sign = isNegative && !roundedIsZero ? "-" : "";

  return `${sign}${intWithGrouping}.${fractionalPart}`;
}

function DetailText({ value, className }: { value: string; className?: string }) {
  return (
    <div className={`rounded-md border bg-muted/30 px-3 py-2 text-sm ${className ?? ""}`.trim()}>
      {value}
    </div>
  );
}

function formatRequestDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-PH", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ApprovalStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <Badge className="border-green-200 bg-green-100 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
        Approved
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export default function Page() {
  const {
    data,
    error,
    isLoading,
    mutate,
  } = useSWR<BetterFetchResponse<ObrMainDataListResponse, ApiResponseException>>(
    "/api/obr/main",
    $fetch,
  );

  const [selected, setSelected] = useState<ObrMainDataItemResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  type DialogMode = "create" | "edit" | null;
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const columnVisibility = useColumnVisibility(
    OBR_MAIN_MANAGE_PAGE_STORAGE_KEY,
    OBR_MAIN_MANAGE_PAGE_COLUMNS,
    OBR_MAIN_MANAGE_PAGE_COLUMN_GROUPS,
  );

  const orderedColumns = useMemo(
    () =>
      columnVisibility.orderedVisible.map(
        col => OBR_MAIN_MANAGE_PAGE_COLUMNS.find(c => c.key === col.key)!,
      ),
    [columnVisibility.orderedVisible],
  );

  const allItems = data?.data?.data ?? [];

  const items = searchQuery.trim()
    ? allItems.filter(item => {
      const q = searchQuery.toLowerCase();
      return (
        item.obrNumber.toLowerCase().includes(q)
          || item.alobs.toLowerCase().includes(q)
          || (item.payee?.toLowerCase().includes(q) ?? false)
          || item.address.toLowerCase().includes(q)
          || item.particulars.toLowerCase().includes(q)
          || (item.prNumber && item.prNumber.toLowerCase().includes(q))
      );
    })
    : allItems;

  // eslint-disable-next-line
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 15,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom = virtualRows.length > 0
    ? totalSize - virtualRows[virtualRows.length - 1].end
    : 0;

  const handleRowClick = useCallback((item: ObrMainDataItemResponse) => {
    setSelected(prev => (prev?.id === item.id ? null : item));
  }, []);

  const handleRowDoubleClick = useCallback((item: ObrMainDataItemResponse) => {
    setSelected(item);
    setDialogMode("edit");
  }, []);

  const closeDialog = useCallback(() => setDialogMode(null), []);
  const onSuccess = useCallback(() => { mutate(); closeDialog(); }, [mutate, closeDialog]);

  const handleDelete = useCallback(async () => {
    if (!selected) return;
    if (!confirm(`Delete OBR record "${selected.obrNumber}"? This cannot be undone.`)) return;

    const res = await fetch(`/api/obr/main/${selected.id}`, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      alert(payload?.message ?? "Failed to delete OBR main data. Please try again.");
      return;
    }
    setSelected(null);
    mutate();
  }, [selected, mutate]);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <div className="relative flex items-center mr-2">
          <Search className="absolute left-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-7 h-8 w-56 text-xs"
            placeholder="Search OBR, payee, ALOBS…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setDialogMode("create")}
        >
          <Plus className="size-3" />
          New
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          title="Edit selected"
          disabled={!selected}
          onClick={() => { if (selected) setDialogMode("edit"); }}
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete"
          title="Delete selected"
          disabled={!selected}
          className="text-destructive hover:text-destructive"
          onClick={handleDelete}
        >
          <Trash2 />
        </Button>

        {selected && (
          <Badge variant="secondary" className="ml-2 text-xs">
            {selected.obrNumber.length > 40
              ? `${selected.obrNumber.slice(0, 40)}…`
              : selected.obrNumber}
          </Badge>
        )}
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

      {/* Table */}
      <div className="border rounded-lg p-2">
        {items.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No records match your search." : "No OBR main data records found."}
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
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

                {virtualRows.map(virtualRow => {
                  const item = items[virtualRow.index]!;
                  const isSelected = selected?.id === item.id;
                  return (
                    <TableRow
                      ref={rowVirtualizer.measureElement}
                      key={item.id}
                      data-index={virtualRow.index}
                      className={`cursor-pointer select-none ${
                        isSelected
                          ? "bg-accent"
                          : virtualRow.index % 2 === 1
                            ? "bg-muted hover:bg-muted/50"
                            : ""
                      }`}
                      title="Click to select · Double-click to edit"
                      onClick={() => handleRowClick(item)}
                      onDoubleClick={() => handleRowDoubleClick(item)}
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

      {dialogMode === "create" && (
        <ObrMainDataCreateDialog
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}

      {dialogMode === "edit" && selected && (
        <ObrMainDataEditDialog
          item={selected}
          onSuccess={onSuccess}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

// ─── AipSearchCombobox ────────────────────────────────────────────────────────

function AipSearchCombobox({
  value,
  onChange,
}: {
  value: { id: string; code: string; description: string } | null;
  onChange: (val: { id: string; code: string; description: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<BetterFetchResponse<{ ok: true; data: AipSearchResultItem[] }, ApiResponseException>>(
    open && query.length >= 2 ? `/api/aip/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );

  const results = data?.data?.data ?? [];

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        placeholder="Search AIP code or description…"
        value={open ? query : (value ? `${value.code} — ${value.description}` : "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => { setQuery(e.target.value); }}
      />
      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!isLoading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {results.map(r => (
            <button
              key={r.id}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={() => {
                onChange({ id: r.id, code: r.aipReferenceCode, description: r.description });
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="font-medium">{r.aipReferenceCode}</span>
              <span className="text-xs text-muted-foreground">{r.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SaaobSearchCombobox ──────────────────────────────────────────────────────

function SaaobSearchCombobox({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (val: { id: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<BetterFetchResponse<SaaobSearchResponse, ApiResponseException>>(
    open && query.length >= 2 ? `/api/saaob/search?query=${encodeURIComponent(query)}` : null,
    $fetch,
  );

  const results = data?.data?.data ?? [];

  function renderNodes(nodes: Array<SaaobSearchGroup | SaaobSearchEntry>, depth = 0) {
    return nodes.map(node => {
      if (isSaaobGroup(node)) {
        return (
          <div key={node.id}>
            <div
              className="px-3 py-1 text-xs font-semibold text-muted-foreground select-none"
              style={{ paddingLeft: `${12 + depth * 12}px` }}
            >
              {node.name}
            </div>
            {renderNodes(node.children, depth + 1)}
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
            setOpen(false);
            setQuery("");
          }}
        >
          <span>{node.name}</span>
          {node.accountCode && <span className="text-xs text-muted-foreground">{node.accountCode}</span>}
        </button>
      );
    });
  }

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        placeholder="Search SAAOB entry…"
        value={open ? query : (value ? value.name : "")}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
      />
      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>}
          {!isLoading && results.length === 0 && query.length >= 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No results found.</div>
          )}
          {!isLoading && query.length < 2 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Type at least 2 characters to search.</div>
          )}
          {renderNodes(results)}
        </div>
      )}
    </div>
  );
}

// ─── ObrRequestViewDialog ─────────────────────────────────────────────────────

function ObrRequestViewDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<ObrRequestDetailResponse, ApiResponseException>
  >(open && id ? `/api/obr/requests/${id}` : null, $fetch);

  const detail = data?.data?.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-[75%]">
        <DialogHeader>
          <DialogTitle>OBR Request Details</DialogTitle>
          <DialogDescription>Original OBR request information.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[62vh] overflow-y-auto pr-2">
          {isLoading && <Loading />}
          {(error || data?.error || (!isLoading && !detail)) && <DeadHamster />}
          {detail && (
            <div className="flex flex-col gap-6 pb-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">Request Number</Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.requestNumber}</Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">Type</Typography>
                  <Typography variant="p" className="capitalize not-first:mt-0">{detail.type}</Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">Payee</Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.payee}</Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">Office Address</Typography>
                  <Typography variant="p" className="not-first:mt-0">{detail.officeAddress}</Typography>
                </div>
              </div>
              <Separator />
              <div>
                <Typography variant="h4" className="mb-3">Request Items</Typography>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Expense Code</TableHead>
                      <TableHead>Responsibility Center</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.requestItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{item.particulars}</TableCell>
                        <TableCell>{item.expenseCode.name}</TableCell>
                        <TableCell>{item.responsibilityCenter.name}</TableCell>
                        <TableCell className="text-right font-mono">
                          {`${parseFloat(item.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Separator />
              <div>
                <Typography variant="h4" className="mb-3">Approvers</Typography>
                <div className="flex flex-col gap-3">
                  {detail.approvers.map((approver, idx) => (
                    <div key={`${approver.position.id}-${idx}`} className="flex items-start justify-between rounded-md border p-3">
                      <div className="flex flex-col gap-1">
                        <Typography variant="small" className="font-medium">{approver.position.name}</Typography>
                        {approver.signer
                          ? <Typography variant="small" className="text-muted-foreground">Signed by: {approver.signer.name}</Typography>
                          : <Typography variant="small" className="text-muted-foreground">Not yet signed</Typography>}
                        {approver.signedAt && (
                          <Typography variant="small" className="text-muted-foreground">{formatRequestDate(approver.signedAt)}</Typography>
                        )}
                      </div>
                      <ApprovalStatusBadge status={approver.status} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── AIP ref helpers ──────────────────────────────────────────────────────────

function aipRefToRow(ref: ObrMainDataAipReference): AipRefRow {
  return {
    rowId: ref.id,
    aipId: ref.aipReferenceId,
    aipCode: ref.aipCode,
    aipDescription: ref.aipDescription,
    amount: ref.amount,
  };
}

function AipRefList({
  aipRefs,
  onChange,
  disabled,
}: {
  aipRefs: AipRefRow[];
  onChange: (refs: AipRefRow[]) => void;
  disabled: boolean;
}) {
  const handleAdd = () => {
    onChange([...aipRefs, { rowId: crypto.randomUUID(), aipId: "", aipCode: "", aipDescription: "", amount: "" }]);
  };

  const handleRemove = (rowId: string) => {
    onChange(aipRefs.filter(r => r.rowId !== rowId));
  };

  const handleSelect = (rowId: string, val: { id: string; code: string; description: string }) => {
    onChange(aipRefs.map(r => r.rowId === rowId ? { ...r, aipId: val.id, aipCode: val.code, aipDescription: val.description } : r));
  };

  const handleAmount = (rowId: string, amount: string) => {
    onChange(aipRefs.map(r => r.rowId === rowId ? { ...r, amount } : r));
  };

  return (
    <div className="flex flex-col gap-2">
      <Typography variant="muted" className="text-xs font-semibold uppercase">
        AIP References
      </Typography>
      {aipRefs.map(ref => (
        <div key={ref.rowId} className="flex items-end gap-2">
          <AipSearchCombobox
            value={ref.aipId ? { id: ref.aipId, code: ref.aipCode, description: ref.aipDescription } : null}
            onChange={val => handleSelect(ref.rowId, val)}
          />
          <div className="w-36 shrink-0">
            <Input
              placeholder="Amount"
              value={ref.amount}
              onChange={e => handleAmount(ref.rowId, e.target.value)}
              disabled={disabled}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => handleRemove(ref.rowId)}
            disabled={disabled}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className="w-full" onClick={handleAdd} disabled={disabled}>
        + Add AIP Reference
      </Button>
    </div>
  );
}

// ─── ValidRequestCombobox ─────────────────────────────────────────────────────

function ValidRequestCombobox({
  value,
  onChange,
  requests,
  isLoading,
  disabled,
}: {
  value: ObrRequestSummaryItem | null;
  onChange: (req: ObrRequestSummaryItem | null) => void;
  requests: ObrRequestSummaryItem[];
  isLoading: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? requests.filter(r =>
      r.requestNumber.toLowerCase().includes(query.toLowerCase())
        || (r.payee?.toLowerCase().includes(query.toLowerCase()) ?? false),
    )
    : requests;

  const displayValue = value ? `${value.requestNumber} — ${value.payee ?? "-"}` : "";

  return (
    <div className="relative flex flex-1 flex-col gap-1">
      <Input
        placeholder="Search by request number or payee…"
        value={open ? query : displayValue}
        onFocus={() => { if (!disabled) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => setQuery(e.target.value)}
        disabled={disabled}
      />
      {open && (
        <div className="absolute top-full z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {isLoading && (
            <div className="px-3 py-2 text-sm text-muted-foreground">Loading requests…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {query.trim() ? "No requests match your search." : "No approved requests available."}
            </div>
          )}
          {filtered.map(r => (
            <button
              key={r.id}
              type="button"
              className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={() => {
                onChange(r);
                setOpen(false);
                setQuery("");
              }}
            >
              <span className="font-medium">{r.requestNumber}</span>
              <span className="text-xs text-muted-foreground">{r.payee ?? "-"}</span>
              {r.obrNumber && (
                <span className="text-xs text-muted-foreground">OBR: {r.obrNumber}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ObrMainDataCreateDialog ──────────────────────────────────────────────────

function ObrMainDataCreateDialog({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();

  const { data: validRequestsData, isLoading: validRequestsLoading } = useSWR<
    BetterFetchResponse<ObrRequestSummaryListResponse, ApiResponseException>
  >("/api/obr/main/valid", $fetch);
  const validRequests = validRequestsData?.data?.data ?? [];

  const { data: officeCodesData } = useSWR<BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>>(
    "/api/management/data/office-codes",
    $fetch,
  );
  const officeCodes = officeCodesData?.data?.data ?? [];

  const { data: expenseClassesData } = useSWR<BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>>(
    "/api/management/data/expense-classes",
    $fetch,
  );
  const allExpenseClasses = expenseClassesData?.data?.data ?? [];

  const [linkedRequest, setLinkedRequest] = useState<ObrRequestSummaryItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [baseObrNumber, setBaseObrNumber] = useState("");
  const [items, setItems] = useState<CreateItemRow[]>([emptyCreateItem()]);
  const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const updateItem = useCallback((rowId: string, patch: Partial<Omit<CreateItemRow, "rowId">>) => {
    setItems(prev => prev.map(item => item.rowId === rowId ? { ...item, ...patch } : item));
  }, []);

  const toggleCollapsed = (rowId: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  const handleRequestSelect = async (req: ObrRequestSummaryItem | null) => {
    setLinkedRequest(req);
    if (!req) {
      setItems([emptyCreateItem()]);
      setCollapsedItems(new Set());
      return;
    }

    if (req.obrNumber) setBaseObrNumber(req.obrNumber);

    setDetailLoading(true);
    try {
      const res = await fetch(`/api/obr/requests/${req.id}`);
      if (res.ok) {
        const json: { data: ObrRequestDetail } = await res.json();
        const detail = json.data;

        if (detail.requestItems.length === 0) {
          setItems([emptyCreateItem()]);
          setCollapsedItems(new Set());
          return;
        }

        const newItems: CreateItemRow[] = detail.requestItems.map(ri => ({
          rowId: crypto.randomUUID(),
          payee: String(detail.payee ?? ""),
          address: String(detail.officeAddress ?? ""),
          responsibilityCenterId: String(ri.responsibilityCenter.id ?? ""),
          expenseCodeId: String(ri.expenseCode.id ?? ""),
          particulars: String(ri.particulars ?? ""),
          amount: String(ri.amount ?? ""),
          prNumber: String(detail.prNumber ?? ""),
          prAmount: "",
          saaob: null,
          aipRefs: [],
        }));
        setItems(newItems);
        // Collapse all but the first item when there are multiple
        if (newItems.length > 1) {
          setCollapsedItems(new Set(newItems.slice(1).map(i => i.rowId)));
        } else {
          setCollapsedItems(new Set());
        }
      }
    } catch {
      setItems([emptyCreateItem()]);
      setCollapsedItems(new Set());
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAddItem = () => {
    const newItem = emptyCreateItem();
    setItems(prev => [...prev, newItem]);
  };

  const handleRemoveItem = (rowId: string) => {
    setItems(prev => prev.filter(i => i.rowId !== rowId));
    setCollapsedItems(prev => { const next = new Set(prev); next.delete(rowId); return next; });
  };

  const getComputedObrNumber = (idx: number) =>
    items.length > 1 ? `${baseObrNumber}-${idx + 1}` : baseObrNumber;

  const handleSave = async () => {
    if (submitting || detailLoading) return;

    if (!baseObrNumber.trim()) {
      setActionError("OBR Number is required.");
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      if (!item.payee.trim() || !item.address.trim() || !item.responsibilityCenterId || !item.expenseCodeId || !item.particulars.trim() || !String(item.amount).trim()) {
        setActionError(`Please fill in all required fields for Item ${i + 1}.`);
        return;
      }
    }

    setSubmitting(true);
    setActionError(null);

    try {
      const body = {
        obrNumber: baseObrNumber.trim(),
        ...(linkedRequest ? { requestId: linkedRequest.id } : {}),
        items: items.map(item => ({
          payee: item.payee.trim(),
          address: item.address.trim(),
          responsibilityCenterId: item.responsibilityCenterId,
          expenseCodeId: item.expenseCodeId,
          particulars: item.particulars.trim(),
          amount: String(item.amount).trim(),
          ...(item.prNumber.trim() ? { prNumber: item.prNumber.trim() } : {}),
          ...(item.prAmount.trim() ? { prAmount: item.prAmount.trim() } : {}),
          ...(item.saaob ? { saaobId: item.saaob.id } : {}),
          aipReferences: item.aipRefs
            .filter(r => r.aipId)
            .map(r => ({ aipId: r.aipId, amount: r.amount })),
        })),
      };

      const response = await fetch("/api/obr/main", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to create OBR main data. Please try again.");
        return;
      }

      onSuccess();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isRequestLinked = linkedRequest !== null;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] min-w-[75%]">
        <DialogHeader>
          <DialogTitle>New OBR Main Data</DialogTitle>
          <DialogDescription>
            {isRequestLinked
              ? `Creating ${items.length} item${items.length > 1 ? "s" : ""} from linked request — adjust fields before saving.`
              : "Create a standalone OBR main data record. Linking a request is optional and will autofill details."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] pr-1">
          <div className="flex flex-col gap-4 pb-2">
            {/* Linked request selector — full width, top */}
            <div className="flex flex-col gap-1">
              <Label>Link to Approved Request</Label>
              <div className="flex items-center gap-2">
                <ValidRequestCombobox
                  value={linkedRequest}
                  onChange={handleRequestSelect}
                  requests={validRequests}
                  isLoading={validRequestsLoading}
                  disabled={submitting || detailLoading}
                />
                {linkedRequest && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => handleRequestSelect(null)}
                    disabled={submitting || detailLoading}
                  >
                    Clear
                  </Button>
                )}
              </div>
              {detailLoading && (
                <Typography variant="muted" className="text-xs">
                  Loading request details…
                </Typography>
              )}
            </div>

            <Separator />

            {/* Global OBR Number */}
            <div className="flex flex-col gap-1 md:w-1/3">
              <Label htmlFor={`${baseId}-obrNumber`}>
                OBR Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`${baseId}-obrNumber`}
                placeholder="e.g. 099"
                value={baseObrNumber}
                onChange={e => setBaseObrNumber(e.target.value)}
                disabled={submitting}
              />
              {items.length > 1 && baseObrNumber.trim() && (
                <Typography variant="muted" className="text-xs">
                  Items will be numbered: {baseObrNumber}-1 … {baseObrNumber}-{items.length}
                </Typography>
              )}
            </div>

            <Separator />

            {/* Per-item sections */}
            <div className="flex flex-col gap-3">
              {items.map((item, idx) => {
                const computedObr = getComputedObrNumber(idx);
                const isCollapsed = collapsedItems.has(item.rowId);
                return (
                  <div key={item.rowId} className="rounded-lg border overflow-hidden">
                    {/* Item header */}
                    <div
                      className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/40 cursor-pointer select-none"
                      onClick={() => toggleCollapsed(item.rowId)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Item {idx + 1}</Badge>
                        {computedObr && (
                          <span className="text-xs font-mono text-muted-foreground">OBR: {computedObr}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isRequestLinked && items.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-6 text-destructive hover:text-destructive"
                            onClick={e => { e.stopPropagation(); handleRemoveItem(item.rowId); }}
                            disabled={submitting}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isCollapsed ? "" : "rotate-180"}`} />
                      </div>
                    </div>

                    {/* Item fields */}
                    {!isCollapsed && (
                      <div className="flex flex-col gap-3 p-3">
                        {/* Payee + Address */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`${baseId}-${item.rowId}-payee`}>
                              Payee <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id={`${baseId}-${item.rowId}-payee`}
                              value={item.payee}
                              onChange={e => updateItem(item.rowId, { payee: e.target.value })}
                              disabled={submitting || detailLoading}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`${baseId}-${item.rowId}-address`}>
                              Address <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id={`${baseId}-${item.rowId}-address`}
                              value={item.address}
                              onChange={e => updateItem(item.rowId, { address: e.target.value })}
                              disabled={submitting || detailLoading}
                            />
                          </div>
                        </div>

                        {/* RC + Expense Code */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`${baseId}-${item.rowId}-rc`}>
                              Responsibility Center <span className="text-destructive">*</span>
                            </Label>
                            <Select
                              value={item.responsibilityCenterId}
                              onValueChange={v => updateItem(item.rowId, { responsibilityCenterId: v })}
                              disabled={submitting || detailLoading}
                            >
                              <SelectTrigger id={`${baseId}-${item.rowId}-rc`}>
                                <SelectValue placeholder="Select RC…" />
                              </SelectTrigger>
                              <SelectContent>
                                {officeCodes.map(oc => (
                                  <SelectItem key={oc.id} value={oc.id}>
                                    {oc.aa}{oc.office?.name ? ` — ${oc.office.name}` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`${baseId}-${item.rowId}-ec`}>
                              Expense Code <span className="text-destructive">*</span>
                            </Label>
                            <Select
                              value={item.expenseCodeId}
                              onValueChange={v => updateItem(item.rowId, { expenseCodeId: v })}
                              disabled={submitting || detailLoading}
                            >
                              <SelectTrigger id={`${baseId}-${item.rowId}-ec`}>
                                <SelectValue placeholder="Select expense code…" />
                              </SelectTrigger>
                              <SelectContent>
                                {allExpenseClasses.map(ec => (
                                  <SelectItem key={ec.id} value={ec.id}>
                                    {ec.accountName}{ec.accountCode ? ` (${ec.accountCode})` : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* PR Number + PR Amount */}
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`${baseId}-${item.rowId}-prNumber`}>PR Number</Label>
                            <Input
                              id={`${baseId}-${item.rowId}-prNumber`}
                              placeholder="Optional"
                              value={item.prNumber}
                              onChange={e => updateItem(item.rowId, { prNumber: e.target.value })}
                              disabled={submitting || detailLoading}
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor={`${baseId}-${item.rowId}-prAmount`}>PR Amount</Label>
                            <Input
                              id={`${baseId}-${item.rowId}-prAmount`}
                              placeholder="0.00"
                              value={item.prAmount}
                              onChange={e => updateItem(item.rowId, { prAmount: e.target.value })}
                              disabled={submitting || detailLoading}
                            />
                          </div>
                        </div>

                        {/* Particulars */}
                        <div className="flex flex-col gap-1">
                          <Label htmlFor={`${baseId}-${item.rowId}-particulars`}>
                            Particulars <span className="text-destructive">*</span>
                          </Label>
                          <Textarea
                            id={`${baseId}-${item.rowId}-particulars`}
                            rows={3}
                            value={item.particulars}
                            onChange={e => updateItem(item.rowId, { particulars: e.target.value })}
                            disabled={submitting || detailLoading}
                          />
                        </div>

                        {/* Amount */}
                        <div className="flex flex-col gap-1 md:w-1/2">
                          <Label htmlFor={`${baseId}-${item.rowId}-amount`}>
                            Amount (Obligated) <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            id={`${baseId}-${item.rowId}-amount`}
                            placeholder="0.00"
                            value={item.amount}
                            onChange={e => updateItem(item.rowId, { amount: e.target.value })}
                            disabled={submitting || detailLoading}
                          />
                        </div>

                        <Separator />

                        {/* SAAOB Link */}
                        <div className="flex flex-col gap-2">
                          <Typography variant="muted" className="text-xs font-semibold uppercase">
                            SAAOB Link
                          </Typography>
                          <div className="flex items-center gap-2">
                            <SaaobSearchCombobox
                              value={item.saaob}
                              onChange={v => updateItem(item.rowId, { saaob: v })}
                            />
                            {item.saaob && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="shrink-0 text-destructive hover:text-destructive"
                                onClick={() => updateItem(item.rowId, { saaob: null })}
                                disabled={submitting}
                              >
                                Clear
                              </Button>
                            )}
                          </div>
                        </div>

                        <Separator />

                        {/* AIP References */}
                        <AipRefList
                          aipRefs={item.aipRefs}
                          onChange={refs => updateItem(item.rowId, { aipRefs: refs })}
                          disabled={submitting || detailLoading}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add item button — only when no request linked */}
            {!isRequestLinked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={handleAddItem}
                disabled={submitting}
              >
                <Plus className="mr-1 size-4" />
                Add Item
              </Button>
            )}
          </div>
        </ScrollArea>

        {actionError && (
          <Typography variant="small" className="text-destructive">
            {actionError}
          </Typography>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting || detailLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={submitting || detailLoading}>
            {submitting
              ? "Creating…"
              : detailLoading
                ? "Loading…"
                : items.length > 1
                  ? `Create ${items.length} Items`
                  : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ObrMainDataEditDialog ────────────────────────────────────────────────────

function ObrMainDataEditDialog({
  item,
  onSuccess,
  onClose,
}: {
  item: ObrMainDataItemResponse;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const baseId = useId();

  const { data: officeCodesData } = useSWR<BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>>(
    "/api/management/data/office-codes",
    $fetch,
  );
  const officeCodes = officeCodesData?.data?.data ?? [];

  const { data: expenseClassesData } = useSWR<BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>>(
    "/api/management/data/expense-classes",
    $fetch,
  );
  const allExpenseClasses = expenseClassesData?.data?.data ?? [];

  const [obrNumber, setObrNumber] = useState(item.obrNumber);
  const [payee, setPayee] = useState(item.payee ?? "");
  const [address, setAddress] = useState(item.address);
  const [responsibilityCenterId, setResponsibilityCenterId] = useState(item.responsibilityCenter.id);
  const [expenseCodeId, setExpenseCodeId] = useState(item.expenseCode.id);
  const [particulars, setParticulars] = useState(item.particulars);
  const [amount, setAmount] = useState(item.obligated ?? "");
  const [prNumber, setPrNumber] = useState(item.prNumber ?? "");
  const [prAmount, setPrAmount] = useState(item.prAmount ?? "");
  const [aipRefs, setAipRefs] = useState<AipRefRow[]>(item.aipReferences.map(aipRefToRow));
  const [saaob, setSaaob] = useState<{ id: string; name: string } | null>(item.saaob);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const handleResponsibilityCenterChange = (id: string) => {
    setResponsibilityCenterId(id);
  };

  const handleSave = async () => {
    if (submitting) return;

    setSubmitting(true);
    setActionError(null);

    try {
      const body: Record<string, unknown> = {};
      if (obrNumber.trim()) body.obrNumber = obrNumber.trim();
      body.payee = payee.trim() ? payee.trim() : null;
      if (address.trim()) body.address = address.trim();
      if (responsibilityCenterId) body.responsibilityCenterId = responsibilityCenterId;
      if (expenseCodeId) body.expenseCodeId = expenseCodeId;
      if (particulars.trim()) body.particulars = particulars.trim();
      if (amount.trim()) body.amount = amount.trim();
      if (prNumber.trim()) body.prNumber = prNumber.trim();
      if (prAmount.trim()) body.prAmount = prAmount.trim();
      body.aipReferences = aipRefs.map(r => ({ aipId: r.aipId, amount: r.amount }));
      body.saaobId = saaob ? saaob.id : null;

      const response = await fetch(`/api/obr/main/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to update OBR main data. Please try again.");
        return;
      }

      onSuccess();
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
        <DialogContent className="max-h-[90vh] min-w-[75%]">
          <DialogHeader>
            <DialogTitle>Edit OBR Main Data</DialogTitle>
            <DialogDescription>
              Update the details for OBR record{" "}
              <span className="font-medium">{item.obrNumber}</span>.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-1">
            <div className="flex flex-col gap-4 pb-2">
              {/* Read-only computed info */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label>Date</Label>
                  <DetailText value={formatDate(item.date)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>ALOBS</Label>
                  <DetailText value={item.alobs} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Quarter</Label>
                  <DetailText value={`Q${item.quarter}`} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Disbursed</Label>
                  <DetailText value={formatCurrency(item.disbursed)} className="font-mono" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Variance (Disbursed)</Label>
                  <DetailText value={formatCurrency(item.varianceDisbursed)} className="font-mono" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Var OBR vs F4</Label>
                  <DetailText value={formatCurrency(item.varObrVsF4)} className="font-mono" />
                </div>
              </div>

              <Separator />

              {/* Editable fields */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-obrNumber`}>OBR Number</Label>
                  <Input
                    id={`${baseId}-obrNumber`}
                    value={obrNumber}
                    onChange={e => setObrNumber(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-prNumber`}>PR Number</Label>
                  <Input
                    id={`${baseId}-prNumber`}
                    placeholder="Optional"
                    value={prNumber}
                    onChange={e => setPrNumber(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-prAmount`}>PR Amount</Label>
                  <Input
                    id={`${baseId}-prAmount`}
                    placeholder="0.00"
                    value={prAmount}
                    onChange={e => setPrAmount(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-payee`}>Payee</Label>
                  <Input
                    id={`${baseId}-payee`}
                    value={payee}
                    onChange={e => setPayee(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-address`}>Address</Label>
                  <Input
                    id={`${baseId}-address`}
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-rc`}>Responsibility Center</Label>
                  <Select
                    value={responsibilityCenterId}
                    onValueChange={handleResponsibilityCenterChange}
                    disabled={submitting}
                  >
                    <SelectTrigger id={`${baseId}-rc`}>
                      <SelectValue placeholder="Select responsibility center…" />
                    </SelectTrigger>
                    <SelectContent>
                      {officeCodes.map(oc => (
                        <SelectItem key={oc.id} value={oc.id}>
                          {oc.aa}{oc.office?.name ? ` — ${oc.office.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-ec`}>Expense Code</Label>
                  <Select
                    value={expenseCodeId}
                    onValueChange={setExpenseCodeId}
                    disabled={submitting}
                  >
                    <SelectTrigger id={`${baseId}-ec`}>
                      <SelectValue placeholder="Select expense code…" />
                    </SelectTrigger>
                    <SelectContent>
                      {allExpenseClasses.map(ec => (
                        <SelectItem key={ec.id} value={ec.id}>
                          {ec.accountName}{ec.accountCode ? ` (${ec.accountCode})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-1 md:col-span-1">
                  <Label htmlFor={`${baseId}-particulars`}>Particulars</Label>
                  <Textarea
                    id={`${baseId}-particulars`}
                    rows={3}
                    value={particulars}
                    onChange={e => setParticulars(e.target.value)}
                    disabled={submitting}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-amount`}>Amount (Obligated)</Label>
                  <Input
                    id={`${baseId}-amount`}
                    placeholder="0.00"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>

              <Separator />

              <div className="flex flex-col gap-2">
                <Typography variant="muted" className="text-xs font-semibold uppercase">
                  SAAOB Link
                </Typography>
                <div className="flex items-center gap-2">
                  <SaaobSearchCombobox value={saaob} onChange={setSaaob} />
                  {saaob && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setSaaob(null)}
                      disabled={submitting}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <AipRefList aipRefs={aipRefs} onChange={setAipRefs} disabled={submitting} />
            </div>
          </ScrollArea>

          {actionError && (
            <Typography variant="small" className="text-destructive">
              {actionError}
            </Typography>
          )}

          <DialogFooter className="flex-row items-center justify-between sm:justify-between">
            {item.requestSourceId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setViewOpen(true)}
                disabled={submitting}
              >
                View Original Request
              </Button>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        className="pointer-events-none"
                      >
                        View Original Request
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Request information for this OBR is not available</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button onClick={handleSave} disabled={submitting}>
                {submitting ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ObrRequestViewDialog
        id={item.requestSourceId}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </>
  );
}
