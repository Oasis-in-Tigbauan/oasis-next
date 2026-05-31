"use client";

import { useId, useMemo, useState, type FormEvent, type InputHTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { DateTime } from "luxon";
import { Building2, CalendarDays, Download, FileText, Printer } from "lucide-react";
import useSWR from "swr";

import { $fetch } from "@/lib/http/client/fetch";
import type { ApiResponseException, BetterFetchResponse, UserResponse } from "@/lib/http/client/responses";
import type {
  Commutation,
  LeaveApplicationExportPayload,
  LeaveType,
  OtherPurpose,
  SickLocation,
  StudyPurpose,
  VacationLocation,
} from "@/lib/forms/leave";
import { calculateInclusiveLeaveDates, formatInclusiveLeaveDates } from "@/lib/forms/leave-dates";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type FormState = LeaveApplicationExportPayload;

const todayInManila = DateTime.now().setZone("Asia/Manila").toISODate() ?? "";
const LEAVE_OPTIONS: Array<{ key: Exclude<LeaveType, "other">; label: string; detail?: string }> = [
  { key: "vacation", label: "Vacation Leave", detail: "Sec. 51, Rule XVI, Omnibus Rules Implementing EO 292" },
  { key: "mandatory-forced", label: "Mandatory Forced Leave", detail: "Sec. 25, Rule XVI, Omnibus Rules Implementing EO 292" },
  { key: "sick", label: "Sick Leave", detail: "Sec. 43, Rule XVI, Omnibus Rules Implementing EO 292" },
  { key: "maternity", label: "Maternity Leave", detail: "RA 11210/IRR issued by CSC, DOLE and SSS" },
  { key: "paternity", label: "Paternity Leave", detail: "RA 8187/CSC MC 71, s. 1998, as amended" },
  { key: "special-privilege", label: "Special Privilege Leave", detail: "Sec. 21, Rule XVI, Omnibus Rules Implementing EO 292" },
  { key: "solo-parent", label: "Solo Parent Leave", detail: "RA 8972/CSC MC No. 8, s. 2004" },
  { key: "study", label: "Study Leave", detail: "Sec. 68 Rule XVI, Omnibus Rules Implementing EO 292" },
  { key: "vawc", label: "10 Day VAWC Leave", detail: "RA 9262/CSC MC. No. 15, s. 2005" },
  { key: "rehabilitation-privilege", label: "Rehabilitation Privilege", detail: "Sec. 55, Rule XVI, Omnibus Rules Implementing EO 292" },
  { key: "special-women", label: "Special Leave benefits for Women", detail: "RA 9710/CSC MC No. 25, s. 2010" },
  { key: "special-emergency", label: "Special Emergency (Calamity) Leave", detail: "CSC MC No. 2, s. 2012, as amended" },
  { key: "adoption", label: "Adoption Leave", detail: "RA No. 8552" },
];

function makeInitialForm(): FormState {
  return {
    lastName: "",
    firstName: "",
    middleName: "",
    dateOfFiling: todayInManila,
    position: "",
    monthlySalary: "",
    leaveTypes: [],
    otherLeaveDescription: "",
    otherPurposes: [],
    workingDays: "",
    leaveStartDate: todayInManila,
    commutation: "not-requested",
  };
}

export default function LeaveApplicationPage() {
  const { data } = useSWR<BetterFetchResponse<UserResponse, ApiResponseException>>("/api/account/me", $fetch);
  const officeName = data?.data?.data?.office.name ?? "Assigned office";
  const roleName = data?.data?.data?.office.role.name ?? "";
  const [form, setForm] = useState<FormState>(makeInitialForm);
  const [positionEdited, setPositionEdited] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inclusiveRange = useMemo(
    () => calculateInclusiveLeaveDates(form.leaveStartDate, form.workingDays),
    [form.leaveStartDate, form.workingDays],
  );
  const inclusiveDateLabel = formatInclusiveLeaveDates(inclusiveRange) || "Select a weekday start date and number of working days";
  const applicantName = [form.lastName, form.firstName, form.middleName].filter(value => value?.trim()).join(", ");
  const positionValue = positionEdited ? form.position : roleName;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  function toggleLeaveType(type: LeaveType, checked: boolean) {
    update("leaveTypes", checked ? [type] : []);
    if (type !== "other") {
      update("otherLeaveDescription", "");
    }
  }

  function toggleOtherPurpose(type: OtherPurpose, checked: boolean) {
    update("otherPurposes", checked
      ? Array.from(new Set([...form.otherPurposes, type]))
      : form.otherPurposes.filter(item => item !== type));
  }

  async function handleExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsExporting(true);

    try {
      const response = await fetch("/api/forms/leave/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, position: positionValue }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { details?: string | { message?: string } } | null;
        const details = body?.details;
        setError(typeof details === "string" ? details : details?.message ?? "Unable to export the leave application.");
        return;
      }

      const blob = await response.blob();
      const match = (response.headers.get("Content-Disposition") ?? "").match(/filename="([^"]+)"/);
      const link = document.createElement("a");
      const downloadUrl = URL.createObjectURL(blob);
      link.href = downloadUrl;
      link.download = match?.[1] ?? "leave-application.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <form onSubmit={handleExport} className="mx-auto flex w-full max-w-[1480px] flex-col gap-5 px-4 pb-8 md:px-6">
      <section className="flex flex-col gap-5 rounded-xl border border-[#D8E2EC] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FBFE_100%)] p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between lg:p-6">
        <div className="max-w-3xl">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#4E72AA]">Annex A / Office Filing</p>
          <p className="text-sm leading-6 text-[#52657A]">
            Enter the applicant details, choose the applicable leave options, and export the official folio PDF. Inclusive dates are calculated from the selected start date and working days, excluding Saturdays and Sundays.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="flex min-h-10 items-center gap-2 rounded-lg border border-[#D8E2EC] bg-white/80 px-3 py-2 text-sm text-[#335892] shadow-[0_1px_0_rgba(18,32,51,0.03)]">
            <Building2 className="size-4" />
            <span className="max-w-52 truncate font-medium">{officeName}</span>
          </div>
          <Button type="submit" disabled={isExporting} className="h-10 justify-center px-5 shadow-[0_8px_18px_rgba(51,88,146,0.18)]">
            <Download />
            {isExporting ? "Preparing file..." : "Export Printable PDF"}
          </Button>
        </div>
      </section>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(680px,1fr)_430px]">
        <div className="flex flex-col gap-4">
          <FormSection number="1-5" title="Applicant Information">
            <div className="grid gap-4 md:grid-cols-3">
              <TextField label="Last name" value={form.lastName} required onChange={value => update("lastName", value)} />
              <TextField label="First name" value={form.firstName} required onChange={value => update("firstName", value)} />
              <TextField label="Middle name" value={form.middleName ?? ""} onChange={value => update("middleName", value)} />
              <TextField label="Date of filing" type="date" value={form.dateOfFiling} required onChange={value => update("dateOfFiling", value)} />
              <TextField label="Position" value={positionValue} required onChange={value => {
                setPositionEdited(true);
                update("position", value);
              }} />
              <TextField label="Salary (Monthly)" inputMode="decimal" placeholder="0.00" value={form.monthlySalary} required onChange={value => update("monthlySalary", value)} />
            </div>
            <div className="mt-4 rounded-lg border border-[#D8E2EC] bg-[#F6F9FC] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#52657A]">Office / Agency</p>
              <p className="mt-1 text-sm font-semibold text-[#122033]">{officeName}</p>
            </div>
          </FormSection>

          <FormSection number="6.A" title="Type of Leave to Be Availed Of">
            <p className="mb-4 text-xs leading-5 text-[#63778C]">Select one leave type for this application.</p>
            <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
              {LEAVE_OPTIONS.map(option => (
                <CheckField
                  key={option.key}
                  id={`leave-${option.key}`}
                  checked={form.leaveTypes.includes(option.key)}
                  label={option.label}
                  detail={option.detail}
                  onChange={checked => toggleLeaveType(option.key, checked)}
                />
              ))}
            </div>
            <div className="mt-5 grid gap-3">
              <CheckField id="leave-other" checked={form.leaveTypes.includes("other")} label="Others" onChange={checked => toggleLeaveType("other", checked)} />
              {form.leaveTypes.includes("other") && (
                <Input aria-label="Specify other leave type" placeholder="Specify other leave type" value={form.otherLeaveDescription} onChange={event => update("otherLeaveDescription", event.target.value)} />
              )}
            </div>
          </FormSection>

          <FormSection number="6.B" title="Details of Leave">
            <div className="grid gap-6 lg:grid-cols-2">
              <DetailChoice
                title="In case of Vacation/Special Privilege Leave"
                value={form.vacationLocation ?? ""}
                onValueChange={value => update("vacationLocation", (value || undefined) as VacationLocation | undefined)}
                options={[
                  { value: "within-philippines", label: "Within Philippines" },
                  { value: "abroad", label: "Abroad (Specify)" },
                ]}
              >
                <TextField label="Specify location, if needed" value={form.vacationLocationDetails ?? ""} onChange={value => update("vacationLocationDetails", value)} />
              </DetailChoice>
              <DetailChoice
                title="In case of Sick Leave"
                value={form.sickLocation ?? ""}
                onValueChange={value => update("sickLocation", (value || undefined) as SickLocation | undefined)}
                options={[
                  { value: "in-hospital", label: "In Hospital (Specify illness)" },
                  { value: "out-patient", label: "Out-Patient (Specify illness)" },
                ]}
              >
                <TextField label="Specify illness" value={form.illnessDetails ?? ""} onChange={value => update("illnessDetails", value)} />
              </DetailChoice>
              <DetailChoice
                title="In case of Study Leave"
                value={form.studyPurpose ?? ""}
                onValueChange={value => update("studyPurpose", (value || undefined) as StudyPurpose | undefined)}
                options={[
                  { value: "masters-degree", label: "Completion of Master's Degree" },
                  { value: "bar-board-review", label: "Bar/Board Examination Review" },
                ]}
              />
              <fieldset className="rounded-lg border border-[#E4EBF2] bg-[#F8FAFC] p-4">
                <legend className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#52657A]">Other Purpose</legend>
                <div className="mt-2 space-y-3">
                  <CheckField id="purpose-monetization" checked={form.otherPurposes.includes("monetization")} label="Monetization of Leave Credits" onChange={checked => toggleOtherPurpose("monetization", checked)} />
                  <CheckField id="purpose-terminal" checked={form.otherPurposes.includes("terminal")} label="Terminal Leave" onChange={checked => toggleOtherPurpose("terminal", checked)} />
                </div>
              </fieldset>
            </div>
          </FormSection>

          <FormSection number="6.C-6.D" title="Working Days and Commutation">
            <div className="grid gap-4 md:grid-cols-2">
              <TextField label="Number of working days applied for" type="number" min="1" value={form.workingDays} required onChange={value => update("workingDays", value)} />
              <TextField label="Starting date" type="date" value={form.leaveStartDate} required onChange={value => update("leaveStartDate", value)} />
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#C8D7E7] bg-[#F3F7FB] p-3 text-sm text-[#335892]">
              <CalendarDays className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.08em]">Inclusive dates</p>
                <p className="mt-1 font-semibold">{inclusiveDateLabel}</p>
                <p className="mt-1 text-xs text-[#52657A]">Calculated using weekdays only; public holidays are not automatically excluded.</p>
              </div>
            </div>
            <fieldset className="mt-5">
              <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-[#52657A]">Commutation</legend>
              <RadioGroup value={form.commutation} onValueChange={value => update("commutation", value as Commutation)} className="flex gap-6">
                <RadioField value="not-requested" id="not-requested" label="Not requested" />
                <RadioField value="requested" id="requested" label="Requested" />
              </RadioGroup>
            </fieldset>
          </FormSection>

        </div>

        <aside className="sticky top-24 rounded-xl border border-[#D8E2EC] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E4EBF2] px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#122033]"><FileText className="size-4 text-[#4E72AA]" />Annex A output</div>
            <span className="rounded-full bg-[#EDF3F9] px-2 py-1 text-[10px] font-bold tracking-[0.1em] text-[#335892]">PDF</span>
          </div>
          <div className="m-5 border border-[#C8D2DD] bg-white p-4 font-serif text-[#172334] shadow-[0_3px_18px_rgba(24,39,58,0.07)]">
            <p className="text-right text-[9px] font-bold">ANNEX A</p>
            <div className="text-center"><p className="text-[10px] font-bold">Republic of the Philippines</p><p className="text-[10px] font-bold">Province of Iloilo</p><p className="text-[10px] font-bold">Municipality of Tigbauan</p><p className="mt-4 border-b pb-2 text-xs font-bold">APPLICATION FOR LEAVE</p></div>
            <PreviewRow label="1. OFFICE/AGENCY" value={officeName.toUpperCase()} secondLabel="2. NAME" secondValue={applicantName.toUpperCase()} />
            <PreviewRow label="3. DATE OF FILING" value={form.dateOfFiling} secondLabel="4. POSITION / 5. SALARY" secondValue={`${positionValue}  ${form.monthlySalary}`} />
            <div className="border-b py-2 text-[8px]"><p className="text-center font-bold">6. DETAILS OF APPLICATION</p><p className="mt-2 font-bold">6.A TYPE OF LEAVE / 6.B DETAILS OF LEAVE</p><p className="mt-1">{form.leaveTypes[0] ? "1 leave type selected" : "No leave type selected"}</p></div>
            <PreviewRow label="6.C WORKING DAYS" value={`${form.workingDays || "___"} Day(s) / ${inclusiveDateLabel}`} secondLabel="6.D COMMUTATION" secondValue={form.commutation === "requested" ? "Requested" : "Not Requested"} />
            <div className="py-3 text-center text-[9px] font-bold">7. DETAILS OF ACTION ON APPLICATION</div>
          </div>
          <div className="flex items-start gap-3 border-t border-[#E4EBF2] bg-[#F8FAFC] p-5 text-xs leading-5 text-[#52657A]">
            <Printer className="mt-0.5 size-4 shrink-0 text-[#4E72AA]" />
            <p>The PDF preserves the formal Annex A structure and is prepared for one-page folio printing.</p>
          </div>
        </aside>
      </div>
    </form>
  );
}

function FormSection({ number, title, children }: { number: string; title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[#D8E2EC] bg-white p-5 shadow-sm">
      <header className="mb-5 flex items-center gap-3 border-b border-[#E4EBF2] pb-4">
        <span className="rounded-md bg-[#EDF3F9] px-2.5 py-1 text-[11px] font-bold tracking-[0.1em] text-[#335892]">{number}</span>
        <h2 className="text-base font-semibold text-[#122033]">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function TextField({ label, value, onChange, required, type = "text", min, inputMode, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; min?: string; inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"]; placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-xs text-[#415367]">{label}{required && <span className="text-red-600">*</span>}</Label>
      <Input id={id} type={type} min={min} inputMode={inputMode} placeholder={placeholder} required={required} value={value} onChange={event => onChange(event.target.value)} className="h-10 border-[#CCD7E2] bg-white text-sm" />
    </div>
  );
}

function CheckField({ id, checked, label, detail, onChange }: { id: string; checked: boolean; label: string; detail?: string; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox id={id} checked={checked} onCheckedChange={value => onChange(Boolean(value))} className="mt-0.5" />
      <Label htmlFor={id} className="block cursor-pointer text-sm font-medium leading-5 text-[#122033]">
        {label}{detail && <span className="block text-xs font-normal text-[#63778C]">{detail}</span>}
      </Label>
    </div>
  );
}

function DetailChoice({ title, value, onValueChange, options, children }: {
  title: string; value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>; children?: ReactNode;
}) {
  return (
    <fieldset className="rounded-lg border border-[#E4EBF2] bg-[#F8FAFC] p-4">
      <legend className="px-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#52657A]">{title}</legend>
      <RadioGroup value={value} onValueChange={onValueChange} className="my-3 gap-3">
        {options.map(option => (
          <RadioField
            key={option.value}
            id={`detail-${option.value}`}
            value={option.value}
            label={option.label}
            selectedValue={value}
            onSelectedAgain={() => onValueChange("")}
          />
        ))}
      </RadioGroup>
      {children}
    </fieldset>
  );
}

function RadioField({
  value,
  id,
  label,
  selectedValue,
  onSelectedAgain,
}: {
  value: string;
  id: string;
  label: string;
  selectedValue?: string;
  onSelectedAgain?: () => void;
}) {
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (selectedValue === value) {
      event.preventDefault();
      event.stopPropagation();
      onSelectedAgain?.();
    }
  }

  return (
    <div className="flex items-center gap-2" onPointerDownCapture={handlePointerDown}>
      <RadioGroupItem value={value} id={id} />
      <Label htmlFor={id} className="cursor-pointer text-sm text-[#122033]">{label}</Label>
    </div>
  );
}

function PreviewRow({ label, value, secondLabel, secondValue }: { label: string; value: string; secondLabel: string; secondValue: string }) {
  return (
    <div className="grid grid-cols-2 border-b py-2 text-[8px]">
      <div className="pr-2"><p className="font-bold">{label}</p><p className="mt-1 truncate font-semibold">{value || "-"}</p></div>
      <div className="border-l pl-2"><p className="font-bold">{secondLabel}</p><p className="mt-1 truncate font-semibold">{secondValue || "-"}</p></div>
    </div>
  );
}
