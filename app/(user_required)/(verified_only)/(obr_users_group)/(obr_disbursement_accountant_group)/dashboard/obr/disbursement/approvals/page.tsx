'use client';

import {useCallback, useState} from 'react';
import useSWR from 'swr';

import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import Typography from '@/components/typography';
import {Badge} from '@/components/ui/badge';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {Field, FieldGroup} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {ScrollArea} from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Separator} from '@/components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Textarea} from '@/components/ui/textarea';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  FundTypesListResponse,
} from '@/lib/http/client/responses';
import type {GenericOkResponse} from '@/lib/http/client/responses/GenericOkResponse';

type PendingDisbursementItem = {
  id: string;
  disbursementVoucherNumber: string;
  explanation: string | null;
  isOneForAll: boolean;
  grossAmount: string | null;
  vatableAmount: string | null;
  taxType: string | null;
  status: string | null;
  fundType: {id: string; name: string; description?: string | null} | null;
  requestItem: {id: string; particulars: string; amount: string};
};

type PendingDisbursementBatch = {
  batchId: string;
  requestId: string | null;
  requestNumber: string | null;
  isHeadless: boolean;
  payee?: string | null;
  address: string;
  isOneForAll: boolean;
  withCheque: boolean;
  accountantSigningStatus: string;
  totalGrossAmount: string;
  itemCount: number;
  items: PendingDisbursementItem[];
  requestItems: Array<{
    id: string;
    particulars: string;
    amount: string;
    responsibilityCenter: string;
    expenseName: string;
  }>;
};

type PendingBatchListResponse = GenericOkResponse<PendingDisbursementBatch[]>;

function getBatchKey(batch: PendingDisbursementBatch): string {
  return batch.isHeadless ? `batch:${batch.batchId}` : `request:${batch.requestId}`;
}

function findBatchByKey(
  batches: PendingDisbursementBatch[],
  key: string,
): PendingDisbursementBatch | undefined {
  if (key.startsWith('batch:')) {
    const batchId = key.slice('batch:'.length);
    return batches.find((b) => b.isHeadless && b.batchId === batchId);
  }
  const requestId = key.slice('request:'.length);
  return batches.find((b) => !b.isHeadless && b.requestId === requestId);
}

const NONE = '__none__';
const TAX_TYPES = ['vat-g', 'vat-s', 'nvat-g', 'nvat-s'] as const;
type TaxType = (typeof TAX_TYPES)[number];

const TAX_TYPE_LABELS: Record<TaxType, string> = {
  'vat-g': 'VAT - Goods',
  'vat-s': 'VAT - Services',
  'nvat-g': 'Non-VAT - Goods',
  'nvat-s': 'Non-VAT - Services',
};

const STATUS_OPTIONS = ['PREPARATION', 'PROCESSING', 'ON HOLD', 'FOR RELEASE', 'PAID'] as const;

function formatAmount(amount: string | null) {
  if (!amount) return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return `₱${num.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

export default function Page() {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<PendingBatchListResponse, ApiResponseException>
  >('/api/obr/disbursements/pending', $fetch);

  const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleRowClick = useCallback((batchKey: string) => {
    setSelectedBatchKey(batchKey);
    setDetailOpen(true);
  }, []);

  if (isLoading) return <Loading />;
  if (error || data?.error || !data?.data?.data) return <DeadHamster />;

  const batches = data.data.data;

  return (
    <div className="flex flex-col gap-2 p-4 pt-0 w-full">
      <div className="border rounded-lg p-2">
        {batches.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No disbursements pending your review.
          </div>
        ) : (
          <div className="h-[calc(100vh-8rem)] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request No.</TableHead>
                  <TableHead>Payee</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow
                    key={getBatchKey(batch)}
                    className="cursor-pointer"
                    onClick={() => handleRowClick(getBatchKey(batch))}
                  >
                    <TableCell>{batch.isHeadless ? 'Standalone' : batch.requestNumber}</TableCell>
                    <TableCell>{batch.payee ?? '—'}</TableCell>
                    <TableCell className="text-right">{batch.itemCount}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatAmount(batch.totalGrossAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{batch.accountantSigningStatus}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedBatchKey && (
        <DisbursementBatchApprovalDialog
          batchKey={selectedBatchKey}
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

function DisbursementBatchApprovalDialog({
  batchKey,
  open,
  onOpenChange,
  onActionSuccess,
}: {
  batchKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionSuccess: () => void;
}) {
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<PendingBatchListResponse, ApiResponseException>
  >(open ? '/api/obr/disbursements/pending' : null, $fetch);

  const {data: fundTypeData} = useSWR<
    BetterFetchResponse<FundTypesListResponse, ApiResponseException>
  >(open ? '/api/management/data/fund-types' : null, $fetch);

  const batch = data?.data?.data ? findBatchByKey(data.data.data, batchKey) : undefined;
  const fundTypes = fundTypeData?.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Disbursement Review</DialogTitle>
          <DialogDescription>
            Review and update all disbursement items for this request before submitting your
            decision.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <Loading />}
        {(error || data?.error || (!isLoading && !batch)) && <DeadHamster />}
        {batch && (
          <DisbursementBatchApprovalForm
            key={getBatchKey(batch)}
            batch={batch}
            fundTypes={fundTypes}
            onMutate={mutate}
            onActionSuccess={onActionSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ItemFormState = {
  explanation: string;
  vatableAmount: string;
  taxType: string;
  fundTypeId: string;
  status: string;
};

function DisbursementBatchApprovalForm({
  batch,
  fundTypes,
  onMutate,
  onActionSuccess,
}: {
  batch: PendingDisbursementBatch;
  fundTypes: Array<{id: string; name: string}>;
  onMutate: () => void;
  onActionSuccess: () => void;
}) {
  const buildInitialState = () => {
    const state: Record<string, ItemFormState> = {};
    for (const item of batch.items) {
      state[item.id] = {
        explanation: item.explanation ?? '',
        vatableAmount: item.vatableAmount ?? '',
        taxType: item.taxType ?? NONE,
        fundTypeId: item.fundType?.id ?? NONE,
        status: item.status ?? 'PREPARATION',
      };
    }
    return state;
  };

  const [itemStates, setItemStates] = useState<Record<string, ItemFormState>>(buildInitialState);
  const [sharedExplanation, setSharedExplanation] = useState(batch.items[0]?.explanation ?? '');
  const [sharedVatableAmount, setSharedVatableAmount] = useState(
    batch.items[0]?.vatableAmount ?? '',
  );
  const [sharedTaxType, setSharedTaxType] = useState(batch.items[0]?.taxType ?? NONE);
  const [sharedFundTypeId, setSharedFundTypeId] = useState(batch.items[0]?.fundType?.id ?? NONE);
  const [sharedStatus, setSharedStatus] = useState(batch.items[0]?.status ?? 'PREPARATION');
  const [saving, setSaving] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);

  const updateItemState = (id: string, patch: Partial<ItemFormState>) => {
    setItemStates((prev) => ({
      ...prev,
      [id]: {...prev[id]!, ...patch},
    }));
  };

  const saveChanges = async (): Promise<boolean> => {
    setSaving(true);

    for (const item of batch.items) {
      const state = batch.isOneForAll
        ? {
            explanation: sharedExplanation.trim(),
            vatableAmount: sharedVatableAmount.trim(),
            taxType: sharedTaxType,
            fundTypeId: sharedFundTypeId,
            status: sharedStatus,
          }
        : itemStates[item.id]!;

      const body: Record<string, string> = {
        explanation: state.explanation.trim(),
        grossAmount: item.grossAmount ?? item.requestItem.amount,
      };
      if (state.vatableAmount.trim()) body.vatableAmount = state.vatableAmount.trim();
      if (state.taxType !== NONE) body.taxType = state.taxType;
      if (state.fundTypeId !== NONE) body.fundTypeId = state.fundTypeId;
      if (state.status) body.status = state.status;

      const res = await $fetch<unknown, ApiResponseException>(`/api/obr/disbursements/${item.id}`, {
        method: 'PATCH',
        body,
      });
      if (res.error) {
        setSaving(false);
        alert(res.error.message ?? 'Failed to update disbursement.');
        return false;
      }
    }

    setSaving(false);
    onMutate();
    return true;
  };

  return (
    <>
      <ScrollArea className="flex-1 overflow-y-auto pr-2">
        <div className="flex flex-col gap-6 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Typography variant="small" className="text-muted-foreground">
                Request Number
              </Typography>
              <Typography variant="p" className="not-first:mt-0">
                {batch.requestNumber}
              </Typography>
            </div>
            <div>
              <Typography variant="small" className="text-muted-foreground">
                Payee
              </Typography>
              <Typography variant="p" className="not-first:mt-0">
                {batch.payee ?? '—'}
              </Typography>
            </div>
          </div>

          <Separator />

          {batch.isOneForAll ? (
            <>
              <Field>
                <Label htmlFor="sharedExplanation">Explanation</Label>
                <Textarea
                  id="sharedExplanation"
                  value={sharedExplanation}
                  onChange={(e) => setSharedExplanation(e.target.value)}
                  rows={4}
                />
              </Field>

              <FieldGroup className="grid grid-cols-2 gap-4">
                <Field>
                  <Label htmlFor="sharedVatableAmount">Vatable Amount</Label>
                  <Input
                    id="sharedVatableAmount"
                    value={sharedVatableAmount}
                    onChange={(e) => setSharedVatableAmount(e.target.value)}
                  />
                </Field>
                <Field>
                  <Label>Tax Type</Label>
                  <Select value={sharedTaxType} onValueChange={setSharedTaxType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tax type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {TAX_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TAX_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label>Funding Source</Label>
                  <Select value={sharedFundTypeId} onValueChange={setSharedFundTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select funding source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {fundTypes.map((ft) => (
                        <SelectItem key={ft.id} value={ft.id}>
                          {ft.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <Label>Status</Label>
                  <Select value={sharedStatus} onValueChange={setSharedStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>

              <div>
                <Typography variant="h4" className="mb-3">
                  Items
                </Typography>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Responsibility Center</TableHead>
                      <TableHead>Expense</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batch.requestItems.length > 0
                      ? batch.requestItems
                      : batch.items.map((item) => ({
                          id: item.requestItem.id,
                          particulars: item.requestItem.particulars,
                          amount: item.requestItem.amount,
                          responsibilityCenter: '—',
                          expenseName: '—',
                        }))
                    ).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.responsibilityCenter}</TableCell>
                        <TableCell>{item.expenseName}</TableCell>
                        <TableCell>{item.particulars}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(item.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {batch.items.map((item) => {
                const state = itemStates[item.id]!;
                return (
                  <div key={item.id} className="rounded-md border p-4 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Typography variant="small" className="text-muted-foreground">
                          DV Number
                        </Typography>
                        <Typography variant="p" className="not-first:mt-0">
                          {item.disbursementVoucherNumber}
                        </Typography>
                      </div>
                      <div>
                        <Typography variant="small" className="text-muted-foreground">
                          Amount
                        </Typography>
                        <Typography variant="p" className="not-first:mt-0 font-mono">
                          {formatAmount(item.grossAmount ?? item.requestItem.amount)}
                        </Typography>
                      </div>
                      <div className="col-span-2">
                        <Typography variant="small" className="text-muted-foreground">
                          Particulars
                        </Typography>
                        <Typography variant="p" className="not-first:mt-0">
                          {item.requestItem.particulars}
                        </Typography>
                      </div>
                    </div>

                    <Field>
                      <Label>Explanation</Label>
                      <Textarea
                        value={state.explanation}
                        onChange={(e) => updateItemState(item.id, {explanation: e.target.value})}
                        rows={3}
                      />
                    </Field>

                    <FieldGroup className="grid grid-cols-2 gap-4">
                      <Field>
                        <Label>Vatable Amount</Label>
                        <Input
                          value={state.vatableAmount}
                          onChange={(e) =>
                            updateItemState(item.id, {vatableAmount: e.target.value})
                          }
                        />
                      </Field>
                      <Field>
                        <Label>Tax Type</Label>
                        <Select
                          value={state.taxType}
                          onValueChange={(v) => updateItemState(item.id, {taxType: v})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select tax type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
                            {TAX_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {TAX_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <Label>Funding Source</Label>
                        <Select
                          value={state.fundTypeId}
                          onValueChange={(v) => updateItemState(item.id, {fundTypeId: v})}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select funding source" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>None</SelectItem>
                            {fundTypes.map((ft) => (
                              <SelectItem key={ft.id} value={ft.id}>
                                {ft.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <Label>Status</Label>
                        <Select
                          value={state.status}
                          onValueChange={(v) => updateItemState(item.id, {status: v})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGroup>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="pt-4">
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
        <Button variant="outline" disabled={saving} onClick={saveChanges}>
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
        <Button onClick={() => setActionOpen(true)}>Submit Decision</Button>
      </DialogFooter>

      <DisbursementDecisionDialog
        batch={batch}
        canApprove={() => {
          if (batch.isOneForAll) return sharedFundTypeId !== NONE;
          return batch.items.every((item) => itemStates[item.id]?.fundTypeId !== NONE);
        }}
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
  batch,
  canApprove,
  open,
  onOpenChange,
  saveChanges,
  onSuccess,
}: {
  batch: PendingDisbursementBatch;
  canApprove: () => boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saveChanges: () => Promise<boolean>;
  onSuccess: () => void;
}) {
  const [status, setStatus] = useState<'approved' | 'binned'>('approved');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setStatus('approved');
      setReason('');
      setError(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async () => {
    if (status === 'approved' && !canApprove()) {
      setError('A funding source must be assigned to every disbursement voucher before approving.');
      return;
    }

    setSubmitting(true);
    setError(null);

    const saved = await saveChanges();
    if (!saved) {
      setSubmitting(false);
      return;
    }

    const approveUrl = batch.isHeadless
      ? `/api/obr/disbursements/batch/${batch.batchId}/approve`
      : `/api/obr/requests/${batch.requestId}/disbursements/approve`;

    const res = await $fetch<unknown, ApiResponseException>(approveUrl, {
      method: 'POST',
      body: {
        status,
        ...(reason.trim() ? {reason: reason.trim()} : {}),
      },
    });

    setSubmitting(false);
    if (res.error) {
      setError(res.error.message ?? 'Failed to submit decision. Please try again.');
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
            Choose your decision for all disbursement vouchers on this request.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <FieldGroup>
            <Field>
              <Label>Decision</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as typeof status)}
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
                Reason <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="Enter reason…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
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
            {submitting ? 'Submitting…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
