"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  FundTypesListResponse,
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
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

type ApproverOption = {
  id: string;
  name: string;
};

type ValidApproverListResponse = {
  data: ApproverOption[];
};

type TaxType = "vat-g" | "vat-s" | "nvat-g" | "nvat-s";
type DisbursementStatus = "PREPARATION" | "PROCESSING" | "ON HOLD" | "FOR RELEASE" | "PAID";

const NONE = "__none__";

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

export default function Page() {
  const {
    data: listData,
    error: listError,
    isLoading: listLoading,
    mutate: mutateList,
  } = useSWR<BetterFetchResponse<ObrRequestSummaryListResponse, ApiResponseException>>(
    "/api/obr/disbursements/valid/requests",
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
      <Typography variant="h3" className="mb-4 grow">OBR Disbursement</Typography>

      <Table>
        {requests.length === 0 && (
          <TableCaption>No approved OBR requests available for disbursement.</TableCaption>
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
        <DisbursementDetailDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onActionSuccess={() => mutateList()}
        />
      )}
    </div>
  );
}

function DisbursementDetailDialog({
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

  const [createOpen, setCreateOpen] = useState(false);

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
              Review this approved request before creating disbursement vouchers.
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
                      {detail.requestItems.map(item => (
                        <TableRow key={item.id}>
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

          <DialogFooter className="pt-4">
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            {detail && (
              <Button onClick={() => setCreateOpen(true)}>
                Create Disbursement Voucher
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {detail && (
        <CreateDisbursementDialog
          request={detail}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onSuccess={() => {
            setCreateOpen(false);
            onOpenChange(false);
            mutate();
            onActionSuccess();
          }}
        />
      )}
    </>
  );
}

function CreateDisbursementDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: {
  request: NonNullable<ObrRequestDetailResponse["data"]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [accountantId, setAccountantId] = useState("");
  const [treasurerId, setTreasurerId] = useState("");
  const [mayorId, setMayorId] = useState("");

  const [vatableAmount, setVatableAmount] = useState("");
  const [taxType, setTaxType] = useState<string>(NONE);
  const [fundTypeId, setFundTypeId] = useState<string>(NONE);
  const [status, setStatus] = useState<string>(NONE);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: accountantData } = useSWR<
    BetterFetchResponse<ValidApproverListResponse, ApiResponseException>
  >(
    open ? "/api/obr/disbursements/valid/approvers?filter=obr.disbursement.accountant.approve" : null,
    $fetch,
  );

  const { data: treasurerData } = useSWR<
    BetterFetchResponse<ValidApproverListResponse, ApiResponseException>
  >(
    open ? "/api/obr/disbursements/valid/approvers?filter=obr.disbursement.treasurer.approve" : null,
    $fetch,
  );

  const { data: mayorData } = useSWR<
    BetterFetchResponse<ValidApproverListResponse, ApiResponseException>
  >(
    open ? "/api/obr/disbursements/valid/approvers?filter=obr.disbursement.mayor.approve" : null,
    $fetch,
  );

  const { data: fundTypeData } = useSWR<
    BetterFetchResponse<FundTypesListResponse, ApiResponseException>
  >(
    open ? "/api/management/data/fund-types" : null,
    $fetch,
  );

  const accountants = accountantData?.data?.data ?? [];
  const treasurers = treasurerData?.data?.data ?? [];
  const mayors = mayorData?.data?.data ?? [];
  const fundTypes = fundTypeData?.data?.data ?? [];

  const canSubmit = useMemo(() => {
    return Boolean(accountantId && treasurerId && mayorId && !submitting);
  }, [accountantId, treasurerId, mayorId, submitting]);

  const resetForm = () => {
    setAccountantId("");
    setTreasurerId("");
    setMayorId("");
    setVatableAmount("");
    setTaxType(NONE);
    setFundTypeId(NONE);
    setStatus(NONE);
    setError(null);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      const items = request.requestItems.map(item => ({
        targetItemId: item.id,
        accountantId,
        treasurerId,
        mayorId,
        ...(vatableAmount.trim() ? { vatableAmount: vatableAmount.trim() } : {}),
        ...(taxType !== NONE ? { taxType: taxType as TaxType } : {}),
        ...(fundTypeId !== NONE ? { fundTypeId } : {}),
        ...(status !== NONE ? { status: status as DisbursementStatus } : {}),
      }));

      const res = await fetch("/api/obr/disbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: request.id,
          items,
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        setError(payload?.message ?? "Failed to create disbursement voucher. Please try again.");
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Disbursement Voucher</DialogTitle>
          <DialogDescription>
            Select required signers and optional defaults. This will generate {request.requestItems.length} voucher(s) from this request.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
          <FieldGroup>
            <Field>
              <Label>Accountant</Label>
              <Select value={accountantId} onValueChange={setAccountantId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select accountant" />
                </SelectTrigger>
                <SelectContent>
                  {accountants.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <Label>Treasurer</Label>
              <Select value={treasurerId} onValueChange={setTreasurerId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select treasurer" />
                </SelectTrigger>
                <SelectContent>
                  {treasurers.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <Label>Mayor</Label>
              <Select value={mayorId} onValueChange={setMayorId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mayor" />
                </SelectTrigger>
                <SelectContent>
                  {mayors.map(user => (
                    <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field>
              <Label>Vatable Amount (optional)</Label>
              <Input
                value={vatableAmount}
                onChange={e => setVatableAmount(e.target.value)}
                placeholder="e.g. 1000.00"
                disabled={submitting}
              />
            </Field>

            <Field>
              <Label>Tax Type (optional)</Label>
              <Select value={taxType} onValueChange={setTaxType} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select tax type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  <SelectItem value="vat-g">VAT - Goods</SelectItem>
                  <SelectItem value="vat-s">VAT - Services</SelectItem>
                  <SelectItem value="nvat-g">Non-VAT - Goods</SelectItem>
                  <SelectItem value="nvat-s">Non-VAT - Services</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <Label>Fund Type (optional)</Label>
              <Select value={fundTypeId} onValueChange={setFundTypeId} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select fund type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {fundTypes.map(fund => (
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <Label>Status (optional)</Label>
              <Select value={status} onValueChange={setStatus} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  <SelectItem value="PREPARATION">Preparation</SelectItem>
                  <SelectItem value="PROCESSING">Processing</SelectItem>
                  <SelectItem value="ON HOLD">On Hold</SelectItem>
                  <SelectItem value="FOR RELEASE">For Release</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>

        {error && (
          <Typography variant="small" className="text-destructive">
            {error}
          </Typography>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>Cancel</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "Creating…" : "Create Voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
