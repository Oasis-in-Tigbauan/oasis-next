'use client';

import {DateTime} from 'luxon';
import {useEffect, useRef, useState} from 'react';

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
import {ScrollArea} from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {Textarea} from '@/components/ui/textarea';
import {$fetch} from '@/lib/http/client/fetch';
import type {
  ApiResponseException,
  TravelOrderItemResponse,
  TravelOrderUserItemResponse,
  TravelOrderUserListResponse,
} from '@/lib/http/client/responses';

const STATUS_OPTIONS = [
  {value: 'co-hr', label: 'CO-HR'},
  {value: 'filed', label: 'Filed'},
  {value: 'missing', label: 'Missing'},
  {value: 'cancelled', label: 'Cancelled'},
] as const;

const CATEGORY_OPTIONS = [
  {value: 'official', label: 'Official'},
  {value: 'personal', label: 'Personal'},
] as const;

type FormState = {
  status: string;
  category: string;
  startDate: string;
  endDate: string;
  location: string;
  purpose: string;
  notes: string;
  subjectToClaims: boolean;
  requestorId: string;
  requestorName: string;
};

function makeEmptyForm(): FormState {
  return {
    status: 'filed',
    category: 'official',
    startDate: '',
    endDate: '',
    location: '',
    purpose: '',
    notes: '',
    subjectToClaims: true,
    requestorId: '',
    requestorName: '',
  };
}

function toDatetimeLocal(isoString: string | undefined): string {
  if (!isoString) return '';
  const dt = DateTime.fromISO(isoString);
  if (!dt.isValid) return '';
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

function makeEditForm(item: TravelOrderItemResponse): FormState {
  return {
    status: item.travelOrderStatus,
    category: item.category,
    startDate: toDatetimeLocal(item.startDate),
    endDate: toDatetimeLocal(item.endDate),
    location: item.location,
    purpose: item.purpose,
    notes: item.notes ?? '',
    subjectToClaims: item.subjectToClaims,
    requestorId: item.requestor.id,
    requestorName: item.requestor.name,
  };
}

type Props = {
  mode: 'add' | 'edit';
  editItem?: TravelOrderItemResponse;
  open: boolean;
  canDelegate: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function TravelOrderFormDialog({
  mode,
  editItem,
  open,
  canDelegate,
  onOpenChange,
  onSuccess,
}: Props) {
  const [form, setForm] = useState<FormState>(
    mode === 'edit' && editItem ? makeEditForm(editItem) : makeEmptyForm(),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // User search state
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<TravelOrderUserItemResponse[]>([]);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const userSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  // Debounced user search — only fires when the query is non-empty
  useEffect(() => {
    if (!canDelegate) return;
    if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);

    const trimmed = userQuery.trim();
    if (!trimmed) return;

    userSearchTimeout.current = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await $fetch<TravelOrderUserListResponse, ApiResponseException>(
          `/api/forms/travel-order/users?q=${encodeURIComponent(trimmed)}`,
        );
        if (!res.error && res.data?.data) {
          setUserResults(res.data.data);
          setUserDropdownOpen(res.data.data.length > 0);
        }
      } finally {
        setIsSearchingUsers(false);
      }
    }, 300);

    return () => {
      if (userSearchTimeout.current) clearTimeout(userSearchTimeout.current);
    };
  }, [userQuery, canDelegate]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectUser(u: TravelOrderUserItemResponse) {
    setForm((f) => ({...f, requestorId: u.id, requestorName: u.name}));
    setUserQuery(u.name);
    setUserDropdownOpen(false);
  }

  async function handleSubmit() {
    setIsSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        status: form.status,
        category: form.category,
        startDate: form.startDate,
        location: form.location,
        purpose: form.purpose,
        subjectToClaims: form.subjectToClaims,
      };

      if (form.endDate) body.endDate = form.endDate;
      if (form.notes) body.notes = form.notes;
      if (canDelegate && form.requestorId && mode === 'add') {
        body.requestorId = form.requestorId;
      }

      const url =
        mode === 'add' ? '/api/forms/travel-order' : `/api/forms/travel-order/${editItem!.id}`;
      const method = mode === 'add' ? 'POST' : 'PATCH';

      const res = await $fetch<{ok: boolean; data: TravelOrderItemResponse}, ApiResponseException>(
        url,
        {method, body},
      );

      if (res.error) {
        const msg =
          typeof res.error === 'object' && 'details' in res.error
            ? String((res.error as {details: unknown}).details)
            : 'An error occurred. Please try again.';
        setError(msg);
        return;
      }

      onSuccess();
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'New Travel Order' : 'Edit Travel Order'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Fill in the details to create a new travel order.'
              : 'Update the travel order details.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-4">
          <div className="flex flex-col gap-4 py-2">
            {/* Status */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({...f, status: v}))}
              >
                <SelectTrigger id="to-status" className="text-xs h-8">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-category">Category</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({...f, category: v}))}
              >
                <SelectTrigger id="to-category" className="text-xs h-8">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-start-date">Start Date & Time (UTC+8)</Label>
              <Input
                id="to-start-date"
                type="datetime-local"
                className="text-xs h-8"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({...f, startDate: e.target.value}))}
              />
            </div>

            {/* End Date */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-end-date">
                End Date & Time (UTC+8) <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="to-end-date"
                type="datetime-local"
                className="text-xs h-8"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({...f, endDate: e.target.value}))}
              />
            </div>

            {/* Location */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-location">Location</Label>
              <Input
                id="to-location"
                className="text-xs h-8"
                placeholder="Enter destination"
                value={form.location}
                onChange={(e) => setForm((f) => ({...f, location: e.target.value}))}
              />
            </div>

            {/* Purpose */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-purpose">Purpose / Reason</Label>
              <Textarea
                id="to-purpose"
                className="text-xs resize-none"
                rows={3}
                placeholder="Enter purpose or reason for travel"
                value={form.purpose}
                onChange={(e) => setForm((f) => ({...f, purpose: e.target.value}))}
              />
            </div>

            {/* Notes */}
            <div className="grid gap-1.5">
              <Label htmlFor="to-notes">
                Notes <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="to-notes"
                className="text-xs resize-none"
                rows={2}
                placeholder="Additional notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({...f, notes: e.target.value}))}
              />
            </div>

            {/* Subject to Claims */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="to-claims"
                checked={form.subjectToClaims}
                onCheckedChange={(checked) =>
                  setForm((f) => ({...f, subjectToClaims: Boolean(checked)}))
                }
              />
              <Label htmlFor="to-claims" className="cursor-pointer">
                Subject to Claims
              </Label>
            </div>

            {/* Requestor (delegate, only for TRAVEL_WRITE users, only on create) */}
            {canDelegate && mode === 'add' && (
              <div className="grid gap-1.5">
                <Label htmlFor="to-requestor">
                  Requestor{' '}
                  <span className="text-muted-foreground">(optional — defaults to you)</span>
                </Label>
                <div className="relative" ref={userDropdownRef}>
                  <Input
                    id="to-requestor"
                    className="text-xs h-8"
                    placeholder="Search by name or email..."
                    value={userQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setUserQuery(val);
                      if (!val) {
                        setForm((f) => ({...f, requestorId: '', requestorName: ''}));
                        setUserResults([]);
                        setUserDropdownOpen(false);
                      }
                    }}
                    autoComplete="off"
                  />
                  {isSearchingUsers && (
                    <div className="absolute right-2 top-1.5 text-xs text-muted-foreground">
                      Searching...
                    </div>
                  )}
                  {userDropdownOpen && userResults.length > 0 && (
                    <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-auto">
                      {userResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectUser(u);
                          }}
                        >
                          <div className="font-medium">{u.name}</div>
                          <div className="text-muted-foreground">
                            {u.office.name} — {u.officePosition.name}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </ScrollArea>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={isSubmitting}>
              Cancel
            </Button>
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : mode === 'add' ? 'Create' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
