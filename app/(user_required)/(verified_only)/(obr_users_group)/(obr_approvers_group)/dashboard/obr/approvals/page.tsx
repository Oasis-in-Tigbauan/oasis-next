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
  TableCaption,
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

  return (
    <div className="relative flex flex-col p-4">
      <Typography variant="h3" className="mb-4 grow">OBR Approvals</Typography>

      <Table>
        {requests.length === 0 && (
          <TableCaption>No requests pending your approval.</TableCaption>
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
              onClick={() => handleRowClick(req.id)}
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

      {selectedId && (
        <ApprovalDetailDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={open => {
            setDetailOpen(open);
          }}
          onActionSuccess={() => mutateList()}
        />
      )}
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
