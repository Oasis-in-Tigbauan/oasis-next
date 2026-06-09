"use client";

import { useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { DateTime } from "luxon";
import { Download, Pencil, Plus, Search, Trash2 } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type {
  ApiResponseException,
  BetterFetchResponse,
  PayrollItemResponse,
  PayrollListResponse,
  PayrollResponse,
} from "@/lib/http/client/responses";
import { cn } from "@/lib/utils";

import DeadHamster from "@/components/dead-hamster";
import Loading from "@/components/loading";
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
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PayrollEntryForm = {
  name: string;
  position: string;
  idNo: string;
  amount: string;
};

type PayrollForm = {
  payrollNo: string;
  payrollMonth: string;
  lgu: string;
  fund: string;
  sheetNumber: string;
  totalSheets: string;
  authorizedOfficial: string;
  headOfAccounting: string;
  headOfTreasury: string;
  localChiefExecutive: string;
  disbursingOfficer: string;
  cafaoNo: string;
  cafaoDate: string;
  entries: PayrollEntryForm[];
};

const today = DateTime.now().setZone("Asia/Manila");
const currentMonth = today.toFormat("yyyy-MM");
const defaultPayrollNo = currentMonth;
const TOTAL_COLS = 7;

function emptyEntry(): PayrollEntryForm {
  return {
    name: "",
    position: "",
    idNo: "",
    amount: "",
  };
}

function makeEmptyForm(): PayrollForm {
  return {
    payrollNo: defaultPayrollNo,
    payrollMonth: currentMonth,
    lgu: "Municipality of Tigbauan",
    fund: "SEF",
    sheetNumber: "1",
    totalSheets: "1",
    authorizedOfficial: "MYRA GENE G. GAUTIER",
    headOfAccounting: "MARY GRACE M. TRIO",
    headOfTreasury: "ELMA G. TIONSAY",
    localChiefExecutive: "ATTY. VIRGILIO T. TERUEL",
    disbursingOfficer: "STEPHANIE DI T. TIBUBOS",
    cafaoNo: "",
    cafaoDate: "",
    entries: [emptyEntry()],
  };
}

function makeEditForm(item: PayrollItemResponse): PayrollForm {
  return {
    payrollNo: item.payrollNo,
    payrollMonth: item.payrollMonth,
    lgu: item.lgu,
    fund: item.fund,
    sheetNumber: item.sheetNumber,
    totalSheets: item.totalSheets,
    authorizedOfficial: item.authorizedOfficial,
    headOfAccounting: item.headOfAccounting,
    headOfTreasury: item.headOfTreasury,
    localChiefExecutive: item.localChiefExecutive,
    disbursingOfficer: item.disbursingOfficer,
    cafaoNo: item.cafaoNo ?? "",
    cafaoDate: item.cafaoDate ?? "",
    entries: item.entries.map(entry => ({
      name: entry.name,
      position: entry.position,
      idNo: entry.idNo ?? "",
      amount: entry.amount,
    })),
  };
}

function formatAmount(value: string) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function formatMonth(value: string) {
  const dt = DateTime.fromFormat(value, "yyyy-MM");
  return dt.isValid ? dt.toFormat("LLLL yyyy") : value;
}

function payrollTotal(entries: PayrollEntryForm[]) {
  return entries.reduce((total, entry) => total + (Number.parseFloat(entry.amount) || 0), 0).toFixed(2);
}

function toPayload(form: PayrollForm) {
  return {
    ...form,
    purpose: "",
    periodCovered: "",
    cafaoNo: form.cafaoNo || undefined,
    cafaoDate: form.cafaoDate || undefined,
    entries: form.entries.map(entry => ({
      ...entry,
      idNo: entry.idNo || undefined,
    })),
  };
}

export default function PayrollPage() {
  const { data, error, isLoading, mutate } = useSWR<
    BetterFetchResponse<PayrollListResponse, ApiResponseException>
  >("/api/forms/payroll", $fetch);

  const [selectedItem, setSelectedItem] = useState<PayrollItemResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const items = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;

    return items.filter(item => [
      item.payrollNo,
      formatMonth(item.payrollMonth),
      item.lgu,
      item.fund,
      item.totalAmount,
      String(item.entries.length),
      item.authorizedOfficial,
      item.headOfAccounting,
      item.headOfTreasury,
      item.localChiefExecutive,
      item.disbursingOfficer,
    ].some(value => value.toLowerCase().includes(query)));
  }, [items, searchQuery]);

  async function handleDelete() {
    if (!selectedItem) return;
    setIsDeleting(true);
    try {
      const res = await $fetch<unknown, ApiResponseException>(
        `/api/forms/payroll/${selectedItem.id}`,
        { method: "DELETE" },
      );
      if (res.error) {
        alert("Failed to delete payroll. Please try again.");
        return;
      }
      setSelectedItem(null);
      setDeleteOpen(false);
      mutate();
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleExport() {
    if (!selectedItem) return;
    setIsExporting(true);
    try {
      const response = await fetch(`/api/forms/payroll/${selectedItem.id}/export`);
      if (!response.ok) {
        alert("Failed to export payroll. Please try again.");
        return;
      }

      const blob = await response.blob();
      const match = (response.headers.get("Content-Disposition") ?? "").match(/filename="([^"]+)"/);
      const link = document.createElement("a");
      const downloadUrl = URL.createObjectURL(blob);
      link.href = downloadUrl;
      link.download = match?.[1] ?? `payroll-${selectedItem.payrollNo}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsExporting(false);
    }
  }

  if (isLoading) return <Loading />;
  if (error || data?.error) return <DeadHamster />;

  return (
    <div className="flex w-full flex-col gap-2 p-4 pt-0">
      <div className="flex w-full items-center gap-1 rounded-lg border bg-card p-2">
        <div className="relative mr-2 flex items-center">
          <Search className="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
          <Input
            className="h-8 w-72 pl-7 text-xs"
            placeholder="Search payroll..."
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button variant="outline" size="icon-sm" aria-label="New Payroll" onClick={() => setAddOpen(true)}>
          <Plus />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Edit"
          disabled={!selectedItem}
          onClick={() => selectedItem && setEditOpen(true)}
        >
          <Pencil />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Delete"
          disabled={!selectedItem}
          onClick={() => selectedItem && setDeleteOpen(true)}
        >
          <Trash2 />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2"
          disabled={!selectedItem || isExporting}
          onClick={handleExport}
        >
          <Download />
          <span className="hidden sm:inline">{isExporting ? "Exporting..." : "Export Excel"}</span>
        </Button>

        <div className="ml-auto hidden min-w-0 items-center gap-2 rounded-md border border-transparent bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground md:flex">
          {selectedItem ? (
            <>
              <span className="font-medium text-foreground">Selected</span>
              <span className="truncate">Payroll {selectedItem.payrollNo}</span>
            </>
          ) : (
            <span>Select a payroll row to edit</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border p-2">
        {filteredItems.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? "No results match your search." : "No payroll records found."}
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible">
            <Table className="w-max min-w-full table-fixed text-xs [&_td:first-child]:border-l [&_td]:border-r [&_th:first-child]:border-l [&_th]:border-r">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-28 min-w-28">Payroll No.</TableHead>
                  <TableHead className="w-32 min-w-32">Month</TableHead>
                  <TableHead className="w-40 min-w-40">Fund</TableHead>
                  <TableHead className="w-28 min-w-28 text-center">Payees</TableHead>
                  <TableHead className="w-36 min-w-36 text-right">Total</TableHead>
                  <TableHead className="w-44 min-w-44">Authorized Official</TableHead>
                  <TableHead className="w-44 min-w-44">Disbursing Officer</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, index) => {
                  const selected = selectedItem?.id === item.id;
                  return (
                    <TableRow
                      key={item.id}
                      className={cn(
                        "cursor-pointer select-none transition-colors",
                        selected
                          ? "bg-[#F3F7FB] shadow-[inset_0_0_0_1px_#9EB7D1] hover:bg-[#EAF2FA]"
                          : index % 2 === 1
                            ? "bg-muted/70 hover:bg-muted"
                            : "hover:bg-muted/45",
                      )}
                      title={selected ? "Selected. Double-click to edit." : "Click to select. Double-click to edit."}
                      onClick={() => setSelectedItem(previous => previous?.id === item.id ? null : item)}
                      onDoubleClick={() => {
                        setSelectedItem(item);
                        setEditOpen(true);
                      }}
                    >
                      <TableCell className="font-mono font-semibold text-[#9A1B12]">{item.payrollNo}</TableCell>
                      <TableCell>{formatMonth(item.payrollMonth)}</TableCell>
                      <TableCell>{item.fund}</TableCell>
                      <TableCell className="text-center">{item.entries.length}</TableCell>
                      <TableCell className="text-right font-semibold">{formatAmount(item.totalAmount)}</TableCell>
                      <TableCell>{item.authorizedOfficial}</TableCell>
                      <TableCell>{item.disbursingOfficer}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={TOTAL_COLS} className="h-2 border-0 p-0" />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PayrollDialog
        mode="add"
        open={addOpen}
        onOpenChange={setAddOpen}
        onSuccess={item => {
          mutate();
          setSelectedItem(item);
        }}
      />
      <PayrollDialog
        key={selectedItem ? `edit-${selectedItem.id}` : "edit-none"}
        mode="edit"
        item={selectedItem ?? undefined}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={item => {
          mutate();
          setSelectedItem(item);
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payroll</DialogTitle>
            <DialogDescription>
              Delete payroll <strong>{selectedItem?.payrollNo}</strong>? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" disabled={isDeleting} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayrollDialog({
  mode,
  item,
  open,
  onOpenChange,
  onSuccess,
}: {
  mode: "add" | "edit";
  item?: PayrollItemResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (item: PayrollItemResponse) => void;
}) {
  const [form, setForm] = useState<PayrollForm>(mode === "edit" && item ? makeEditForm(item) : makeEmptyForm());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalAmount = payrollTotal(form.entries);

  function update<K extends keyof PayrollForm>(key: K, value: PayrollForm[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function updateEntry(index: number, key: keyof PayrollEntryForm, value: string) {
    setForm(previous => ({
      ...previous,
      entries: previous.entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [key]: value } : entry),
    }));
  }

  function addEntry() {
    setForm(previous => ({ ...previous, entries: [...previous.entries, emptyEntry()] }));
  }

  function removeEntry(index: number) {
    setForm(previous => ({
      ...previous,
      entries: previous.entries.length === 1
        ? previous.entries
        : previous.entries.filter((_, entryIndex) => entryIndex !== index),
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const url = mode === "add" ? "/api/forms/payroll" : `/api/forms/payroll/${item!.id}`;
      const method = mode === "add" ? "POST" : "PATCH";
      const res = await $fetch<PayrollResponse, ApiResponseException>(url, {
        method,
        body: toPayload(form),
      });

      if (res.error || !res.data?.data) {
        setError("Failed to save payroll. Please check the fields and try again.");
        return;
      }

      onSuccess(res.data.data);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(900px,calc(100dvh-2rem))] w-[min(1320px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-[1320px]">
        <DialogHeader className="border-b border-[#E4EBF2] px-6 py-5 lg:px-8">
          <DialogTitle className="text-xl">{mode === "add" ? "New Payroll" : "Edit Payroll"}</DialogTitle>
          <DialogDescription>
            Prepare a monthly payroll and manage the payee rows for that period.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="grid gap-4">
                <FormSection title="Payroll Header">
                  <div className="grid gap-4 md:grid-cols-3">
                    <TextField label="Payroll No." value={form.payrollNo} required onChange={value => update("payrollNo", value)} />
                    <TextField label="Payroll Month" type="month" value={form.payrollMonth} required onChange={value => {
                      update("payrollMonth", value);
                      if (mode === "add") update("payrollNo", value);
                    }} />
                    <TextField label="Fund" value={form.fund} required onChange={value => update("fund", value)} />
                    <TextField label="LGU" value={form.lgu} required onChange={value => update("lgu", value)} />
                    <TextField label="Sheet" value={form.sheetNumber} required inputMode="numeric" onChange={value => update("sheetNumber", value)} />
                    <TextField label="Total Sheets" value={form.totalSheets} required inputMode="numeric" onChange={value => update("totalSheets", value)} />
                  </div>
                </FormSection>

                <FormSection title="Payee Rows">
                  <div className="overflow-x-auto">
                    <Table className="min-w-[860px] table-fixed text-xs [&_td]:border-r [&_th]:border-r">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14 text-center">No.</TableHead>
                          <TableHead className="w-56">Name</TableHead>
                          <TableHead className="w-44">Position</TableHead>
                          <TableHead className="w-40">ID No.</TableHead>
                          <TableHead className="w-36 text-right">Amount</TableHead>
                          <TableHead className="w-20 text-center">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {form.entries.map((entry, index) => (
                          <TableRow key={index}>
                            <TableCell className="text-center font-mono">{index + 1}</TableCell>
                            <TableCell>
                              <Input className="h-8 text-xs" value={entry.name} required onChange={event => updateEntry(index, "name", event.target.value)} />
                            </TableCell>
                            <TableCell>
                              <Input className="h-8 text-xs" value={entry.position} required onChange={event => updateEntry(index, "position", event.target.value)} />
                            </TableCell>
                            <TableCell>
                              <Input className="h-8 text-xs" value={entry.idNo} onChange={event => updateEntry(index, "idNo", event.target.value)} />
                            </TableCell>
                            <TableCell>
                              <Input className="h-8 text-right text-xs" value={entry.amount} required inputMode="decimal" onChange={event => updateEntry(index, "amount", event.target.value)} />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button type="button" variant="ghost" size="sm" disabled={form.entries.length === 1} onClick={() => removeEntry(index)}>
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Button type="button" variant="outline" size="sm" onClick={addEntry}>
                      <Plus />
                      Add Row
                    </Button>
                    <p className="text-sm font-semibold text-[#122033]">Total: {formatAmount(totalAmount)}</p>
                  </div>
                </FormSection>

                <FormSection title="Certification Signatories">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <TextField label="Authorized Official" value={form.authorizedOfficial} required onChange={value => update("authorizedOfficial", value)} />
                    <TextField label="Head of Accounting Division/Unit" value={form.headOfAccounting} required onChange={value => update("headOfAccounting", value)} />
                    <TextField label="Head of Treasury Division/Unit" value={form.headOfTreasury} required onChange={value => update("headOfTreasury", value)} />
                    <TextField label="Local Chief Executive" value={form.localChiefExecutive} required onChange={value => update("localChiefExecutive", value)} />
                    <TextField label="Disbursing Officer" value={form.disbursingOfficer} required onChange={value => update("disbursingOfficer", value)} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField label="CAFAO No." value={form.cafaoNo} onChange={value => update("cafaoNo", value)} />
                      <TextField label="CAFAO Date" type="date" value={form.cafaoDate} onChange={value => update("cafaoDate", value)} />
                    </div>
                  </div>
                </FormSection>
              </div>

              <aside className="order-first xl:sticky xl:top-0 xl:order-none xl:self-start">
                <PayrollSummary form={form} totalAmount={totalAmount} />
              </aside>
            </div>
          </div>

          {error && <p role="alert" className="mx-6 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <DialogFooter className="shrink-0 border-t border-[#E4EBF2] bg-[#FAFCFE] px-6 py-4 lg:px-8">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isSubmitting}>Cancel</Button>
            </DialogClose>
            <Button size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : mode === "add" ? "Create" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#D8E2EC] bg-[oklch(0.995_0.004_250)] p-4 shadow-[0_1px_2px_rgba(18,32,51,0.04)]">
      <header className="mb-4 border-b border-[#E4EBF2] pb-3">
        <h2 className="text-sm font-semibold text-[#122033]">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  required,
  type = "text",
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs text-[#415367]">{label}{required && <span className="text-red-600">*</span>}</Label>
      <Input type={type} inputMode={inputMode} required={required} value={value} onChange={event => onChange(event.target.value)} className="h-9 border-[#CCD7E2] bg-white text-sm" />
    </div>
  );
}

function PayrollSummary({ form, totalAmount }: { form: PayrollForm; totalAmount: string }) {
  const items = [
    { label: "Payroll No.", value: form.payrollNo || "-" },
    { label: "Month", value: form.payrollMonth ? formatMonth(form.payrollMonth) : "-" },
    { label: "Fund", value: form.fund || "-" },
    { label: "Payees", value: String(form.entries.length) },
    { label: "Total", value: formatAmount(totalAmount) },
  ];

  return (
    <div className="rounded-lg border border-[#D8E2EC] bg-[#F8FAFC] p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#4E72AA]">Payroll Summary</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
        {items.map(item => (
          <div key={item.label} className="min-w-0 rounded-md border border-[#E4EBF2] bg-[oklch(0.998_0.003_250)] px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#63778C]">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#122033]" title={item.value}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
