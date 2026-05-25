"use client";

import { useCallback, useId, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  AipSearchResultItem,
  BetterFetchResponse,
  ObrRequestDetailResponse,
  ObrRequestSummaryItem,
  ObrRequestSummaryListResponse,
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
  Table,
  TableBody,
  TableCaption,
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

function ApprovalStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <Badge className="border-green-200 bg-green-100 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-900/30 dark:text-green-400">
        Approved
      </Badge>
    );
  }
  if (status === "binned") {
    return <Badge variant="destructive">Binned</Badge>;
  }
  if (status === "mixed") {
    return <Badge variant="secondary">Mixed</Badge>;
  }
  return (
    <Badge className="border-amber-200 bg-amber-100 text-amber-700 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      Pending
    </Badge>
  );
}

function formatAmount(amount: string) {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return `${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string | null | undefined) {
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

export default function Page() {
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<BetterFetchResponse<ObrRequestSummaryListResponse, ApiResponseException>>(
    "/api/obr/main/valid",
    $fetch,
  );

  const [selected, setSelected] = useState<ObrRequestSummaryItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const handleRowClick = useCallback((item: ObrRequestSummaryItem) => {
    setSelected(item);
    setCreateOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setCreateOpen(open);
    if (!open) setSelected(null);
  }, []);

  if (listLoading) return <Loading />;

  if (listError || listData?.error || !listData?.data?.data) {
    return <DeadHamster />;
  }

  const requests = listData.data.data;

  return (
    <div className="relative flex w-full flex-col overflow-x-hidden p-4">
      <div className="w-full overflow-x-auto">
        <Table className="text-sm min-w-max">
          {requests.length === 0 && (
            <TableCaption>No approved OBR requests available for OBR main data creation.</TableCaption>
          )}
          <TableHeader>
            <TableRow>
              <TableHead>Request No.</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Payee</TableHead>
              <TableHead>Office Address</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map(req => (
              <TableRow
                key={req.id}
                className="cursor-pointer"
                onClick={() => handleRowClick(req)}
              >
                <TableCell className="font-medium">{req.requestNumber}</TableCell>
                <TableCell className="capitalize">{req.type}</TableCell>
                <TableCell>{req.payee}</TableCell>
                <TableCell>{req.officeAddress}</TableCell>
                <TableCell className="text-right">{req.requestItemsCount}</TableCell>
                <TableCell>
                  <ApprovalStatusBadge status={req.approvalStatus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <ObrMainDataCreateDialog
          item={selected}
          open={createOpen}
          onOpenChange={handleDialogOpenChange}
          onSuccess={() => mutateList()}
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

function ObrRequestViewDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, isLoading } = useSWR<
    BetterFetchResponse<ObrRequestDetailResponse, ApiResponseException>
  >(open ? `/api/obr/requests/${id}` : null, $fetch);

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
                        <TableCell className="text-right font-mono">{formatAmount(item.amount)}</TableCell>
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
                          <Typography variant="small" className="text-muted-foreground">{formatDate(approver.signedAt)}</Typography>
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

function ObrMainDataCreateDialog({
  item,
  open,
  onOpenChange,
  onSuccess,
}: {
  item: ObrRequestSummaryItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const baseId = useId();
  const [obrNumber, setObrNumber] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [prAmount, setPrAmount] = useState("");
  const [aipRefs, setAipRefs] = useState<AipRefRow[]>([]);
  const [saaob, setSaaob] = useState<{ id: string; name: string } | null>(null);
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

  const handleSubmit = async () => {
    if (submitting) return;

    setSubmitting(true);
    setActionError(null);

    try {
      const body: Record<string, unknown> = { requestId: item.id, obrNumber };
      if (prNumber.trim()) body.prNumber = prNumber.trim();
      if (prAmount.trim()) body.prAmount = prAmount.trim();
      if (aipRefs.length > 0) {
        body.aipReferences = aipRefs.map(r => ({ aipId: r.aipId, amount: r.amount }));
      }
      if (saaob) body.saaobId = saaob.id;

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
            <DialogTitle>Create OBR Main Data</DialogTitle>
            <DialogDescription>
              Fill in the details below to create OBR main data for request{" "}
              <span className="font-medium">{item.requestNumber}</span>.
              {item.requestItemsCount > 1 && (
                <span className="ml-1 text-muted-foreground">
                  ({item.requestItemsCount} items — OBR numbers will be suffixed automatically)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-1">
            <div className="flex flex-col gap-4 pb-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-obrNumber`}>OBR Number <span className="text-destructive">*</span></Label>
                  <Input
                    id={`${baseId}-obrNumber`}
                    placeholder="e.g. 001"
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setViewOpen(true)}
              disabled={submitting}
            >
              View Request Details
            </Button>
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={submitting}>Cancel</Button>
              </DialogClose>
              <Button onClick={handleSubmit} disabled={submitting || !obrNumber.trim()}>
                {submitting ? "Creating…" : "Create OBR Main Data"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ObrRequestViewDialog
        id={item.id}
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </>
  );
}
