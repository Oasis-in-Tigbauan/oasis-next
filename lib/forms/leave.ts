import {readFile} from 'node:fs/promises';
import path from 'node:path';

import type {PdfPageBuilder} from '@cj-tech-master/excelts/pdf';
import {eq} from 'drizzle-orm';
import {DateTime} from 'luxon';

import type {User} from '@/lib/accounts';
import {db} from '@/lib/db';
import {leaveApplications} from '@/lib/db/schema';
import {calculateInclusiveLeaveDates, formatInclusiveLeaveDates} from '@/lib/forms/leave-dates';
import {ErrorCodes, Failure, type Result, Success} from '@/lib/one-of';
import {validatorUtilities} from '@/lib/validators';

export const LEAVE_TYPE_OPTIONS = [
  'vacation',
  'mandatory-forced',
  'sick',
  'maternity',
  'paternity',
  'special-privilege',
  'solo-parent',
  'study',
  'vawc',
  'rehabilitation-privilege',
  'special-women',
  'special-emergency',
  'adoption',
  'other',
] as const;

export const OTHER_PURPOSE_OPTIONS = ['monetization', 'terminal'] as const;
export const COMMUTATION_OPTIONS = ['not-requested', 'requested'] as const;
export const VACATION_LOCATION_OPTIONS = ['within-philippines', 'abroad'] as const;
export const SICK_LOCATION_OPTIONS = ['in-hospital', 'out-patient'] as const;
export const STUDY_PURPOSE_OPTIONS = ['masters-degree', 'bar-board-review'] as const;

export type LeaveType = (typeof LEAVE_TYPE_OPTIONS)[number];
export type OtherPurpose = (typeof OTHER_PURPOSE_OPTIONS)[number];
export type Commutation = (typeof COMMUTATION_OPTIONS)[number];
export type VacationLocation = (typeof VACATION_LOCATION_OPTIONS)[number];
export type SickLocation = (typeof SICK_LOCATION_OPTIONS)[number];
export type StudyPurpose = (typeof STUDY_PURPOSE_OPTIONS)[number];

export type LeaveApplicationExportPayload = {
  lastName: string;
  firstName: string;
  middleName?: string;
  dateOfFiling: string;
  position: string;
  monthlySalary: string;
  leaveTypes: LeaveType[];
  otherLeaveDescription?: string;
  vacationLocation?: VacationLocation;
  vacationLocationDetails?: string;
  sickLocation?: SickLocation;
  illnessDetails?: string;
  studyPurpose?: StudyPurpose;
  otherPurposes: OtherPurpose[];
  workingDays: string;
  leaveStartDate: string;
  commutation: Commutation;
  approvedBy?: string;
  approvedByPosition?: string;
};

export type LeaveApplicationItem = LeaveApplicationExportPayload & {
  id: string;
  refNumber: number;
  date: string;
  inclusiveDates: string;
  requestor: {
    id: string;
    name: string;
    office: {
      id: string;
      name: string;
    };
    officePosition: {
      id: string;
      name: string;
    };
  };
};

const INK = {r: 0, g: 0, b: 0};
const CHECKED_FILL = {r: 0.48, g: 0.48, b: 0.48};
const WHITE = {r: 1, g: 1, b: 1};
const SERIF = 'Times New Roman';
const SANS = 'Arial';
const PAGE = {width: 612, height: 936};
const FRAME = {
  left: 18,
  right: 594,
  center: 361,
  top: 842,
  applicantNameBottom: 804,
  applicantInfoBottom: 758,
  detailsHeadingBottom: 742,
  detailsBottom: 467,
  requestBottom: 358,
  actionHeadingBottom: 341,
  actionReviewBottom: 179,
  bottom: 18,
};

const LEAVE_PRINT_OPTIONS: Array<{key: Exclude<LeaveType, 'other'>; text: string}> = [
  {key: 'vacation', text: 'Vacation Leave (Sec. 51, Rule XVI, Omnibus Rules Implementing EO 292)'},
  {
    key: 'mandatory-forced',
    text: 'Mandatory Forced Leave (Sec. 25, Rule XVI, Omnibus Rules Implementing EO 292)',
  },
  {key: 'sick', text: 'Sick Leave (Sec. 43, Rule XVI, Omnibus Rules Implementing EO 292)'},
  {key: 'maternity', text: 'Maternity Leave (RA 11210/IRR issued by CSC, DOLE and SSS)'},
  {key: 'paternity', text: 'Paternity Leave (RA 8187/CSC MC 71, s. 1998, as amended)'},
  {
    key: 'special-privilege',
    text: 'Special Privilege Leave (Sec. 21, Rule XVI, Omnibus Rules Implementing EO 292)',
  },
  {key: 'solo-parent', text: 'Solo Parent Leave (RA 8972/CSC MC No. 8, s. 2004)'},
  {key: 'study', text: 'Study Leave (Sec. 68 Rule XVI, Omnibus Rules Implementing EO 292)'},
  {key: 'vawc', text: '10 Day VAWC Leave (RA 9262/CSC MC. No. 15, s. 2005)'},
  {
    key: 'rehabilitation-privilege',
    text: 'Rehabilitation Privilege (Sec. 55, Rule XVI, Omnibus Rules Implementing EO 292)',
  },
  {key: 'special-women', text: 'Special Leave benefits for Women (RA 9710/CSC MC No. 25, s. 2010)'},
  {
    key: 'special-emergency',
    text: 'Special Emergency (Calamity) Leave (CSC MC No. 2, s. 2012, as amended)',
  },
  {key: 'adoption', text: 'Adoption Leave (RA No. 8552)'},
];

type TextOptions = {
  fontSize?: number;
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  anchor?: 'start' | 'middle' | 'end';
};

type LeaveApplicationRow = typeof leaveApplications.$inferSelect;

function _mapLeaveApplication(row: LeaveApplicationRow): LeaveApplicationItem {
  const payload = _rowToPayload(row);
  const range = calculateInclusiveLeaveDates(payload.leaveStartDate, payload.workingDays);

  return {
    ...payload,
    id: row.id,
    refNumber: row.refNumber,
    date: DateTime.fromJSDate(row.createdAt, {zone: 'UTC'}).setZone('Asia/Manila').toISO()!,
    inclusiveDates: formatInclusiveLeaveDates(range),
    requestor: {
      id: row.requestorId,
      name: `${row.firstName} ${row.middleName ?? ''} ${row.lastName}`.replace(/\s+/g, ' ').trim(),
      office: {
        id: row.requestorOfficeId,
        name: '',
      },
      officePosition: {
        id: row.requestorPositionId,
        name: row.position,
      },
    },
  };
}

function _rowToPayload(row: LeaveApplicationRow): LeaveApplicationExportPayload {
  return {
    lastName: row.lastName,
    firstName: row.firstName,
    middleName: row.middleName ?? undefined,
    dateOfFiling: row.dateOfFiling,
    position: row.position,
    monthlySalary: row.monthlySalary,
    leaveTypes: row.leaveTypes as LeaveType[],
    otherLeaveDescription: row.otherLeaveDescription ?? undefined,
    vacationLocation: row.vacationLocation as VacationLocation | undefined,
    vacationLocationDetails: row.vacationLocationDetails ?? undefined,
    sickLocation: row.sickLocation as SickLocation | undefined,
    illnessDetails: row.illnessDetails ?? undefined,
    studyPurpose: row.studyPurpose as StudyPurpose | undefined,
    otherPurposes: row.otherPurposes as OtherPurpose[],
    workingDays: row.workingDays,
    leaveStartDate: row.leaveStartDate,
    commutation: row.commutation,
    approvedBy: row.approvedBy ?? undefined,
    approvedByPosition: row.approvedByPosition ?? undefined,
  };
}

/**
 * Validates cross-field leave application rules after shape validation.
 *
 * @description
 * Checks that option arrays contain supported values, exactly one leave type is selected,
 * dependent descriptions are present when required, dates are parseable, and inclusive
 * leave dates can be calculated.
 *
 * @function validateLeaveApplicationRules
 * @param {LeaveApplicationExportPayload} body - Leave application payload to validate.
 * @returns {string | null} A validation issue string, or null when the payload is valid.
 */
export function validateLeaveApplicationRules(body: LeaveApplicationExportPayload): string | null {
  if (
    body.leaveTypes.length !== 1 ||
    body.leaveTypes.some((type) => !LEAVE_TYPE_OPTIONS.includes(type))
  ) {
    return 'Choose exactly one valid type of leave.';
  }

  if (body.otherPurposes.some((purpose) => !OTHER_PURPOSE_OPTIONS.includes(purpose))) {
    return 'Invalid other purpose selection.';
  }

  if (body.leaveTypes.includes('other') && !body.otherLeaveDescription?.trim()) {
    return 'Specify the other type of leave.';
  }

  if (body.vacationLocation && !VACATION_LOCATION_OPTIONS.includes(body.vacationLocation)) {
    return 'Invalid vacation or special privilege leave location.';
  }

  if (body.sickLocation && !SICK_LOCATION_OPTIONS.includes(body.sickLocation)) {
    return 'Invalid sick leave location.';
  }

  if (body.studyPurpose && !STUDY_PURPOSE_OPTIONS.includes(body.studyPurpose)) {
    return 'Invalid study leave purpose.';
  }

  if (!COMMUTATION_OPTIONS.includes(body.commutation)) {
    return 'Invalid commutation selection.';
  }

  if (!calculateInclusiveLeaveDates(body.leaveStartDate, body.workingDays)) {
    return 'Choose a weekday start date and a whole number of working days greater than zero.';
  }

  if (!DateTime.fromISO(body.dateOfFiling).isValid) {
    return 'Date of filing must be valid.';
  }

  return null;
}

/**
 * Fetches all saved leave applications.
 *
 * @description
 * Reads persisted leave application data used by the management table and maps each
 * row back to the same typed payload used for PDF export.
 *
 * @async
 * @function getAllLeaveApplications
 * @returns {Promise<Result<LeaveApplicationItem[]>>} Saved leave applications on success, or a failure result.
 */
export async function getAllLeaveApplications(): Promise<Result<LeaveApplicationItem[]>> {
  try {
    const rows = await db.select().from(leaveApplications).orderBy(leaveApplications.refNumber);

    return new Success(rows.map(_mapLeaveApplication));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Failed to retrieve leave applications.', {}, e);
  }
}

/**
 * Fetches one saved leave application by ID.
 *
 * @description
 * Returns a not-found failure when the supplied ID does not match a persisted
 * leave application.
 *
 * @async
 * @function getLeaveApplicationById
 * @param {string} id - Leave application UUID.
 * @returns {Promise<Result<LeaveApplicationItem>>} Leave application on success, or a failure result.
 */
export async function getLeaveApplicationById(id: string): Promise<Result<LeaveApplicationItem>> {
  try {
    const row = await _fetchLeaveApplicationById(id);
    if (!row) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Leave application not found.', {id});
    }

    return new Success(_mapLeaveApplication(row));
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Failed to retrieve leave application.', {id}, e);
  }
}

/**
 * Creates a saved leave application.
 *
 * @description
 * Validates form rules, snapshots the requestor office and position, and persists
 * the same data used by the printable leave PDF.
 *
 * @async
 * @function createLeaveApplication
 * @param {LeaveApplicationExportPayload} payload - Leave application fields.
 * @param {User} user - Authenticated user creating the record.
 * @returns {Promise<Result<LeaveApplicationItem>>} Created leave application on success, or a failure result.
 */
export async function createLeaveApplication(
  payload: LeaveApplicationExportPayload,
  user: User,
): Promise<Result<LeaveApplicationItem>> {
  try {
    const issue = validateLeaveApplicationRules(payload);
    if (issue) {
      return new Failure(ErrorCodes.ValidationFailure, issue, {payload});
    }

    if (
      !validatorUtilities.isExisty(user.office.id) ||
      !validatorUtilities.isExisty(user.office.role.id)
    ) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        'Requestor must be assigned to an office and position.',
        {userId: user.id},
      );
    }

    const values = {
      ..._payloadToValues(payload),
      requestorId: user.id,
      requestorOfficeId: user.office.id,
      requestorPositionId: user.office.role.id,
    } as typeof leaveApplications.$inferInsert;

    const [inserted] = await db
      .insert(leaveApplications)
      .values(values)
      .returning({id: leaveApplications.id});

    if (!inserted) {
      return new Failure(ErrorCodes.Fatal, 'Failed to insert leave application.', {payload});
    }

    const row = await _fetchLeaveApplicationById(inserted.id);
    if (!row) {
      return new Failure(
        ErrorCodes.ResourceNotFound,
        'Leave application not found after creation.',
        {id: inserted.id},
      );
    }

    return new Success(_mapLeaveApplication(row));
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Failed to create leave application.',
      {payload, userId: user.id},
      e,
    );
  }
}

/**
 * Updates a saved leave application by ID.
 *
 * @description
 * Merges the partial payload onto the existing row, validates the resulting data,
 * and persists only supplied fields. Requestor ownership fields are not editable.
 *
 * @async
 * @function updateLeaveApplication
 * @param {string} id - Leave application UUID.
 * @param {Partial<LeaveApplicationExportPayload>} payload - Fields to update.
 * @param {User} user - Authenticated user performing the update.
 * @returns {Promise<Result<LeaveApplicationItem>>} Updated leave application on success, or a failure result.
 */
export async function updateLeaveApplication(
  id: string,
  payload: Partial<LeaveApplicationExportPayload>,
  user: User,
): Promise<Result<LeaveApplicationItem>> {
  try {
    const existing = await _fetchLeaveApplicationById(id);
    if (!existing) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Leave application not found.', {id});
    }

    const merged: LeaveApplicationExportPayload = {
      ..._rowToPayload(existing),
      ...payload,
    };
    const issue = validateLeaveApplicationRules(merged);
    if (issue) {
      return new Failure(ErrorCodes.ValidationFailure, issue, {id, payload});
    }

    await db
      .update(leaveApplications)
      .set(_payloadToValues(merged))
      .where(eq(leaveApplications.id, id));

    const updated = await _fetchLeaveApplicationById(id);
    if (!updated) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Leave application not found after update.', {
        id,
      });
    }

    return new Success(_mapLeaveApplication(updated));
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Failed to update leave application.',
      {id, payload, userId: user.id},
      e,
    );
  }
}

/**
 * Deletes a saved leave application by ID.
 *
 * @description
 * Permanently removes a leave application. Returns a not-found failure when no
 * matching row exists.
 *
 * @async
 * @function deleteLeaveApplication
 * @param {string} id - Leave application UUID.
 * @returns {Promise<Result<null>>} Null on success, or a failure result.
 */
export async function deleteLeaveApplication(id: string): Promise<Result<null>> {
  try {
    const [deleted] = await db
      .delete(leaveApplications)
      .where(eq(leaveApplications.id, id))
      .returning({id: leaveApplications.id});

    if (!deleted) {
      return new Failure(ErrorCodes.ResourceNotFound, 'Leave application not found.', {id});
    }

    return new Success(null);
  } catch (e) {
    return new Failure(ErrorCodes.Fatal, 'Failed to delete leave application.', {id}, e);
  }
}

function _payloadToValues(
  payload: LeaveApplicationExportPayload,
): Partial<typeof leaveApplications.$inferInsert> {
  return {
    lastName: payload.lastName,
    firstName: payload.firstName,
    middleName: payload.middleName || null,
    dateOfFiling: payload.dateOfFiling,
    position: payload.position,
    monthlySalary: payload.monthlySalary,
    leaveTypes: payload.leaveTypes,
    otherLeaveDescription: payload.otherLeaveDescription || null,
    vacationLocation: payload.vacationLocation || null,
    vacationLocationDetails: payload.vacationLocationDetails || null,
    sickLocation: payload.sickLocation || null,
    illnessDetails: payload.illnessDetails || null,
    studyPurpose: payload.studyPurpose || null,
    otherPurposes: payload.otherPurposes,
    workingDays: payload.workingDays,
    leaveStartDate: payload.leaveStartDate,
    commutation: payload.commutation,
    approvedBy: payload.approvedBy || null,
    approvedByPosition: payload.approvedByPosition || null,
  };
}

async function _fetchLeaveApplicationById(id: string): Promise<LeaveApplicationRow | null> {
  const [row] = await db
    .select()
    .from(leaveApplications)
    .where(eq(leaveApplications.id, id))
    .limit(1);

  return row ?? null;
}

/**
 * Generates a printable Annex A Application for Leave PDF.
 *
 * @description
 * Draws the official folio-page form at fixed PDF coordinates. This keeps the
 * printed layout, lines, and checkbox geometry stable while deriving inclusive
 * dates from the requested weekday-only leave range.
 *
 * @async
 * @function exportLeaveApplicationToPdfBuffer
 * @param {LeaveApplicationExportPayload} payload - Validated applicant input.
 * @param {string} officeName - Authenticated user's office displayed on the form.
 * @returns {Promise<Result<Buffer>>} Generated PDF bytes, or a fatal failure.
 * @remarks The PDF is export-only; section 7 is printed for manual processing.
 */
export async function exportLeaveApplicationToPdfBuffer(
  payload: LeaveApplicationExportPayload,
  officeName: string,
): Promise<Result<Buffer>> {
  try {
    const range = calculateInclusiveLeaveDates(payload.leaveStartDate, payload.workingDays);
    if (!range) {
      return new Failure(
        ErrorCodes.ValidationFailure,
        'Unable to calculate inclusive leave dates.',
      );
    }

    const {PdfDocumentBuilder} = await import('@cj-tech-master/excelts/pdf');
    const document = new PdfDocumentBuilder().disableFontAutoDiscovery().setMetadata({
      title: 'Application for Leave',
      author: 'Municipality of Tigbauan',
      subject: 'Annex A Application for Leave',
      creator: 'Oasis-Next',
    });
    const page = document.addPage(PAGE);

    await _drawHeader(page);
    _drawFrame(page);
    _drawApplicantDetails(page, payload, officeName);
    _drawLeaveDetails(page, payload);
    _drawRequestDetails(page, payload, formatInclusiveLeaveDates(range));
    _drawActionDetails(page);

    return new Success(Buffer.from(await document.build()));
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to generate the leave application PDF.',
      {officeName},
      e,
    );
  }
}

async function _drawHeader(page: PdfPageBuilder): Promise<void> {
  const seal = await readFile(path.join(process.cwd(), 'public', 'assets', 'tigbauan-seal.png'));
  page.drawImage({data: seal, format: 'png', x: 130, y: 879, width: 44, height: 44});
  _center(page, 'Republic of the Philippines', 306, 914, {fontSize: 11, bold: true});
  _center(page, 'Province of Iloilo', 306, 901, {fontSize: 11, bold: true});
  _center(page, 'Municipality of Tigbauan', 306, 888, {fontSize: 11, bold: true});
  _text(page, 'ANNEX A', 515, 916, {fontSize: 8, bold: true});
  page.drawRect({x: 507, y: 883, width: 43, height: 25, stroke: INK, lineWidth: 0.65});
  _center(page, 'APPLICATION FOR LEAVE', 306, 850, {fontSize: 14, bold: true});
}

function _drawFrame(page: PdfPageBuilder): void {
  const {
    left,
    right,
    center,
    top,
    applicantNameBottom,
    applicantInfoBottom,
    detailsHeadingBottom,
    detailsBottom,
    requestBottom,
    actionHeadingBottom,
    actionReviewBottom,
    bottom,
  } = FRAME;
  page.drawRect({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    stroke: INK,
    lineWidth: 0.65,
  });
  [
    applicantNameBottom,
    applicantInfoBottom,
    detailsHeadingBottom,
    detailsBottom,
    requestBottom,
    actionHeadingBottom,
    actionReviewBottom,
  ].forEach((y) => _line(page, left, y, right, y));
  _line(page, center, detailsHeadingBottom, center, requestBottom);
  _line(page, center, actionHeadingBottom, center, actionReviewBottom);
}

function _drawApplicantDetails(
  page: PdfPageBuilder,
  payload: LeaveApplicationExportPayload,
  officeName: string,
): void {
  _label(page, '1. OFFICE/AGENCY', 27, 831);
  _label(page, '2. NAME', 150, 831);
  _text(page, '(Last)', 215, 831, {fontSize: 9, fontFamily: SERIF});
  _text(page, '(First)', 344, 831, {fontSize: 9, fontFamily: SERIF});
  _text(page, '(Middle)', 479, 831, {fontSize: 9, fontFamily: SERIF});
  _center(page, officeName.toUpperCase(), 86, 812, {fontSize: 10, bold: true});
  _center(page, payload.lastName.toUpperCase(), 247, 812, {fontSize: 10, bold: true});
  _center(page, payload.firstName.toUpperCase(), 376, 812, {fontSize: 10, bold: true});
  _center(page, (payload.middleName ?? '').toUpperCase(), 515, 812, {fontSize: 10, bold: true});

  _label(page, '3. DATE OF FILING', 27, 790);
  _label(page, '4. POSITION', 150, 790);
  _label(page, '5. SALARY (Monthly)', 426, 790);
  _center(page, _date(payload.dateOfFiling), 88, 768, {fontSize: 10, bold: true});
  _text(page, payload.position, 150, 773, {fontSize: 10, bold: true});
  _drawSalary(page, payload.monthlySalary, 492, 769);
}

function _drawLeaveDetails(page: PdfPageBuilder, payload: LeaveApplicationExportPayload): void {
  _center(page, '6. DETAILS OF APPLICATION', 306, 747, {fontSize: 9, bold: true});
  _label(page, '6.A. TYPE OF LEAVE TO BE AVAILED OF:', 28, 730);
  _label(page, '6.B. DETAILS OF LEAVE', 378, 730);

  LEAVE_PRINT_OPTIONS.forEach((option, index) => {
    _choice(
      page,
      35,
      711 - index * 13.2,
      payload.leaveTypes.includes(option.key),
      option.text,
      7.3,
    );
  });
  _text(page, 'Others:', 28, 520, {fontSize: 8, fontFamily: SANS});
  _choice(
    page,
    35,
    500,
    payload.leaveTypes.includes('other'),
    (payload.otherLeaveDescription ?? '').toUpperCase(),
    8,
  );
  _line(page, 54, 493, 342, 493, 0.55);

  _text(page, 'In case of Vacation/Special Privilege Leave:', 378, 710, {
    fontSize: 8,
    fontFamily: SANS,
    italic: true,
  });
  _choice(
    page,
    383,
    692,
    payload.vacationLocation === 'within-philippines',
    'Within Philippines',
    8,
  );
  _choice(page, 383, 677, payload.vacationLocation === 'abroad', 'Abroad (Specify)', 8);
  if (payload.vacationLocationDetails) {
    _text(
      page,
      payload.vacationLocationDetails,
      484,
      payload.vacationLocation === 'abroad' ? 677 : 692,
      {fontSize: 8, fontFamily: SANS},
    );
  } else {
    _line(page, 480, 674, 550, 674, 0.55);
  }
  _text(page, 'In case of Sick Leave:', 378, 655, {fontSize: 8, fontFamily: SANS, italic: true});
  _choice(
    page,
    383,
    637,
    payload.sickLocation === 'in-hospital',
    'In Hospital (Specify illness)',
    8,
  );
  _choice(
    page,
    383,
    622,
    payload.sickLocation === 'out-patient',
    'Out-Patient (Specify illness)',
    8,
  );
  if (payload.illnessDetails) {
    _text(page, payload.illnessDetails, 475, 605, {fontSize: 8, fontFamily: SANS});
  }
  _line(page, 436, 604, 550, 604, 0.55);
  _line(page, 436, 589, 550, 589, 0.55);
  _text(page, 'In case of Study Leave:', 378, 570, {fontSize: 8, fontFamily: SANS, italic: true});
  _choice(
    page,
    383,
    552,
    payload.studyPurpose === 'masters-degree',
    "Completion of Master's Degree",
    8,
  );
  _choice(
    page,
    383,
    537,
    payload.studyPurpose === 'bar-board-review',
    'Bar/Board Examination Review',
    8,
  );
  _text(page, 'Other Purpose:', 378, 520, {fontSize: 8, fontFamily: SANS, italic: true});
  _choice(
    page,
    383,
    503,
    payload.otherPurposes.includes('monetization'),
    'Monetization of Leave Credits',
    8,
  );
  _choice(page, 383, 488, payload.otherPurposes.includes('terminal'), 'Terminal Leave', 8);
}

function _drawRequestDetails(
  page: PdfPageBuilder,
  payload: LeaveApplicationExportPayload,
  inclusiveDates: string,
): void {
  _label(page, '6.C. NUMBER OF WORKING DAYS APPLIED FOR:', 28, 454);
  _label(page, '6.D. COMMUTATION', 378, 454);
  _text(page, `${payload.workingDays} Day${payload.workingDays === '1' ? '' : 's'}`, 55, 429, {
    fontSize: 10,
    bold: true,
  });
  _line(page, 54, 423, 342, 423, 0.55);
  _text(page, 'INCLUSIVE DATES:', 55, 402, {fontSize: 8, bold: true});
  _text(page, inclusiveDates, 140, 402, {fontSize: 9, bold: true});
  _line(page, 139, 397, 342, 397, 0.55);
  _blankChoice(page, 375, 429, payload.commutation === 'not-requested', 'Not Requested');
  _blankChoice(page, 375, 414, payload.commutation === 'requested', 'Requested');
  _line(page, 395, 384, 531, 384, 0.6);
  _center(page, 'Signature of Applicant', 463, 371, {fontSize: 8, fontFamily: SANS});
}

function _drawActionDetails(page: PdfPageBuilder): void {
  _center(page, '7. DETAILS OF ACTION ON APPLICATION', 306, 346, {fontSize: 9, bold: true});
  _label(page, '7.A. CERTIFICATE OF LEAVE CREDITS', 28, 327);
  _label(page, '7.B. RECOMMENDATION', 378, 327);
  _text(page, 'As of', 55, 310, {fontSize: 8, fontFamily: SANS});
  _line(page, 78, 308, 162, 308, 0.55);
  _drawCreditsTable(page);
  _blankChoice(page, 375, 291, false, 'For approval');
  _blankChoice(page, 375, 274, false, 'For disapproval due to');
  _line(page, 496, 273, 550, 273, 0.55);
  _line(page, 400, 255, 550, 255, 0.55);

  _line(page, 120, 211, 254, 211, 0.55);
  _center(page, 'JEANLYN T. TORRICO', 187, 198, {fontSize: 10, bold: true});
  _center(page, 'HRMO', 187, 184, {fontSize: 8, fontFamily: SANS});
  _line(page, 389, 211, 535, 211, 0.55);
  _center(page, 'MYRA GENE GAUTIER', 462, 198, {fontSize: 10, bold: true});
  _center(page, 'MUNICIPAL BUDGET OFFICER', 462, 184, {fontSize: 8, fontFamily: SANS});

  _label(page, '7.C. APPROVED FOR:', 28, 163);
  _label(page, '7.D. DISAPPROVED DUE TO:', 378, 163);
  _lineWithSuffix(page, 54, 145, 120, 'days with pay');
  _lineWithSuffix(page, 54, 129, 120, 'days without pay');
  _lineWithSuffix(page, 54, 113, 120, 'others (Specify)');
  [145, 129, 113].forEach((y) => _line(page, 398, y, 550, y, 0.55));
  _line(page, 213, 68, 399, 68, 0.55);
  _center(page, 'CAMILLE A. TERUEL', 306, 55, {fontSize: 10, bold: true});
  _center(page, 'Executive Assistant IV', 306, 41, {fontSize: 8, fontFamily: SANS});
  _center(page, '(Authorized Official)', 306, 27, {fontSize: 8, fontFamily: SANS});
}

function _drawCreditsTable(page: PdfPageBuilder): void {
  const left = 54;
  const col1 = 151;
  const col2 = 253;
  const right = 349;
  const top = 302;
  const rows = [287, 272, 257, 242];
  page.drawRect({
    x: left,
    y: 242,
    width: right - left,
    height: top - 242,
    stroke: INK,
    lineWidth: 0.55,
  });
  _line(page, col1, 242, col1, top, 0.55);
  _line(page, col2, 242, col2, top, 0.55);
  rows.forEach((y) => _line(page, left, y, right, y, 0.55));
  _center(page, 'Vacation Leave', (col1 + col2) / 2, 291, {fontSize: 8, bold: true});
  _center(page, 'Sick Leave', (col2 + right) / 2, 291, {fontSize: 8, bold: true});
  _center(page, 'Total Earned', (left + col1) / 2, 276, {fontSize: 8});
  _center(page, 'Less this application', (left + col1) / 2, 261, {fontSize: 8});
  _center(page, 'Balance', (left + col1) / 2, 246, {fontSize: 8, bold: true});
}

function _choice(
  page: PdfPageBuilder,
  x: number,
  y: number,
  checked: boolean,
  label: string,
  fontSize: number,
): void {
  _checkbox(page, x, y - 2, checked);
  _text(page, label, x + 20, y, {fontSize, fontFamily: SANS});
}

function _blankChoice(
  page: PdfPageBuilder,
  x: number,
  y: number,
  checked: boolean,
  label: string,
): void {
  _line(page, x, y - 2, x + 23, y - 2, 0.55);
  if (checked) {
    _line(page, x + 7, y + 1, x + 11, y - 3, 0.9);
    _line(page, x + 11, y - 3, x + 17, y + 4, 0.9);
  }
  _text(page, label, x + 28, y, {fontSize: 8, fontFamily: SANS});
}

function _checkbox(page: PdfPageBuilder, x: number, y: number, checked: boolean): void {
  const size = 10;
  page.drawRect({
    x,
    y,
    width: size,
    height: size,
    fill: checked ? CHECKED_FILL : undefined,
    stroke: checked ? CHECKED_FILL : INK,
    lineWidth: 0.8,
  });
  if (checked) {
    _line(page, x + 2, y + 5, x + 4.2, y + 2.7, 1.05, WHITE);
    _line(page, x + 4.2, y + 2.7, x + 8.3, y + 7.7, 1.05, WHITE);
  }
}

function _drawSalary(page: PdfPageBuilder, value: string, centerX: number, y: number): void {
  const amount = _salaryAmount(value);
  const amountWidth = page.measureText(amount, {fontSize: 10, fontFamily: SERIF, bold: true});
  const start = centerX - (amountWidth + 9) / 2;
  _pesoMark(page, start, y - 1);
  _text(page, amount, start + 9, y, {fontSize: 10, bold: true});
}

function _pesoMark(page: PdfPageBuilder, x: number, y: number): void {
  _text(page, 'P', x, y, {fontSize: 10, bold: true});
  _line(page, x - 0.4, y + 5.2, x + 7, y + 5.2, 0.65);
  _line(page, x - 0.4, y + 3.5, x + 7, y + 3.5, 0.65);
}

function _lineWithSuffix(
  page: PdfPageBuilder,
  x1: number,
  y: number,
  x2: number,
  suffix: string,
): void {
  _line(page, x1, y, x2, y, 0.55);
  _text(page, suffix, x2 + 4, y - 1, {fontSize: 8, fontFamily: SANS});
}

function _label(page: PdfPageBuilder, value: string, x: number, y: number): void {
  _text(page, value, x, y, {fontSize: 9, bold: true});
}

function _center(
  page: PdfPageBuilder,
  value: string,
  x: number,
  y: number,
  options: TextOptions = {},
): void {
  _text(page, value, x, y, {...options, anchor: 'middle'});
}

function _text(
  page: PdfPageBuilder,
  value: string,
  x: number,
  y: number,
  options: TextOptions = {},
): void {
  page.drawText(value, {
    x,
    y,
    fontSize: options.fontSize ?? 8,
    fontFamily: options.fontFamily ?? SERIF,
    bold: options.bold,
    italic: options.italic,
    anchor: options.anchor,
  });
}

function _line(
  page: PdfPageBuilder,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth = 0.65,
  color = INK,
): void {
  page.drawLine({x1, y1, x2, y2, color, lineWidth});
}

function _date(value: string): string {
  return DateTime.fromISO(value).toFormat('M/d/yyyy');
}

function _salaryAmount(value: string): string {
  const salary = Number.parseFloat(value);
  return Number.isFinite(salary)
    ? salary.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2})
    : '';
}
