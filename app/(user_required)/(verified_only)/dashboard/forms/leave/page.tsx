'use client';

import {Download, Pencil, Plus, Search, Trash2} from 'lucide-react';
import {DateTime} from 'luxon';
import {
  useId,
  useMemo,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import {toast} from 'sonner';
import useSWR from 'swr';

import DeadHamster from '@/components/dead-hamster';
import Loading from '@/components/loading';
import {Button} from '@/components/ui/button';
import {Checkbox} from '@/components/ui/checkbox';
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
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group';
import {Separator} from '@/components/ui/separator';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import type {
  Commutation,
  LeaveApplicationExportPayload,
  LeaveType,
  OtherPurpose,
  SickLocation,
  StudyPurpose,
  VacationLocation,
} from '@/lib/forms/leave';
import {calculateInclusiveLeaveDates, formatInclusiveLeaveDates} from '@/lib/forms/leave-dates';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  BetterFetchResponse,
  LeaveApplicationItemResponse,
  LeaveApplicationListResponse,
  LeaveApplicationResponse,
  UserResponse,
} from '@/lib/http/client/responses';
import {cn} from '@/lib/utils';

type FormState = LeaveApplicationExportPayload;

const todayInManila = DateTime.now().setZone('Asia/Manila').toISODate() ?? '';
const TOTAL_COLS = 13;

const LEAVE_OPTIONS: Array<{key: Exclude<LeaveType, 'other'>; label: string; detail?: string}> = [
  {
    key: 'vacation',
    label: 'Vacation Leave',
    detail: 'Sec. 51, Rule XVI, Omnibus Rules Implementing EO 292',
  },
  {
    key: 'mandatory-forced',
    label: 'Mandatory Forced Leave',
    detail: 'Sec. 25, Rule XVI, Omnibus Rules Implementing EO 292',
  },
  {
    key: 'sick',
    label: 'Sick Leave',
    detail: 'Sec. 43, Rule XVI, Omnibus Rules Implementing EO 292',
  },
  {key: 'maternity', label: 'Maternity Leave', detail: 'RA 11210/IRR issued by CSC, DOLE and SSS'},
  {key: 'paternity', label: 'Paternity Leave', detail: 'RA 8187/CSC MC 71, s. 1998, as amended'},
  {
    key: 'special-privilege',
    label: 'Special Privilege Leave',
    detail: 'Sec. 21, Rule XVI, Omnibus Rules Implementing EO 292',
  },
  {key: 'solo-parent', label: 'Solo Parent Leave', detail: 'RA 8972/CSC MC No. 8, s. 2004'},
  {
    key: 'study',
    label: 'Study Leave',
    detail: 'Sec. 68 Rule XVI, Omnibus Rules Implementing EO 292',
  },
  {key: 'vawc', label: '10 Day VAWC Leave', detail: 'RA 9262/CSC MC. No. 15, s. 2005'},
  {
    key: 'rehabilitation-privilege',
    label: 'Rehabilitation Privilege',
    detail: 'Sec. 55, Rule XVI, Omnibus Rules Implementing EO 292',
  },
  {
    key: 'special-women',
    label: 'Special Leave benefits for Women',
    detail: 'RA 9710/CSC MC No. 25, s. 2010',
  },
  {
    key: 'special-emergency',
    label: 'Special Emergency (Calamity) Leave',
    detail: 'CSC MC No. 2, s. 2012, as amended',
  },
  {key: 'adoption', label: 'Adoption Leave', detail: 'RA No. 8552'},
];

const LEAVE_LABELS = new Map<LeaveType, string>([
  ...LEAVE_OPTIONS.map((option) => [option.key, option.label] as const),
  ['other', 'Others'],
]);

function makeInitialForm(user?: UserResponse['data']): FormState {
  const nameParts = (user?.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const firstName =
    nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : (user?.fullName ?? '');
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

  return {
    lastName,
    firstName,
    middleName: '',
    dateOfFiling: todayInManila,
    position: user?.office.role.name ?? '',
    monthlySalary: '',
    leaveTypes: [],
    otherLeaveDescription: '',
    otherPurposes: [],
    workingDays: '',
    leaveStartDate: todayInManila,
    commutation: 'not-requested',
    approvedBy: 'MYRA GENE GAUTIER',
    approvedByPosition: 'MUNICIPAL BUDGET OFFICER',
  };
}

function makeEditForm(item: LeaveApplicationItemResponse): FormState {
  return {
    lastName: item.lastName,
    firstName: item.firstName,
    middleName: item.middleName ?? '',
    dateOfFiling: item.dateOfFiling,
    position: item.position,
    monthlySalary: item.monthlySalary,
    leaveTypes: item.leaveTypes,
    otherLeaveDescription: item.otherLeaveDescription ?? '',
    vacationLocation: item.vacationLocation,
    vacationLocationDetails: item.vacationLocationDetails ?? '',
    sickLocation: item.sickLocation,
    illnessDetails: item.illnessDetails ?? '',
    studyPurpose: item.studyPurpose,
    otherPurposes: item.otherPurposes,
    workingDays: item.workingDays,
    leaveStartDate: item.leaveStartDate,
    commutation: item.commutation,
    approvedBy: item.approvedBy ?? '',
    approvedByPosition: item.approvedByPosition ?? '',
  };
}

function applicantName(item: Pick<FormState, 'lastName' | 'firstName' | 'middleName'>) {
  return [item.firstName, item.middleName, item.lastName]
    .filter((value) => value?.trim())
    .join(' ');
}

function formatDate(value: string) {
  const dt = DateTime.fromISO(value);
  return dt.isValid ? dt.toFormat('M/d/yyyy') : value;
}

function formatSalary(value: string) {
  const salary = Number.parseFloat(value);
  return Number.isFinite(salary)
    ? salary.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})
    : value;
}

function selectedLeaveLabel(item: Pick<FormState, 'leaveTypes' | 'otherLeaveDescription'>) {
  const type = item.leaveTypes[0];
  if (!type) return '-';
  if (type === 'other') return item.otherLeaveDescription || 'Others';
  return LEAVE_LABELS.get(type) ?? type;
}

export default function LeaveApplicationPage() {
  const {data: meData} = useSWR<BetterFetchResponse<UserResponse, ApiResponseException>>(
    '/api/account/me',
    $fetch,
  );
  const {data, error, isLoading, mutate} = useSWR<
    BetterFetchResponse<LeaveApplicationListResponse, ApiResponseException>
  >('/api/forms/leave', $fetch);

  const [selectedItem, setSelectedItem] = useState<LeaveApplicationItemResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const items = useMemo(() => data?.data?.data ?? [], [data?.data?.data]);
  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return items;

    return items.filter((item) =>
      [
        String(item.refNumber),
        applicantName(item),
        item.dateOfFiling,
        item.position,
        item.monthlySalary,
        selectedLeaveLabel(item),
        item.illnessDetails ?? '',
        item.workingDays,
        item.inclusiveDates,
        item.approvedBy ?? '',
        item.approvedByPosition ?? '',
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [items, searchQuery]);

  async function handleDelete() {
    if (!selectedItem) return;
    setIsDeleting(true);
    try {
      const res = await $fetch<unknown, ApiResponseException>(
        `/api/forms/leave/${selectedItem.id}`,
        {method: 'DELETE'},
      );
      if (res.error) {
        toast.error('Leave application was not deleted', {
          description: 'Please refresh the list and try again.',
        });
        return;
      }
      setSelectedItem(null);
      setDeleteOpen(false);
      mutate();
      toast.success('Leave application deleted');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleExport(item: LeaveApplicationItemResponse | null) {
    if (!item) return;
    setIsExporting(true);
    try {
      const response = await fetch('/api/forms/leave/export', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(makeEditForm(item)),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          details?: string | {message?: string};
        } | null;
        const details = body?.details;
        toast.error('Leave export failed', {
          description:
            typeof details === 'string'
              ? details
              : (details?.message ?? 'Unable to export the leave application.'),
        });
        return;
      }

      const blob = await response.blob();
      const match = (response.headers.get('Content-Disposition') ?? '').match(/filename="([^"]+)"/);
      const link = document.createElement('a');
      const downloadUrl = URL.createObjectURL(blob);
      link.href = downloadUrl;
      link.download = match?.[1] ?? 'leave-application.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
      toast.success('Leave PDF is ready');
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
            placeholder="Search leave applications..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Button
          variant="outline"
          size="icon-sm"
          aria-label="New Leave Application"
          onClick={() => setAddOpen(true)}
        >
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

        <div className="ml-auto flex items-center gap-2">
          <div
            className={cn(
              'hidden min-w-0 items-center gap-2 rounded-md border px-2.5 py-1 text-xs md:flex',
              selectedItem
                ? 'border-[#C8D7E7] bg-[#F3F7FB]'
                : 'border-transparent bg-muted/40 text-muted-foreground',
            )}
          >
            {selectedItem ? (
              <>
                <span className="shrink-0 font-medium">Export target</span>
                <span className="truncate text-muted-foreground">
                  REF #{selectedItem.refNumber} - {applicantName(selectedItem)}
                </span>
              </>
            ) : (
              <span>Select a row to export</span>
            )}
          </div>
          <Button
            variant={selectedItem ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-2"
            disabled={!selectedItem || isExporting}
            onClick={() => handleExport(selectedItem)}
          >
            <Download />
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export PDF'}</span>
          </Button>
        </div>
      </div>

      <div className="rounded-lg border p-2">
        {filteredItems.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No results match your search.' : 'No leave applications found.'}
          </div>
        ) : (
          <div className="h-[calc(100vh-11rem)] overflow-auto [&_div[data-slot=table-container]]:overflow-visible">
            <Table className="w-max min-w-full table-fixed text-xs [&_td:first-child]:border-l [&_td]:border-r [&_th:first-child]:border-l [&_th]:border-r">
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead className="w-16 min-w-16">REF</TableHead>
                  <TableHead className="w-32 min-w-32">Date of Application</TableHead>
                  <TableHead className="w-52 min-w-52">Name</TableHead>
                  <TableHead className="w-32 min-w-32">No. of Days</TableHead>
                  <TableHead className="w-48 min-w-48">Type / Details</TableHead>
                  <TableHead className="w-44 min-w-44">Inclusive Dates</TableHead>
                  <TableHead className="w-44 min-w-44">Approved By</TableHead>
                  <TableHead className="w-52 min-w-52">Approver Position</TableHead>
                  <TableHead className="w-32 min-w-32">Last Name</TableHead>
                  <TableHead className="w-40 min-w-40">First Name</TableHead>
                  <TableHead className="w-32 min-w-32">Mid Name</TableHead>
                  <TableHead className="w-56 min-w-56">Position</TableHead>
                  <TableHead className="w-32 min-w-32 text-right">Salary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, index) => {
                  const selected = selectedItem?.id === item.id;
                  return (
                    <TableRow
                      key={item.id}
                      className={cn(
                        'cursor-pointer select-none transition-colors',
                        selected
                          ? 'bg-[#F3F7FB] shadow-[inset_0_0_0_1px_#9EB7D1] hover:bg-[#EAF2FA]'
                          : index % 2 === 1
                            ? 'bg-muted/70 hover:bg-muted'
                            : 'hover:bg-muted/45',
                      )}
                      title={
                        selected
                          ? 'Selected. Double-click to edit.'
                          : 'Click to select. Double-click to edit.'
                      }
                      onClick={() =>
                        setSelectedItem((previous) => (previous?.id === item.id ? null : item))
                      }
                      onDoubleClick={() => {
                        setSelectedItem(item);
                        setEditOpen(true);
                      }}
                    >
                      <TableCell className="w-16 min-w-16 font-mono font-medium">
                        {item.refNumber}
                      </TableCell>
                      <TableCell className="w-32 min-w-32">
                        {formatDate(item.dateOfFiling)}
                      </TableCell>
                      <TableCell className="w-52 min-w-52 font-semibold text-[#1237C9]">
                        {applicantName(item)}
                      </TableCell>
                      <TableCell className="w-32 min-w-32 text-center font-semibold text-[#1237C9]">
                        {item.workingDays} Day{item.workingDays === '1' ? '' : 's'}
                      </TableCell>
                      <TableCell className="w-48 min-w-48">{selectedLeaveLabel(item)}</TableCell>
                      <TableCell className="w-44 min-w-44">{item.inclusiveDates || '-'}</TableCell>
                      <TableCell className="w-44 min-w-44">{item.approvedBy || '-'}</TableCell>
                      <TableCell className="w-52 min-w-52">
                        {item.approvedByPosition || '-'}
                      </TableCell>
                      <TableCell className="w-32 min-w-32 font-semibold text-[#4D7F9E]">
                        {item.lastName}
                      </TableCell>
                      <TableCell className="w-40 min-w-40 font-semibold text-[#4D7F9E]">
                        {item.firstName}
                      </TableCell>
                      <TableCell className="w-32 min-w-32 font-semibold text-[#4D7F9E]">
                        {item.middleName || '-'}
                      </TableCell>
                      <TableCell className="w-56 min-w-56 font-semibold text-[#4D7F9E]">
                        {item.position}
                      </TableCell>
                      <TableCell className="w-32 min-w-32 text-right text-[#4D7F9E]">
                        {formatSalary(item.monthlySalary)}
                      </TableCell>
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

      <LeaveApplicationDialog
        mode="add"
        open={addOpen}
        currentUser={meData?.data?.data}
        onOpenChange={setAddOpen}
        onSuccess={(item) => {
          mutate();
          setSelectedItem(item);
        }}
      />
      <LeaveApplicationDialog
        key={selectedItem ? `edit-${selectedItem.id}` : 'edit-none'}
        mode="edit"
        item={selectedItem ?? undefined}
        open={editOpen}
        currentUser={meData?.data?.data}
        onOpenChange={setEditOpen}
        onSuccess={(item) => {
          mutate();
          setSelectedItem(item);
        }}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Leave Application</DialogTitle>
            <DialogDescription>
              Delete leave application <strong>REF #{selectedItem?.refNumber}</strong> for{' '}
              <strong>{selectedItem ? applicantName(selectedItem) : ''}</strong>? This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setDeleteOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" size="sm" disabled={isDeleting} onClick={handleDelete}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaveApplicationDialog({
  mode,
  item,
  open,
  currentUser,
  onOpenChange,
  onSuccess,
}: {
  mode: 'add' | 'edit';
  item?: LeaveApplicationItemResponse;
  open: boolean;
  currentUser?: UserResponse['data'];
  onOpenChange: (open: boolean) => void;
  onSuccess: (item: LeaveApplicationItemResponse) => void;
}) {
  const [form, setForm] = useState<FormState>(
    mode === 'edit' && item ? makeEditForm(item) : makeInitialForm(currentUser),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inclusiveRange = useMemo(
    () => calculateInclusiveLeaveDates(form.leaveStartDate, form.workingDays),
    [form.leaveStartDate, form.workingDays],
  );
  const inclusiveDateLabel =
    formatInclusiveLeaveDates(inclusiveRange) ||
    'Select a weekday start date and number of working days';

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({...previous, [key]: value}));
  }

  function toggleLeaveType(type: LeaveType, checked: boolean) {
    update('leaveTypes', checked ? [type] : []);
    if (type !== 'other') update('otherLeaveDescription', '');
  }

  function toggleOtherPurpose(type: OtherPurpose, checked: boolean) {
    update(
      'otherPurposes',
      checked
        ? Array.from(new Set([...form.otherPurposes, type]))
        : form.otherPurposes.filter((item) => item !== type),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const url = mode === 'add' ? '/api/forms/leave' : `/api/forms/leave/${item!.id}`;
      const method = mode === 'add' ? 'POST' : 'PATCH';
      const res = await $fetch<LeaveApplicationResponse, ApiResponseException>(url, {
        method,
        body: form,
      });

      if (res.error || !res.data?.data) {
        setError('Failed to save leave application. Please check the fields and try again.');
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
      <DialogContent className="flex h-[min(900px,calc(100dvh-2rem))] w-[min(1280px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-[calc(100vw-2rem)] xl:max-w-[1280px] 2xl:max-w-[1360px]">
        <DialogHeader className="border-b border-[#E4EBF2] px-6 py-5 lg:px-8">
          <DialogTitle className="text-xl">
            {mode === 'add' ? 'New Leave Application' : 'Edit Leave Application'}
          </DialogTitle>
          <DialogDescription>
            Save leave data for the management table and PDF export.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:px-8">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-4">
                <FormSection number="1-5" title="Applicant Information">
                  <div className="grid gap-4 md:grid-cols-3">
                    <TextField
                      label="Last name"
                      value={form.lastName}
                      required
                      onChange={(value) => update('lastName', value)}
                    />
                    <TextField
                      label="First name"
                      value={form.firstName}
                      required
                      onChange={(value) => update('firstName', value)}
                    />
                    <TextField
                      label="Middle name"
                      value={form.middleName ?? ''}
                      onChange={(value) => update('middleName', value)}
                    />
                    <TextField
                      label="Date of filing"
                      type="date"
                      value={form.dateOfFiling}
                      required
                      onChange={(value) => update('dateOfFiling', value)}
                    />
                    <TextField
                      label="Position"
                      value={form.position}
                      required
                      onChange={(value) => update('position', value)}
                    />
                    <TextField
                      label="Salary (Monthly)"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={form.monthlySalary}
                      required
                      onChange={(value) => update('monthlySalary', value)}
                    />
                  </div>
                </FormSection>

                <FormSection number="6.A" title="Type of Leave to Be Availed Of">
                  <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
                    {LEAVE_OPTIONS.map((option) => (
                      <CheckField
                        key={option.key}
                        id={`leave-${mode}-${option.key}`}
                        checked={form.leaveTypes.includes(option.key)}
                        label={option.label}
                        detail={option.detail}
                        onChange={(checked) => toggleLeaveType(option.key, checked)}
                      />
                    ))}
                  </div>
                  <div className="mt-5 grid gap-3">
                    <CheckField
                      id={`leave-${mode}-other`}
                      checked={form.leaveTypes.includes('other')}
                      label="Others"
                      onChange={(checked) => toggleLeaveType('other', checked)}
                    />
                    {form.leaveTypes.includes('other') && (
                      <Input
                        aria-label="Specify other leave type"
                        placeholder="Specify other leave type"
                        value={form.otherLeaveDescription}
                        onChange={(event) => update('otherLeaveDescription', event.target.value)}
                      />
                    )}
                  </div>
                </FormSection>

                <FormSection number="6.B" title="Details of Leave">
                  <div className="grid gap-5 lg:grid-cols-2">
                    <DetailChoice
                      title="Vacation/Special Privilege Leave"
                      value={form.vacationLocation ?? ''}
                      onValueChange={(value) =>
                        update(
                          'vacationLocation',
                          (value || undefined) as VacationLocation | undefined,
                        )
                      }
                      options={[
                        {value: 'within-philippines', label: 'Within Philippines'},
                        {value: 'abroad', label: 'Abroad (Specify)'},
                      ]}
                    >
                      <TextField
                        label="Specify location"
                        value={form.vacationLocationDetails ?? ''}
                        onChange={(value) => update('vacationLocationDetails', value)}
                      />
                    </DetailChoice>
                    <DetailChoice
                      title="Sick Leave"
                      value={form.sickLocation ?? ''}
                      onValueChange={(value) =>
                        update('sickLocation', (value || undefined) as SickLocation | undefined)
                      }
                      options={[
                        {value: 'in-hospital', label: 'In Hospital'},
                        {value: 'out-patient', label: 'Out-Patient'},
                      ]}
                    >
                      <TextField
                        label="Specify illness"
                        value={form.illnessDetails ?? ''}
                        onChange={(value) => update('illnessDetails', value)}
                      />
                    </DetailChoice>
                    <DetailChoice
                      title="Study Leave"
                      value={form.studyPurpose ?? ''}
                      onValueChange={(value) =>
                        update('studyPurpose', (value || undefined) as StudyPurpose | undefined)
                      }
                      options={[
                        {value: 'masters-degree', label: "Completion of Master's Degree"},
                        {value: 'bar-board-review', label: 'Bar/Board Examination Review'},
                      ]}
                    />
                    <fieldset className="rounded-lg border border-[#E4EBF2] bg-[#F8FAFC] p-4">
                      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#52657A]">
                        Other Purpose
                      </legend>
                      <div className="mt-2 space-y-3">
                        <CheckField
                          id={`purpose-${mode}-monetization`}
                          checked={form.otherPurposes.includes('monetization')}
                          label="Monetization of Leave Credits"
                          onChange={(checked) => toggleOtherPurpose('monetization', checked)}
                        />
                        <CheckField
                          id={`purpose-${mode}-terminal`}
                          checked={form.otherPurposes.includes('terminal')}
                          label="Terminal Leave"
                          onChange={(checked) => toggleOtherPurpose('terminal', checked)}
                        />
                      </div>
                    </fieldset>
                  </div>
                </FormSection>

                <FormSection number="6.C-6.D" title="Working Days and Commutation">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      label="Number of working days applied for"
                      type="number"
                      min="1"
                      value={form.workingDays}
                      required
                      onChange={(value) => update('workingDays', value)}
                    />
                    <TextField
                      label="Starting date"
                      type="date"
                      value={form.leaveStartDate}
                      required
                      onChange={(value) => update('leaveStartDate', value)}
                    />
                  </div>
                  <div className="mt-4 rounded-lg border border-[#C8D7E7] bg-[#F3F7FB] p-3 text-sm text-[#335892]">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em]">
                      Inclusive dates
                    </p>
                    <p className="mt-1 font-semibold">{inclusiveDateLabel}</p>
                  </div>
                  <fieldset className="mt-5">
                    <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#52657A]">
                      Commutation
                    </legend>
                    <RadioGroup
                      value={form.commutation}
                      onValueChange={(value) => update('commutation', value as Commutation)}
                      className="flex gap-6"
                    >
                      <RadioField
                        value="not-requested"
                        id={`not-requested-${mode}`}
                        label="Not requested"
                      />
                      <RadioField value="requested" id={`requested-${mode}`} label="Requested" />
                    </RadioGroup>
                  </fieldset>
                </FormSection>

                <FormSection number="7" title="Approval Data">
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextField
                      label="Approved by"
                      value={form.approvedBy ?? ''}
                      onChange={(value) => update('approvedBy', value)}
                    />
                    <TextField
                      label="Approver position"
                      value={form.approvedByPosition ?? ''}
                      onChange={(value) => update('approvedByPosition', value)}
                    />
                  </div>
                </FormSection>
              </div>

              <aside className="order-first xl:sticky xl:top-0 xl:order-none xl:self-start">
                <SummaryStrip
                  applicant={applicantName(form) || '-'}
                  leaveType={selectedLeaveLabel(form)}
                  workingDays={
                    form.workingDays
                      ? `${form.workingDays} Day${form.workingDays === '1' ? '' : 's'}`
                      : '-'
                  }
                  inclusiveDates={inclusiveDateLabel}
                  position={form.position || '-'}
                  salary={form.monthlySalary ? formatSalary(form.monthlySalary) : '-'}
                />
              </aside>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mx-6 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <DialogFooter className="shrink-0 border-t border-[#E4EBF2] bg-[#FAFCFE] px-6 py-4 lg:px-8">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isSubmitting}>
                Cancel
              </Button>
            </DialogClose>
            <Button size="sm" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : mode === 'add' ? 'Create' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSection({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[#D8E2EC] bg-[oklch(0.995_0.004_250)] p-4 shadow-[0_1px_2px_rgba(18,32,51,0.04)]">
      <header className="mb-4 flex items-center gap-3 border-b border-[#E4EBF2] pb-3">
        <span className="inline-flex h-7 min-w-12 items-center justify-center rounded-md bg-[#EDF3F9] px-2.5 text-[11px] font-bold tracking-[0.1em] text-[#335892]">
          {number}
        </span>
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
  type = 'text',
  min,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  min?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-xs text-[#415367]">
        {label}
        {required && <span className="text-red-600">*</span>}
      </Label>
      <Input
        id={id}
        type={type}
        min={min}
        inputMode={inputMode}
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 border-[#CCD7E2] bg-white text-sm"
      />
    </div>
  );
}

function CheckField({
  id,
  checked,
  label,
  detail,
  onChange,
}: {
  id: string;
  checked: boolean;
  label: string;
  detail?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-[#F6F9FC]">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(Boolean(value))}
        className="mt-0.5"
      />
      <Label
        htmlFor={id}
        className="block cursor-pointer text-sm font-medium leading-5 text-[#122033]"
      >
        {label}
        {detail && <span className="block text-xs font-normal text-[#63778C]">{detail}</span>}
      </Label>
    </div>
  );
}

function DetailChoice({
  title,
  value,
  onValueChange,
  options,
  children,
}: {
  title: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{value: string; label: string}>;
  children?: ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-[#E4EBF2] bg-[#F8FAFC] p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#52657A]">
        {title}
      </legend>
      <RadioGroup value={value} onValueChange={onValueChange} className="my-3 gap-3">
        {options.map((option) => (
          <RadioField
            key={option.value}
            id={`detail-${option.value}`}
            value={option.value}
            label={option.label}
          />
        ))}
      </RadioGroup>
      {children}
    </fieldset>
  );
}

function RadioField({value, id, label}: {value: string; id: string; label: string}) {
  return (
    <div className="flex items-center gap-2">
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="cursor-pointer text-sm text-[#122033]">
        {label}
      </Label>
    </div>
  );
}

function SummaryStrip({
  applicant,
  leaveType,
  workingDays,
  inclusiveDates,
  position,
  salary,
}: {
  applicant: string;
  leaveType: string;
  workingDays: string;
  inclusiveDates: string;
  position: string;
  salary: string;
}) {
  const items = [
    {label: 'Applicant', value: applicant},
    {label: 'Leave Type', value: leaveType},
    {label: 'Working Days', value: workingDays},
    {label: 'Inclusive Dates', value: inclusiveDates},
    {label: 'Position', value: position},
    {label: 'Salary', value: salary},
  ];

  return (
    <div className="rounded-lg border border-[#D8E2EC] bg-[#F8FAFC] p-3">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#4E72AA]">
        Data Preview
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
        {items.map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-md border border-[#E4EBF2] bg-[oklch(0.998_0.003_250)] px-3 py-2"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#63778C]">
              {item.label}
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-[#122033]" title={item.value}>
              {item.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
