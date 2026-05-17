"use client";

import { useState, useCallback } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  UserResponse,
  ObrRequestSummaryListResponse,
  ObrRequestDetailResponse,
  ExpenseClassListResponse,
  OfficeCodeListResponse,
} from "@/lib/http/client/responses";
import * as permissions from "@/lib/db/permissions";

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

// --- Local types for create form ---

type CreateFormItem = {
  _key: string;
  expenseCodeId: string;
  responsibilityCenterId: string;
  particulars: string;
  amount: string;
};

type CreateFormState = {
  requestNumber: string;
  payee: string;
  officeAddress: string;
  obrNumber: string;
  prNumber: string;
  requestItems: CreateFormItem[];
};

type ItemError = {
  expenseCodeId?: string;
  responsibilityCenterId?: string;
  particulars?: string;
  amount?: string;
};

type CreateFormErrors = {
  requestNumber?: string;
  payee?: string;
  officeAddress?: string;
  requestItems?: string;
  items: ItemError[];
};

// --- Helpers ---

function makeEmptyItem(): CreateFormItem {
  return {
    _key: crypto.randomUUID(),
    expenseCodeId: "",
    responsibilityCenterId: "",
    particulars: "",
    amount: "",
  };
}

function makeEmptyForm(): CreateFormState {
  return {
    requestNumber: "",
    payee: "",
    officeAddress: "",
    obrNumber: "",
    prNumber: "",
    requestItems: [makeEmptyItem()],
  };
}

function makeEmptyErrors(): CreateFormErrors {
  return { items: [] };
}

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

  const { data: userData } = useSWR<BetterFetchResponse<UserResponse, ApiResponseException>>(
    "/api/account/me",
    $fetch,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const permissionSet = new Set(userData?.data?.data?.office?.role?.permissions ?? []);
  const canCreate = permissionSet.has(permissions.OBR_REQUEST_CREATE);

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
    <div className="relative flex flex-col gap-4 p-6">
      <Typography variant="h3" className="mb-4 grow">OBR Requests</Typography>

      <Table className="text-sm">
        {requests.length === 0 && (
          <TableCaption>No OBR requests found.</TableCaption>
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
        <RequestDetailDialog
          id={selectedId}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}

      {canCreate && (
        <>
          <Button
            className="fixed bottom-6 right-6 size-14 rounded-full shadow-lg"
            size="icon"
            onClick={() => setCreateOpen(true)}
            aria-label="Create OBR Request"
          >
            <PlusIcon className="size-6" />
          </Button>
          <CreateRequestDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            onSuccess={() => mutateList()}
          />
        </>
      )}
    </div>
  );
}

// --- Request Detail Dialog ---

function RequestDetailDialog({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>OBR Request Details</DialogTitle>
          <DialogDescription>
            Read-only view of the obligation request and its approval status.
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Create Request Dialog ---

function CreateRequestDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { data: expenseData } = useSWR<
    BetterFetchResponse<ExpenseClassListResponse, ApiResponseException>
  >(open ? "/api/management/data/expense-classes" : null, $fetch);

  const { data: officeCodeData } = useSWR<
    BetterFetchResponse<OfficeCodeListResponse, ApiResponseException>
  >(open ? "/api/management/data/office-codes" : null, $fetch);

  const expenseClassList = expenseData?.data?.data ?? [];
  const officeCodeList = officeCodeData?.data?.data ?? [];

  const [form, setForm] = useState<CreateFormState>(makeEmptyForm);
  const [errors, setErrors] = useState<CreateFormErrors>(makeEmptyErrors);
  const [submitting, setSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = () => setIsDirty(true);

  const updateHeader = (
    key: keyof Omit<CreateFormState, "requestItems">,
    value: string,
  ) => {
    setForm(prev => ({ ...prev, [key]: value }));
    markDirty();
  };

  const updateItem = (
    index: number,
    key: keyof Omit<CreateFormItem, "_key">,
    value: string,
  ) => {
    setForm(prev => {
      const items = [...prev.requestItems];
      items[index] = { ...items[index], [key]: value };
      return { ...prev, requestItems: items };
    });
    markDirty();
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      requestItems: [...prev.requestItems, makeEmptyItem()],
    }));
    markDirty();
  };

  const removeItem = (index: number) => {
    setForm(prev => ({
      ...prev,
      requestItems: prev.requestItems.filter((_, i) => i !== index),
    }));
    markDirty();
  };

  const validate = (): boolean => {
    const errs: CreateFormErrors = { items: [] };
    let valid = true;

    if (!form.requestNumber.trim()) {
      errs.requestNumber = "Request number is required.";
      valid = false;
    }
    if (!form.payee.trim()) {
      errs.payee = "Payee is required.";
      valid = false;
    }
    if (!form.officeAddress.trim()) {
      errs.officeAddress = "Office address is required.";
      valid = false;
    }
    if (form.requestItems.length === 0) {
      errs.requestItems = "At least one request item is required.";
      valid = false;
    }

    for (const item of form.requestItems) {
      const itemErr: ItemError = {};
      if (!item.expenseCodeId) {
        itemErr.expenseCodeId = "Expense code is required.";
        valid = false;
      }
      if (!item.responsibilityCenterId) {
        itemErr.responsibilityCenterId = "Responsibility center is required.";
        valid = false;
      }
      if (!item.particulars.trim()) {
        itemErr.particulars = "Particulars is required.";
        valid = false;
      }
      const parsedAmount = parseFloat(item.amount);
      if (!item.amount.trim() || isNaN(parsedAmount) || parsedAmount <= 0) {
        itemErr.amount = "A valid positive amount is required.";
        valid = false;
      }
      errs.items.push(itemErr);
    }

    setErrors(errs);
    return valid;
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && isDirty) {
      if (!confirm("You have unsaved changes. Close anyway?")) return;
    }
    if (!nextOpen) {
      setForm(makeEmptyForm());
      setErrors(makeEmptyErrors());
      setIsDirty(false);
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);

    const payload = {
      requestNumber: form.requestNumber.trim(),
      payee: form.payee.trim(),
      officeAddress: form.officeAddress.trim(),
      ...(form.obrNumber.trim() ? { obrNumber: form.obrNumber.trim() } : {}),
      ...(form.prNumber.trim() ? { prNumber: form.prNumber.trim() } : {}),
      requestItems: form.requestItems.map(item => ({
        expenseCodeId: item.expenseCodeId,
        responsibilityCenterId: item.responsibilityCenterId,
        particulars: item.particulars.trim(),
        amount: item.amount.trim(),
      })),
    };

    const res = await $fetch<unknown, ApiResponseException>("/api/obr/requests", {
      method: "POST",
      body: payload,
    });

    setSubmitting(false);

    if (res.error) {
      alert(res.error.message ?? "Failed to create OBR request. Please try again.");
      return;
    }

    setForm(makeEmptyForm());
    setErrors(makeEmptyErrors());
    setIsDirty(false);
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="min-w-[75%] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create OBR Request</DialogTitle>
          <DialogDescription>
            Fill in the obligation request details and add line items.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto pr-2">
          <form
            id="create-obr-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 pb-2"
          >
            <div className="grid grid-cols-2 gap-4">
              <FieldGroup>
                <Field>
                  <Label htmlFor="requestNumber">
                    Request Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="requestNumber"
                    value={form.requestNumber}
                    onInput={e => updateHeader("requestNumber", e.currentTarget.value)}
                    placeholder="Enter request number"
                    aria-invalid={!!errors.requestNumber}
                  />
                  {errors.requestNumber && (
                    <p className="text-sm text-destructive">{errors.requestNumber}</p>
                  )}
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <Label htmlFor="payee">
                    Payee <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="payee"
                    value={form.payee}
                    onInput={e => updateHeader("payee", e.currentTarget.value)}
                    placeholder="Enter payee name"
                    aria-invalid={!!errors.payee}
                  />
                  {errors.payee && (
                    <p className="text-sm text-destructive">{errors.payee}</p>
                  )}
                </Field>
              </FieldGroup>

              <FieldGroup className="col-span-2">
                <Field>
                  <Label htmlFor="officeAddress">
                    Office Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="officeAddress"
                    value={form.officeAddress}
                    onInput={e => updateHeader("officeAddress", e.currentTarget.value)}
                    placeholder="Enter office address"
                    aria-invalid={!!errors.officeAddress}
                  />
                  {errors.officeAddress && (
                    <p className="text-sm text-destructive">{errors.officeAddress}</p>
                  )}
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <Label htmlFor="obrNumber">
                    OBR Number{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="obrNumber"
                    value={form.obrNumber}
                    onInput={e => updateHeader("obrNumber", e.currentTarget.value)}
                    placeholder="Enter OBR number"
                  />
                </Field>
              </FieldGroup>

              <FieldGroup>
                <Field>
                  <Label htmlFor="prNumber">
                    PR Number{" "}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="prNumber"
                    value={form.prNumber}
                    onInput={e => updateHeader("prNumber", e.currentTarget.value)}
                    placeholder="Enter PR number"
                  />
                </Field>
              </FieldGroup>
            </div>

            <Separator />

            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Typography variant="h4">Request Items</Typography>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <PlusIcon className="size-4 mr-1" />
                  Add Item
                </Button>
              </div>

              {errors.requestItems && (
                <p className="text-sm text-destructive">{errors.requestItems}</p>
              )}

              {form.requestItems.map((item, idx) => {
                const itemErr = errors.items[idx] ?? {};
                const selectedExpense = expenseClassList.find(
                  ec => ec.id === item.expenseCodeId,
                );
                return (
                  <div
                    key={item._key}
                    className="rounded-md border p-4 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <Typography variant="small" className="font-medium">
                        Item {idx + 1}
                      </Typography>
                      {form.requestItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          onClick={() => removeItem(idx)}
                          aria-label="Remove item"
                        >
                          <Trash2Icon className="size-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <FieldGroup>
                        <Field>
                          <Label>
                            Expense Code <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={item.expenseCodeId}
                            onValueChange={val => updateItem(idx, "expenseCodeId", val)}
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-invalid={!!itemErr.expenseCodeId}
                            >
                              <SelectValue placeholder="Select expense code" />
                            </SelectTrigger>
                            <SelectContent>
                              {expenseClassList.map(ec => (
                                <SelectItem key={ec.id} value={ec.id}>
                                  {ec.accountName}
                                  {ec.accountCode ? ` (${ec.accountCode})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {itemErr.expenseCodeId && (
                            <p className="text-sm text-destructive">
                              {itemErr.expenseCodeId}
                            </p>
                          )}
                        </Field>
                      </FieldGroup>

                      <FieldGroup>
                        <Field>
                          <Label>Account Code</Label>
                          <Input
                            value={selectedExpense?.accountCode ?? "—"}
                            readOnly
                            className="bg-muted cursor-not-allowed"
                          />
                        </Field>
                      </FieldGroup>

                      <FieldGroup className="col-span-2">
                        <Field>
                          <Label>
                            Responsibility Center{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <Select
                            value={item.responsibilityCenterId}
                            onValueChange={val =>
                              updateItem(idx, "responsibilityCenterId", val)
                            }
                          >
                            <SelectTrigger
                              className="w-full"
                              aria-invalid={!!itemErr.responsibilityCenterId}
                            >
                              <SelectValue placeholder="Select responsibility center" />
                            </SelectTrigger>
                            <SelectContent>
                              {officeCodeList.map(oc => (
                                <SelectItem key={oc.id} value={oc.id}>
                                  {oc.aa} — {oc.office.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {itemErr.responsibilityCenterId && (
                            <p className="text-sm text-destructive">
                              {itemErr.responsibilityCenterId}
                            </p>
                          )}
                        </Field>
                      </FieldGroup>

                      <FieldGroup className="col-span-2">
                        <Field>
                          <Label>
                            Particulars <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={item.particulars}
                            onInput={e =>
                              updateItem(idx, "particulars", e.currentTarget.value)
                            }
                            placeholder="Describe the item"
                            aria-invalid={!!itemErr.particulars}
                          />
                          {itemErr.particulars && (
                            <p className="text-sm text-destructive">
                              {itemErr.particulars}
                            </p>
                          )}
                        </Field>
                      </FieldGroup>

                      <FieldGroup>
                        <Field>
                          <Label>
                            Amount <span className="text-destructive">*</span>
                          </Label>
                          <Input
                            value={item.amount}
                            onInput={e =>
                              updateItem(idx, "amount", e.currentTarget.value)
                            }
                            placeholder="0.00"
                            inputMode="decimal"
                            aria-invalid={!!itemErr.amount}
                          />
                          {itemErr.amount && (
                            <p className="text-sm text-destructive">{itemErr.amount}</p>
                          )}
                        </Field>
                      </FieldGroup>
                    </div>
                  </div>
                );
              })}
            </div>
          </form>
        </ScrollArea>

        <DialogFooter className="pt-4">
          <Button
            variant="outline"
            type="button"
            onClick={() => handleClose(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" form="create-obr-form" disabled={submitting}>
            {submitting ? "Creating..." : "Create Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
