'use client';

import {useState} from 'react';
import useSWR from 'swr';

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
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  ElecItemResponse,
  ObrDisbursementVoucherItem,
  ObrDisbursementVoucherListResponse,
} from '@/lib/http/client/responses';

const TAX_TYPE_OPTIONS = [
  {value: 'vat-g', label: 'VAT - Goods'},
  {value: 'vat-s', label: 'VAT - Services'},
  {value: 'nvat-g', label: 'Non-VAT Goods'},
  {value: 'nvat-s', label: 'Non-VAT Services'},
] as const;

type FormState = {
  dvId: string;
  billingName: string;
  meterSerial: string;
  account: string;
  gross: string;
  vatableSales: string;
  taxType: string;
};

function makeEmptyForm(): FormState {
  return {
    dvId: '',
    billingName: '',
    meterSerial: '',
    account: '',
    gross: '',
    vatableSales: '',
    taxType: '',
  };
}

function makeEditForm(item: ElecItemResponse): FormState {
  return {
    dvId: item.dv.id,
    billingName: item.billingName,
    meterSerial: item.meterSerial,
    account: item.account,
    gross: item.gross,
    vatableSales: item.vatableSales,
    taxType: item.taxType,
  };
}

type Props = {
  mode: 'add' | 'edit';
  editItem?: ElecItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function ElecFormDialog({mode, editItem, open, onOpenChange, onSuccess}: Props) {
  const [form, setForm] = useState<FormState>(() =>
    mode === 'edit' && editItem ? makeEditForm(editItem) : makeEmptyForm(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [dvSearch, setDvSearch] = useState('');
  const [dvDropdownOpen, setDvDropdownOpen] = useState(false);
  const [selectedDv, setSelectedDv] = useState<ObrDisbursementVoucherItem | null>(null);

  const {data: dvData} = useSWR<
    BetterFetchResponse<ObrDisbursementVoucherListResponse, ApiResponseException>
  >(open && mode === 'add' ? '/api/obr/disbursements' : null, $fetch);

  const allDvs = dvData?.data?.data ?? [];

  const filteredDvs = dvSearch.trim()
    ? allDvs.filter(
        (dv) =>
          dv.disbursementVoucherNumber.toLowerCase().includes(dvSearch.trim().toLowerCase()) ||
          dv.payee.toLowerCase().includes(dvSearch.trim().toLowerCase()),
      )
    : allDvs;

  const update = (key: keyof FormState, value: string) =>
    setForm((prev) => ({...prev, [key]: value}));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (mode === 'add') {
      if (!form.dvId) {
        alert('Please select a disbursement voucher.');
        return;
      }
      if (
        !form.billingName.trim() ||
        !form.meterSerial.trim() ||
        !form.account.trim() ||
        !form.gross.trim() ||
        !form.vatableSales.trim() ||
        !form.taxType
      ) {
        alert('All fields are required.');
        return;
      }

      setSubmitting(true);
      const res = await $fetch<unknown, ApiResponseException>('/api/forms/elec', {
        method: 'POST',
        body: {
          dvId: form.dvId,
          billingName: form.billingName.trim(),
          meterSerial: form.meterSerial.trim(),
          account: form.account.trim(),
          gross: form.gross.trim(),
          vatableSales: form.vatableSales.trim(),
          taxType: form.taxType,
        },
      });
      setSubmitting(false);

      if (res.error) {
        alert(
          (res.error as ApiResponseException).message ??
            'Failed to create record. Please try again.',
        );
        return;
      }
    } else {
      const payload: Record<string, string> = {};
      if (form.billingName.trim()) payload.billingName = form.billingName.trim();
      if (form.meterSerial.trim()) payload.meterSerial = form.meterSerial.trim();
      if (form.account.trim()) payload.account = form.account.trim();
      if (form.gross.trim()) payload.gross = form.gross.trim();
      if (form.vatableSales.trim()) payload.vatableSales = form.vatableSales.trim();
      if (form.taxType) payload.taxType = form.taxType;

      setSubmitting(true);
      const res = await $fetch<unknown, ApiResponseException>(`/api/forms/elec/${editItem!.id}`, {
        method: 'PATCH',
        body: payload,
      });
      setSubmitting(false);

      if (res.error) {
        alert(
          (res.error as ApiResponseException).message ??
            'Failed to update record. Please try again.',
        );
        return;
      }
    }

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {mode === 'add' ? 'Add Electricity Bill' : 'Edit Electricity Bill'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Fill in the details to create a new electricity bill record.'
              : 'Update the electricity bill record details.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <form id="elec-form" onSubmit={handleSubmit} className="flex flex-col gap-4 px-1 pb-2">
            {/* Disbursement Voucher */}
            {mode === 'add' ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="dvSearch">
                  Disbursement Voucher <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="dvSearch"
                    placeholder="Search by DV number or payee..."
                    value={dvSearch}
                    onFocus={() => setDvDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setDvDropdownOpen(false), 150)}
                    onInput={(e) => {
                      const value = e.currentTarget.value;
                      setDvSearch(value);
                      if (selectedDv && value !== selectedDv.disbursementVoucherNumber) {
                        setSelectedDv(null);
                        update('dvId', '');
                      }
                    }}
                    autoComplete="off"
                  />
                  {selectedDv && (
                    <button
                      type="button"
                      aria-label="Clear DV selection"
                      className="absolute right-2 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSelectedDv(null);
                        setDvSearch('');
                        update('dvId', '');
                      }}
                    >
                      ✕
                    </button>
                  )}
                  {dvDropdownOpen && filteredDvs.length > 0 && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
                      {filteredDvs.map((dv) => (
                        <button
                          key={dv.id}
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                          onMouseDown={() => {
                            setSelectedDv(dv);
                            setDvSearch(dv.disbursementVoucherNumber);
                            update('dvId', dv.id);
                            setDvDropdownOpen(false);
                          }}
                        >
                          <span className="font-medium">{dv.disbursementVoucherNumber}</span>
                          <span className="text-xs text-muted-foreground">{dv.payee}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Disbursement Voucher</Label>
                <Input
                  value={editItem?.dv.disbursementVoucherNumber ?? ''}
                  readOnly
                  className="bg-muted/50"
                  tabIndex={-1}
                />
              </div>
            )}

            {/* Billing Name and Meter Serial */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="billingName">
                  Billing Name {mode === 'add' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="billingName"
                  placeholder="Enter billing name"
                  value={form.billingName}
                  onInput={(e) => update('billingName', e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="meterSerial">
                  Meter Serial # {mode === 'add' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="meterSerial"
                  placeholder="Enter meter serial number"
                  value={form.meterSerial}
                  onInput={(e) => update('meterSerial', e.currentTarget.value)}
                />
              </div>
            </div>

            {/* Account */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="account">
                Account {mode === 'add' && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="account"
                placeholder="Enter account"
                value={form.account}
                onInput={(e) => update('account', e.currentTarget.value)}
              />
            </div>

            {/* Gross and Vatable Sales */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="gross">
                  Gross {mode === 'add' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="gross"
                  placeholder="0.00"
                  value={form.gross}
                  onInput={(e) => update('gross', e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="vatableSales">
                  Vatable Sales {mode === 'add' && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  id="vatableSales"
                  placeholder="0.00"
                  value={form.vatableSales}
                  onInput={(e) => update('vatableSales', e.currentTarget.value)}
                />
              </div>
            </div>

            {/* Tax Type */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="taxType">
                Tax Type {mode === 'add' && <span className="text-destructive">*</span>}
              </Label>
              <Select
                value={form.taxType || '__none__'}
                onValueChange={(v) => update('taxType', v === '__none__' ? '' : v)}
              >
                <SelectTrigger id="taxType" className="w-full">
                  <SelectValue placeholder="Select tax type" />
                </SelectTrigger>
                <SelectContent>
                  {mode === 'edit' && <SelectItem value="__none__">(No change)</SelectItem>}
                  {TAX_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
        </ScrollArea>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={submitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="elec-form" disabled={submitting}>
            {submitting ? 'Saving…' : mode === 'add' ? 'Create' : 'Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
