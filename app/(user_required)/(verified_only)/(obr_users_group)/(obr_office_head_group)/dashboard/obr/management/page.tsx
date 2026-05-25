"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  ObrRequestDetailResponse,
  ObrRequestSummaryListResponse,
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

export default function Page() {
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<BetterFetchResponse<ObrRequestSummaryListResponse, ApiResponseException>>(
    "/api/obr/management/valid/requests",
    $fetch,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDetailOpen(open);
    if (!open) {
      setSelectedId(null);
    }
  }, []);

  if (listLoading) {
    return <Loading />;
  }

  if (listError || listData?.error || !listData?.data?.data) {
    return <DeadHamster />;
  }

  const requests = listData.data.data;

  return (
    <div className="relative flex w-full flex-col overflow-x-hidden p-4">
      <div className="w-full overflow-x-auto">
        <Table className="text-sm min-w-max">
          {requests.length === 0 && (
            <TableCaption>No approved OBR requests available for OBR item creation.</TableCaption>
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
            {requests.map((req, index) => (
              <TableRow
                key={req.id}
                className={`cursor-pointer ${index % 2 === 1 ? "bg-muted hover:bg-muted/50" : ""}`}
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
      </div>

      {selectedId && (
        <ObrManagementDetailDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={handleDialogOpenChange}
          onActionSuccess={() => mutateList()}
        />
      )}
    </div>
  );
}

function ObrManagementDetailDialog({
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

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const detail = data?.data?.data;

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (isNaN(num)) return amount;

    return `${num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (dateStr: Optional<string>) => {
    if (!dateStr) return "-";

    return new Date(dateStr).toLocaleString("en-PH", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleCreateObrItem = async () => {
    if (!detail || submitting) return;

    setSubmitting(true);
    setActionError(null);

    try {
      const response = await fetch("/api/obr/management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: detail.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setActionError(payload?.message ?? "Failed to create OBR item. Please try again.");
        return;
      }

      await mutate();
      onActionSuccess();
      onOpenChange(false);
    } catch {
      setActionError("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] min-w-[75%]">
        <DialogHeader>
          <DialogTitle>OBR Request Details</DialogTitle>
          <DialogDescription>
            Review this approved request before creating an OBR item.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] overflow-y-auto pr-2">
          {isLoading && <Loading />}
          {(error || data?.error || (!isLoading && !detail)) && <DeadHamster />}
          {detail && (
            <div className="flex flex-col gap-6 pb-2">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Request Number
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">
                    {detail.requestNumber}
                  </Typography>
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
                  <Typography variant="p" className="not-first:mt-0">
                    {detail.payee}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Office Address
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">
                    {detail.officeAddress}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Originating Office
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">
                    {detail.office.name}
                  </Typography>
                </div>
                <div className="flex flex-col gap-1">
                  <Typography variant="small" className="text-muted-foreground">
                    Published By
                  </Typography>
                  <Typography variant="p" className="not-first:mt-0">
                    {detail.publisher.name}
                  </Typography>
                </div>
                {detail.obrNumber && (
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      OBR Number
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">
                      {detail.obrNumber}
                    </Typography>
                  </div>
                )}
                {detail.prNumber && (
                  <div className="flex flex-col gap-1">
                    <Typography variant="small" className="text-muted-foreground">
                      PR Number
                    </Typography>
                    <Typography variant="p" className="not-first:mt-0">
                      {detail.prNumber}
                    </Typography>
                  </div>
                )}
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
                    {detail.requestItems.map(item => (
                      <TableRow key={item.id}>
                        <TableCell>{item.particulars}</TableCell>
                        <TableCell>{item.expenseCode.name}</TableCell>
                        <TableCell>{item.expenseCode.accountCode ?? "-"}</TableCell>
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
                      key={`${approver.position.id}-${idx}`}
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

        {actionError && (
          <Typography variant="small" className="text-destructive">
            {actionError}
          </Typography>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Close
            </Button>
          </DialogClose>
          <Button onClick={handleCreateObrItem} disabled={!detail || submitting}>
            {submitting ? "Creating..." : "Create OBR Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
