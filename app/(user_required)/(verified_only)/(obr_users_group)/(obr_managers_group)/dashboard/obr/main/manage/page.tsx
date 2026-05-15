"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  AipSearchResultItem,
  BetterFetchResponse,
  ObrMainDataAipReference,
  ObrMainDataItemResponse,
  ObrMainDataListResponse,
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
import { Separator } from "@/components/ui/separator";
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

type AipRefRow = {
  rowId: string;
  aipId: string;
  aipCode: string;
  aipDescription: string;
  amount: string;
};

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

  return `${sign}PHP ${intWithGrouping}.${fractionalPart}`;
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
  const [editOpen, setEditOpen] = useState(false);

  const tableScrollRef = useRef<HTMLDivElement | null>(null);

  const items = data?.data?.data ?? [];

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

  const handleRowDoubleClick = useCallback((item: ObrMainDataItemResponse) => {
    setSelected(item);
    setEditOpen(true);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    setEditOpen(next);
    if (!next) setSelected(null);
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex flex-col gap-3 p-4 pt-0 w-full">
      <div className="border rounded-lg p-2">
        {items.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No OBR main data records found.
          </div>
        ) : (
          <div
            ref={tableScrollRef}
            className="h-[calc(100vh-6.7rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible"
          >
            <Table className="text-xs [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="min-w-32">OBR</TableHead>
                  <TableHead className="min-w-48">ALOBS</TableHead>
                  <TableHead className="min-w-28">Date</TableHead>
                  <TableHead className="w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words">Payee</TableHead>
                  <TableHead className="w-[220px] min-w-[220px] max-w-[220px] whitespace-normal break-words">Address</TableHead>
                  <TableHead className="min-w-44">Responsibility Center</TableHead>
                  <TableHead className="w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words">Expense Name</TableHead>
                  <TableHead className="min-w-36">Account Code</TableHead>
                  <TableHead className="min-w-28">PR #</TableHead>
                  <TableHead className="w-[360px] min-w-[360px] max-w-[360px] whitespace-normal break-words">Particulars</TableHead>
                  <TableHead className="min-w-36 text-right">Obligated</TableHead>
                  <TableHead className="min-w-36 text-right">PR Amount</TableHead>
                  <TableHead className="min-w-36 text-right">Disbursed</TableHead>
                  <TableHead className="min-w-40 text-right">Variance Disbursed</TableHead>
                  <TableHead className="min-w-36 text-right">VAR OBR VS F4</TableHead>
                  <TableHead className="min-w-28">Quarter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paddingTop > 0 && (
                  <TableRow>
                    <TableCell colSpan={16} style={{ height: `${paddingTop}px` }} />
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
                      className={`cursor-pointer select-none ${isSelected ? "bg-accent" : ""}`}
                      title="Double-click to edit"
                      onDoubleClick={() => handleRowDoubleClick(item)}
                    >
                      <TableCell className="font-medium">{item.obrNumber}</TableCell>
                      <TableCell>{item.alobs}</TableCell>
                      <TableCell>{formatDate(item.date)}</TableCell>
                      <TableCell className="w-[320px] min-w-[320px] max-w-[320px] whitespace-normal break-words align-top">{item.payee}</TableCell>
                      <TableCell className="w-[220px] min-w-[220px] max-w-[220px] whitespace-normal break-words align-top">{item.address}</TableCell>
                      <TableCell>{item.responsibilityCenter.name}</TableCell>
                      <TableCell className="w-[240px] min-w-[240px] max-w-[240px] whitespace-normal break-words align-top">{item.expenseCode.expenseName}</TableCell>
                      <TableCell>{item.expenseCode.accountCode ?? "-"}</TableCell>
                      <TableCell>{item.prNumber || "-"}</TableCell>
                      <TableCell className="w-[360px] min-w-[360px] max-w-[360px] whitespace-normal break-words align-top">{item.particulars}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.obligated)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.prAmount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.disbursed)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.varianceDisbursed)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.varObrVsF4)}</TableCell>
                      <TableCell>Quarter {item.quarter}</TableCell>
                    </TableRow>
                  );
                })}

                {paddingBottom > 0 && (
                  <TableRow>
                    <TableCell colSpan={16} style={{ height: `${paddingBottom}px` }} />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selected && (
        <ObrMainDataEditDialog
          item={selected}
          open={editOpen}
          onOpenChange={handleOpenChange}
          onSuccess={() => mutate()}
        />
      )}
    </div>
  );
}

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
                          {`PHP ${parseFloat(item.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`}
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

function aipRefToRow(ref: ObrMainDataAipReference): AipRefRow {
  return {
    rowId: ref.id,
    aipId: ref.aipReferenceId,
    aipCode: ref.aipCode,
    aipDescription: ref.aipDescription,
    amount: ref.amount,
  };
}

function ObrMainDataEditDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: {
  item: ObrMainDataItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const baseId = useId();
  const [obrNumber, setObrNumber] = useState(item.obrNumber);
  const [prNumber, setPrNumber] = useState(item.prNumber ?? "");
  const [prAmount, setPrAmount] = useState(item.prAmount ?? "");
  const [aipRefs, setAipRefs] = useState<AipRefRow[]>(item.aipReferences.map(aipRefToRow));
  const [saaob, setSaaob] = useState<{ id: string; name: string } | null>(item.saaob);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  const handleAddAip = () => {
    setAipRefs(prev => [
      ...prev,
      { rowId: crypto.randomUUID(), aipId: "", aipCode: "", aipDescription: "", amount: "" },
    ]);
  };

  const handleRemoveAip = (rowId: string) => {
    setAipRefs(prev => prev.filter(r => r.rowId !== rowId));
  };

  const handleAipSelect = (rowId: string, val: { id: string; code: string; description: string }) => {
    setAipRefs(prev =>
      prev.map(r => r.rowId === rowId ? { ...r, aipId: val.id, aipCode: val.code, aipDescription: val.description } : r),
    );
  };

  const handleAipAmount = (rowId: string, amount: string) => {
    setAipRefs(prev => prev.map(r => r.rowId === rowId ? { ...r, amount } : r));
  };

  const handleSave = async () => {
    if (submitting) return;

    setSubmitting(true);
    setActionError(null);

    try {
      const body: Record<string, unknown> = {};
      if (obrNumber.trim()) body.obrNumber = obrNumber.trim();
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
      onOpenChange(false);
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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
              {/* Read-only info */}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                  <Label>Payee</Label>
                  <DetailText value={item.payee} />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <Label>Address</Label>
                  <DetailText value={item.address} />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-3">
                  <Label>Particulars</Label>
                  <DetailText value={item.particulars} className="min-h-10" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Responsibility Center</Label>
                  <DetailText value={item.responsibilityCenter.name} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Expense Code</Label>
                  <DetailText value={item.expenseCode.expenseName} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Obligated</Label>
                  <DetailText value={formatCurrency(item.obligated)} className="font-mono" />
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

              <div className="flex flex-col gap-2">
                <Typography variant="muted" className="text-xs font-semibold uppercase">
                  AIP References
                </Typography>

                {aipRefs.map(ref => (
                  <div key={ref.rowId} className="flex items-end gap-2">
                    <AipSearchCombobox
                      value={ref.aipId ? { id: ref.aipId, code: ref.aipCode, description: ref.aipDescription } : null}
                      onChange={val => handleAipSelect(ref.rowId, val)}
                    />
                    <div className="w-36 shrink-0">
                      <Input
                        placeholder="Amount"
                        value={ref.amount}
                        onChange={e => handleAipAmount(ref.rowId, e.target.value)}
                        disabled={submitting}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleRemoveAip(ref.rowId)}
                      disabled={submitting}
                    >
                      Remove
                    </Button>
                  </div>
                ))}

                <Button type="button" variant="outline" className="w-full" onClick={handleAddAip} disabled={submitting}>
                  + Add AIP Reference
                </Button>
              </div>
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
              <DialogClose asChild>
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
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
