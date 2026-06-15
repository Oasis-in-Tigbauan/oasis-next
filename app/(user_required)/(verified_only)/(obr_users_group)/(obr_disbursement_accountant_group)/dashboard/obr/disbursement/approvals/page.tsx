"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type { GenericOkResponse } from "@/lib/http/client/responses/GenericOkResponse";
import type {
  ApiResponseException,
  BetterFetchResponse,
  FundTypesListResponse,
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
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
import Typography from "@/components/typography";

type PendingDisbursement = {
  id: string;
  disbursementVoucherNumber: string;
  createdAt: string;
  payee?: string | null;
  address: string;
  particulars: string;
  grossAmount: string | null;
  vatableAmount: string | null;
  taxType: string | null;
  status: string | null;
  accountantSigningStatus: string;
  responsibilityCenter: { id: string; aa: string };
  fundType: { id: string; name: string; description?: string | null } | null;
  request: { id: string; requestNumber: string };
  requestItem: { id: string; particulars: string; amount: string };
};

type PendingListResponse = GenericOkResponse<PendingDisbursement[]>;

const NONE = "__none__";
const TAX_TYPES = ["vat-g", "vat-s", "nvat-g", "nvat-s"] as const;
type TaxType = typeof TAX_TYPES[number];

const TAX_TYPE_LABELS: Record<TaxType, string> = {
  "vat-g": "VAT - Goods",
  "vat-s": "VAT - Services",
  "nvat-g": "Non-VAT - Goods",
  "nvat-s": "Non-VAT - Services",
};

const STATUS_OPTIONS = ["PREPARATION", "PROCESSING", "ON HOLD", "FOR RELEASE", "PAID"] as const;

function formatAmount(amount: string | null) {
  if (!amount) return "—";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return `₱${num.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Page() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<PendingListResponse, ApiResponseException>
  >("/api/obr/disbursements/pending", $fetch);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleRowClick = useCallback((id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error || !data?.data?.data) return <DeadHamster />;

  const items = data.data.data;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="border rounded-lg p-2">
        {items.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No disbursements pending your review.
          </div>
        ) : (
          <div className="h-[calc(100vh-8rem)] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DV No.</TableHead>
                  <TableHead>Request No.</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item: PendingDisbursement) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(item.id)}
                  >
                    <TableCell>{item.disbursementVoucherNumber}</TableCell>
                    <TableCell>{item.request.requestNumber}</TableCell>
                    <TableCell>{item.payee ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{item.particulars}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(item.grossAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.accountantSigningStatus}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedId && (
        <DisbursementApprovalDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
          onActionSuccess={() => {
            mutate();
            setDetailOpen(false);
          }}
        />
      )}
    </div>
  );
}

function DisbursementApprovalDialog({
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
    BetterFetchResponse<PendingListResponse, ApiResponseException>
  >(open ? "/api/obr/disbursements/pending" : null, $fetch);

  const { data: fundTypeData } = useSWR<
    BetterFetchResponse<FundTypesListResponse, ApiResponseException>
  >(open ? "/api/management/data/fund-types" : null, $fetch);

  const detail = data?.data?.data?.find((item: PendingDisbursement) => item.id === id);
  const fundTypes = fundTypeData?.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Disbursement Review</DialogTitle>
          <DialogDescription>
            Review and update this disbursement voucher before submitting your approval decision.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <Loading />}
        {(error || data?.error || (!isLoading && !detail)) && <DeadHamster />}
        {detail && (
          <DisbursementApprovalForm
            key={detail.id}
            detail={detail}
            id={id}
            fundTypes={fundTypes}
            onMutate={mutate}
            onActionSuccess={onActionSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DisbursementApprovalForm({
  detail,
  id,
  fundTypes,
  onMutate,
  onActionSuccess,
}: {
  detail: PendingDisbursement;
  id: string;
  fundTypes: Array<{ id: string; name: string }>;
  onMutate: () => void;
  onActionSuccess: () => void;
}) {
  const [particulars, setParticulars] = useState(detail.particulars);
  const [grossAmount, setGrossAmount] = useState(detail.grossAmount ?? detail.requestItem.amount);
  const [vatableAmount, setVatableAmount] = useState(detail.vatableAmount ?? "");
  const [taxType, setTaxType] = useState<string>(detail.taxType ?? NONE);
  const [fundTypeId, setFundTypeId] = useState<string>(detail.fundType?.id ?? NONE);
  const [status, setStatus] = useState<string>(detail.status ?? "PREPARATION");
  const [saving, setSaving] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);

  const saveChanges = async (): Promise<boolean> => {
    setSaving(true);
    const body: Record<string, string> = {
      particulars: particulars.trim(),
      grossAmount: grossAmount.trim(),
    };
    if (vatableAmount.trim()) body.vatableAmount = vatableAmount.trim();
    if (taxType !== NONE) body.taxType = taxType;
    if (fundTypeId !== NONE) body.fundTypeId = fundTypeId;
    if (status) body.status = status;

    const res = await $fetch<unknown, ApiResponseException>(`/api/obr/disbursements/${id}`, {
      method: "PATCH",
      body,
    });
    setSaving(false);
    if (res.error) {
      alert(res.error.message ?? "Failed to update disbursement.");
      return false;
    }
    onMutate();
    return true;
  };

  return (
    <>
      <ScrollArea className="flex-1 overflow-y-auto pr-2">
        <div className="flex flex-col gap-6 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <Typography variant="small" className="text-muted-foreground">
                DV Number
              </Typography>
              <Typography variant="p" className="not-first:mt-0">
                {detail.disbursementVoucherNumber}
              </Typography>
            </div>
            <div className="flex flex-col gap-1">
              <Typography variant="small" className="text-muted-foreground">
                Request Number
              </Typography>
              <Typography variant="p" className="not-first:mt-0">
                {detail.request.requestNumber}
              </Typography>
            </div>
            <div className="flex flex-col gap-1">
              <Typography variant="small" className="text-muted-foreground">
                Payee
              </Typography>
              <Typography variant="p" className="not-first:mt-0">
                {detail.payee ?? "—"}
              </Typography>
            </div>
            <div className="flex flex-col gap-1">
              <Typography variant="small" className="text-muted-foreground">
                Responsibility Center
              </Typography>
              <Typography variant="p" className="not-first:mt-0">
                {detail.responsibilityCenter.aa}
              </Typography>
            </div>
          </div>

          <Separator />

          <FieldGroup className="grid grid-cols-2 gap-4">
            <Field>
              <Label htmlFor="particulars">Particulars</Label>
              <Input id="particulars" value={particulars} onChange={e => setParticulars(e.target.value)} />
            </Field>
            <Field>
              <Label htmlFor="grossAmount">Gross Amount</Label>
              <Input id="grossAmount" value={grossAmount} onChange={e => setGrossAmount(e.target.value)} />
            </Field>
            <Field>
              <Label htmlFor="vatableAmount">Vatable Amount</Label>
              <Input id="vatableAmount" value={vatableAmount} onChange={e => setVatableAmount(e.target.value)} />
            </Field>
            <Field>
              <Label>Tax Type</Label>
              <Select value={taxType} onValueChange={setTaxType}>
                <SelectTrigger><SelectValue placeholder="Select tax type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {TAX_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{TAX_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label>Funding Source</Label>
              <Select value={fundTypeId} onValueChange={setFundTypeId}>
                <SelectTrigger><SelectValue placeholder="Select funding source" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {fundTypes.map(ft => (
                    <SelectItem key={ft.id} value={ft.id}>{ft.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        </div>
      </ScrollArea>

      <DialogFooter className="pt-4">
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
        <Button variant="outline" disabled={saving} onClick={saveChanges}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
        <Button onClick={() => setActionOpen(true)}>
          Submit Decision
        </Button>
      </DialogFooter>

      <DisbursementDecisionDialog
        id={id}
        fundTypeId={fundTypeId}
        open={actionOpen}
        onOpenChange={setActionOpen}
        saveChanges={saveChanges}
        onSuccess={() => {
          setActionOpen(false);
          onActionSuccess();
        }}
      />
    </>
  );
}

function DisbursementDecisionDialog({
  id,
  fundTypeId,
  open,
  onOpenChange,
  saveChanges,
  onSuccess,
}: {
  id: string;
  fundTypeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saveChanges: () => Promise<boolean>;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<"approved" | "binned">("approved");
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
    if (status === "approved" && fundTypeId === NONE) {
      setError("A funding source is required before approving.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const saved = await saveChanges();
    if (!saved) {
      setSubmitting(false);
      return;
    }

    const res = await $fetch<unknown, ApiResponseException>(`/api/obr/disbursements/${id}/approve`, {
      method: "POST",
      body: {
        status,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      },
    });

    setSubmitting(false);
    if (res.error) {
      setError(res.error.message ?? "Failed to submit decision. Please try again.");
      return;
    }

    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Approval Decision</DialogTitle>
          <DialogDescription>
            Choose your decision for this disbursement voucher. A reason is optional but recommended when rejecting.
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
                  <SelectItem value="binned">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <Label>
                Reason{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
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
