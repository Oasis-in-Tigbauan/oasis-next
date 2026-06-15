"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  ObrRequestSummaryListResponse,
  ObrRequestDetailResponse,
} from "@/lib/http/client/responses";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

// --- ApprovalStatusBadge ---

function ApprovalStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800">
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
    <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
      Pending
    </Badge>
  );
}

// --- Page ---

export default function Page() {
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<BetterFetchResponse<ObrRequestSummaryListResponse, ApiResponseException>>(
    "/api/obr/requests",
    $fetch,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [bulkApproveOpen, setBulkApproveOpen] = useState(false);
  const [bulkDeclineOpen, setBulkDeclineOpen] = useState(false);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  if (listLoading) {
    return <Loading />;
  }

  if (listError || listData?.error || !listData?.data?.data) {
    return <DeadHamster />;
  }

  const requests = listData.data.data;
  const hasSelection = selectedRequestIds.size > 0;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="flex items-center gap-1 p-2 border rounded-lg w-full">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-green-700 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
          disabled={!hasSelection}
          onClick={() => setBulkApproveOpen(true)}
        >
          Bulk Approve
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs text-destructive hover:text-destructive"
          disabled={!hasSelection}
          onClick={() => setBulkDeclineOpen(true)}
        >
          Bulk Decline/Bin
        </Button>
      </div>

      <div className="border rounded-lg p-2">
        {requests.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No requests pending your approval.
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible">
            <Table className="border-separate border-spacing-0 text-sm [&_th]:border-r [&_td]:border-r [&_th:first-child]:border-l [&_td:first-child]:border-l">
              <TableHeader className="sticky top-0 z-10 bg-background [&_tr]:border-b-0 [&_th]:border-b [&_th]:bg-background">
                <TableRow>
                  <TableHead className="w-10 min-w-10" />
                  <TableHead>Request No.</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Office Address</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req, index) => {
                  const isSelected = selectedRequestIds.has(req.id);
                  return (
                    <TableRow
                      key={req.id}
                      className={`cursor-pointer select-none ${
                        isSelected
                          ? "bg-accent"
                          : index % 2 === 1
                            ? "bg-muted hover:bg-muted/50"
                            : ""
                      }`}
                      onClick={() => handleRowClick(req.id)}
                    >
                      <TableCell
                        className="p-0"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-center py-2">
                          <Checkbox
                            aria-label={`Select request ${req.requestNumber}`}
                            checked={isSelected}
                            onCheckedChange={checked => {
                              setSelectedRequestIds(prev => {
                                const next = new Set(prev);
                                if (checked === true) {
                                  next.add(req.id);
                                } else {
                                  next.delete(req.id);
                                }
                                return next;
                              });
                            }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{req.requestNumber}</TableCell>
                      <TableCell className="capitalize">{req.type}</TableCell>
                      <TableCell>{req.payee}</TableCell>
                      <TableCell>{req.officeAddress}</TableCell>
                      <TableCell className="text-right">{req.requestItemsCount}</TableCell>
                      <TableCell>
                        <ApprovalStatusBadge status={req.approvalStatus} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedId && (
        <ApprovalDetailDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={open => {
            setDetailOpen(open);
          }}
          onActionSuccess={() => {
            setSelectedRequestIds(prev => {
              if (!selectedId) return prev;
              const next = new Set(prev);
              next.delete(selectedId);
              return next;
            });
            mutateList();
          }}
        />
      )}

      <BulkApproveDialog
        open={bulkApproveOpen}
        onOpenChange={setBulkApproveOpen}
        selectedIds={[...selectedRequestIds]}
        onSuccess={succeededIds => {
          setSelectedRequestIds(prev => {
            const next = new Set(prev);
            succeededIds.forEach(id => next.delete(id));
            return next;
          });
          mutateList();
        }}
      />
      <BulkDeclineDialog
        open={bulkDeclineOpen}
        onOpenChange={setBulkDeclineOpen}
        selectedIds={[...selectedRequestIds]}
        onSuccess={succeededIds => {
          setSelectedRequestIds(prev => {
            const next = new Set(prev);
            succeededIds.forEach(id => next.delete(id));
            return next;
          });
          mutateList();
        }}
      />
    </div>
  );
}

// --- Approval Detail Dialog ---

function ApprovalDetailDialog({
  id,
  open,
  onOpenChange,
  onActionSuccess,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionSuccess: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<ObrRequestDetailResponse, ApiResponseException>
  >(open ? `/api/obr/requests/${id}` : null, $fetch);

  const detail = data?.data?.data;

  const [actionOpen, setActionOpen] = useState(false);

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;
    return `₱${num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateStr: Optional<string>) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-PH", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>OBR Request Details</DialogTitle>
            <DialogDescription>
              Review this obligation request before submitting your approval decision.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 overflow-y-auto pr-2">
            {isLoading && <Loading />}
            {(error || data?.error || (!isLoading && !detail)) && <DeadHamster />}
            {detail && (
              <div className="flex flex-col gap-6 pb-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      Request Number
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.requestNumber}</Typography>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      Type
                    </Typography>
                    <Typography variant="p" className="capitalize not-first:mt-0">
                      {detail.type}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      Payee
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.payee}</Typography>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      Office Address
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.officeAddress}</Typography>
                  </div>
                  {detail.obrNumber && (
                    <div className="flex flex-col gap-1">
                      <Typography variant="small" className="text-muted-foreground">
                        OBR Number
                      </Typography>
                      <Typography variant="p" className="not-first:mt-0">{detail.obrNumber}</Typography>
                    </div>
                  )}
                  {detail.prNumber && (
                    <div className="flex flex-col gap-1">
                      <Typography variant="small" className="text-muted-foreground">
                        PR Number
                      </Typography>
                      <Typography variant="p" className="not-first:mt-0">{detail.prNumber}</Typography>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      Originating Office
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.office.name}</Typography>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      Published By
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">{detail.publisher.name}</Typography>
                  </div>
                </div>

                <Separator />

                <div>
                  <Typography variant="h4" className="mb-3">
                    Request Items
                  </Typography>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Particulars</TableHead>
                        <TableHead>Expense Code</TableHead>
                        <TableHead>Account Code</TableHead>
                        <TableHead>Responsibility Center</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.requestItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.particulars}</TableCell>
                          <TableCell>{item.expenseCode.name}</TableCell>
                          <TableCell>{item.expenseCode.accountCode ?? "—"}</TableCell>
                          <TableCell>{item.responsibilityCenter.name}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatAmount(item.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                <div>
                  <Typography variant="h4" className="mb-3">
                    Approvers
                  </Typography>
                  <div className="flex flex-col gap-3">
                    {detail.approvers.map((approver, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between rounded-md border p-3"
                      >
                        <div className="flex flex-col gap-1">
                          <Typography variant="small" className="font-medium">
                            {approver.position.name}
                          </Typography>
                          {approver.signer ? (
                            <Typography variant="small" className="text-muted-foreground">
                              Signed by: {approver.signer.name}
                            </Typography>
                          ) : (
                            <Typography variant="small" className="text-muted-foreground">
                              Not yet signed
                            </Typography>
                          )}
                          {approver.reason && (
                            <Typography variant="small" className="text-muted-foreground">
                              Reason: {approver.reason}
                            </Typography>
                          )}
                          {approver.signedAt && (
                            <Typography variant="small" className="text-muted-foreground">
                              {formatDate(approver.signedAt)}
                            </Typography>
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

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            {detail && (
              <Button onClick={() => setActionOpen(true)}>
                Submit Decision
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && (
        <ApprovalActionDialog
          requestId={id}
          open={actionOpen}
          onOpenChange={setActionOpen}
          onSuccess={() => {
            setActionOpen(false);
            mutate();
            onActionSuccess();
          }}
        />
      )}
    </>
  );
}

// --- Bulk Action Helpers ---

async function submitBulkApproverState(
  selectedIds: string[],
  status: "approved" | "binned",
  reason?: string,
): Promise<{ succeededIds: string[]; failedCount: number }> {
  const results = await Promise.allSettled(
    selectedIds.map(async id => {
      const body: Record<string, string> = { status };
      if (reason?.trim()) body.reason = reason.trim();

      const res = await fetch(`/api/obr/requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("failed");
      return id;
    }),
  );

  const succeededIds: string[] = [];
  let failedCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      succeededIds.push(result.value);
    } else {
      failedCount += 1;
    }
  }

  return { succeededIds, failedCount };
}

// --- Bulk Approve Dialog ---

function BulkApproveDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: (succeededIds: string[]) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selectedIds.length;

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { succeededIds, failedCount } = await submitBulkApproverState(
        selectedIds,
        "approved",
      );

      if (succeededIds.length > 0) {
        onSuccess(succeededIds);
      }

      if (failedCount > 0) {
        setError(
          `${failedCount} request(s) could not be processed. They remain selected.`,
        );
        return;
      }

      onOpenChange(false);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Approve Requests</DialogTitle>
          <DialogDescription>
            You are about to approve <strong>{count}</strong> request
            {count === 1 ? "" : "s"}. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Typography variant="small" className="text-destructive">
            {error}
          </Typography>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            className="text-green-700 hover:text-green-700 dark:text-green-400 dark:hover:text-green-400"
            onClick={handleSubmit}
            disabled={submitting || count === 0}
          >
            {submitting ? "Approving…" : `Approve ${count} Request${count === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Bulk Decline Dialog ---

function BulkDeclineDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSuccess: (succeededIds: string[]) => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selectedIds.length;

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setReason("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { succeededIds, failedCount } = await submitBulkApproverState(
        selectedIds,
        "binned",
        reason,
      );

      if (succeededIds.length > 0) {
        onSuccess(succeededIds);
      }

      if (failedCount > 0) {
        setError(
          `${failedCount} request(s) could not be processed. They remain selected.`,
        );
        return;
      }

      onOpenChange(false);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Decline/Bin Requests</DialogTitle>
          <DialogDescription>
            You are about to decline/bin <strong>{count}</strong> request
            {count === 1 ? "" : "s"}. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <FieldGroup>
            <Field>
              <Label>
                Reason{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="Enter decline reason…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={submitting}
              />
            </Field>
          </FieldGroup>

          {error && (
            <Typography variant="small" className="text-destructive">
              {error}
            </Typography>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || count === 0}
          >
            {submitting
              ? "Declining…"
              : `Decline/Bin ${count} Request${count === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Approval Action Dialog ---

function ApprovalActionDialog({
  requestId,
  open,
  onOpenChange,
  onSuccess,
}: {
  requestId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<"approved" | "binned" | "pending">("approved");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatus("approved");
      setReason("");
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = { status };
      if (reason.trim()) body.reason = reason.trim();

      const res = await fetch(`/api/obr/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.message ?? "Failed to submit decision. Please try again.");
        return;
      }

      onSuccess();
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Approval Decision</DialogTitle>
          <DialogDescription>
            Choose your decision for this request. A reason is optional but recommended when binning.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <FieldGroup>
            <Field>
              <Label>Decision</Label>
              <Select
                value={status}
                onValueChange={v => setStatus(v as typeof status)}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="binned">Binned</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                placeholder="Enter reason…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                disabled={submitting}
              />
            </Field>
          </FieldGroup>

          {error && (
            <Typography variant="small" className="text-destructive">
              {error}
            </Typography>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
