import type {PdfPageBuilder} from '@cj-tech-master/excelts/pdf';
import {DateTime} from 'luxon';

import type {TravelOrderItem} from '@/lib/forms/travel-order';
import {ErrorCodes, Failure, type Result, Success} from '@/lib/one-of';

const PAGE = {width: 612, height: 936};
const INK = {r: 0, g: 0, b: 0};
const WHITE = {r: 1, g: 1, b: 1};
const CHECKED_FILL = {r: 0, g: 0, b: 0};
const FONT = 'Arial';
const DEFAULT_APPROVING_OFFICIAL = {
  name: 'CAMILLE A. TERUEL',
  position: 'Executive Assistant IV',
};

export type TravelOrderLetterheadImage = {
  data: Uint8Array;
  format: 'png' | 'jpeg';
};

export type TravelOrderExportAssets = {
  header?: TravelOrderLetterheadImage;
  footer?: TravelOrderLetterheadImage;
  approvedBy?: {
    name?: string;
    position?: string;
  };
};

/**
 * Generates a printable Travel Order PDF.
 *
 * @description
 * Draws a folio-size travel order using fixed PDF coordinates. Optional header
 * and footer images are drawn from request-scoped upload bytes only; this
 * function does not persist image assets.
 *
 * @async
 * @function exportTravelOrderToPdfBuffer
 * @param {TravelOrderItem} item - Travel order data to print.
 * @param {TravelOrderExportAssets} assets - Optional transient header/footer images.
 * @returns {Promise<Result<Buffer>>} Generated PDF bytes, or failure.
 */
export async function exportTravelOrderToPdfBuffer(
  item: TravelOrderItem,
  assets: TravelOrderExportAssets,
): Promise<Result<Buffer>> {
  try {
    const {PdfDocumentBuilder} = await import('@cj-tech-master/excelts/pdf');
    const document = new PdfDocumentBuilder().disableFontAutoDiscovery().setMetadata({
      title: `Travel Order ${item.refNumber}`,
      author: 'Municipality of Tigbauan',
      subject: 'Travel Order',
      creator: 'Oasis-Next',
    });
    const page = document.addPage(PAGE);

    _drawLetterhead(page, assets);
    _drawTravelOrder(page, item, assets);

    return new Success(Buffer.from(await document.build()));
  } catch (e) {
    return new Failure(
      ErrorCodes.Fatal,
      'Unable to generate the travel order PDF.',
      {id: item.id},
      e,
    );
  }
}

function _drawLetterhead(page: PdfPageBuilder, assets: TravelOrderExportAssets): void {
  if (assets.header) {
    page.drawImage({
      data: assets.header.data,
      format: assets.header.format,
      x: 18,
      y: 786,
      width: 576,
      height: 132,
    });
  }

  if (assets.footer) {
    page.drawImage({
      data: assets.footer.data,
      format: assets.footer.format,
      x: 18,
      y: 0,
      width: 576,
      height: 72,
    });
  }
}

function _drawTravelOrder(
  page: PdfPageBuilder,
  item: TravelOrderItem,
  assets: TravelOrderExportAssets,
): void {
  _line(page, 492, 720, 570, 720);
  _center(page, 'T R A V E L   O R D E R', 306, 690, {size: 22, bold: true});

  _text(page, 'NAME OF EMPLOYEE :', 72, 638, {size: 12});
  _text(page, item.requestor.name.toUpperCase(), 222, 638, {size: 14, bold: true});
  _line(page, 220, 630, 570, 630, 0.55);
  _text(page, 'POSITION :', 72, 616, {size: 12});
  _text(page, item.requestor.officePosition.name, 222, 616, {size: 12});
  _line(page, 220, 608, 570, 608, 0.55);

  _drawTravelTable(page, item);

  _text(
    page,
    'The above person is hereby authorized to travel outside his/her official station on the day',
    99,
    388,
    {size: 12},
  );
  _text(page, 'indicated  and for the purpose/s stated herein.', 72, 370, {size: 12});

  _checkbox(page, 175, 317, item.subjectToClaims);
  _text(page, 'Subject to claims', 195, 318, {size: 11});
  _checkbox(page, 325, 317, !item.subjectToClaims);
  _text(page, 'Not Subject to Claims', 345, 318, {size: 11});

  _text(page, 'Issued  this', 102, 275, {size: 11});
  _text(page, _formatIssuedDate(item.date), 185, 275, {size: 11, bold: true});
  _line(page, 170, 267, 292, 267, 0.45);
  _text(page, 'at Tigbauan, Iloilo, Philippines.', 296, 275, {size: 11});

  _text(page, 'Recommending Approval:', 338, 210, {size: 12});
  _center(page, item.requestor.name.toUpperCase(), 420, 132, {size: 11, bold: true});

  const approvedByLabelY = assets.footer ? 148 : 118;
  const approvedByNameY = assets.footer ? 101 : 70;
  const approvedByPositionY = assets.footer ? 86 : 56;

  _text(page, 'Approved by:', 72, approvedByLabelY, {size: 11});
  const approvedName =
    assets.approvedBy?.name?.trim().toUpperCase() ||
    item.approvedBy?.name?.toUpperCase() ||
    DEFAULT_APPROVING_OFFICIAL.name;
  const approvedPosition =
    assets.approvedBy?.position?.trim() ||
    item.approvedBy?.position.name ||
    DEFAULT_APPROVING_OFFICIAL.position;
  _text(page, approvedName, 72, approvedByNameY, {size: 11, bold: true});
  _text(page, approvedPosition, 72, approvedByPositionY, {size: 10});
}

function _drawTravelTable(page: PdfPageBuilder, item: TravelOrderItem): void {
  const left = 70;
  const top = 585;
  const bottom = 430;
  const dateX = 70;
  const daysX = 178;
  const purposeX = 230;
  const placeX = 492;
  const right = 570;
  const headerBottom = 550;

  page.drawRect({
    x: left,
    y: bottom,
    width: right - left,
    height: top - bottom,
    stroke: INK,
    lineWidth: 0.65,
  });
  [daysX, purposeX, placeX].forEach((x) => _line(page, x, bottom, x, top));
  _line(page, left, headerBottom, right, headerBottom);

  _center(page, 'Date of Travel', (dateX + daysX) / 2, 563, {size: 10, bold: true});
  _center(page, 'No. of', (daysX + purposeX) / 2, 570, {size: 10, bold: true});
  _center(page, 'Days', (daysX + purposeX) / 2, 557, {size: 10, bold: true});
  _center(page, 'Purpose of Travel', (purposeX + placeX) / 2, 563, {size: 10, bold: true});
  _center(page, 'Place/Location', (placeX + right) / 2, 563, {size: 10, bold: true});

  _drawWrappedCentered(page, _formatTravelDate(item), (dateX + daysX) / 2, 496, 94, 10.5);
  _center(page, String(item.noOfDays), (daysX + purposeX) / 2, 488, {size: 12, bold: true});
  _center(page, item.purpose.toUpperCase(), (purposeX + placeX) / 2, 488, {size: 12});
  _drawWrappedCentered(page, item.location.toUpperCase(), (placeX + right) / 2, 496, 95, 11);
}

function _drawWrappedCentered(
  page: PdfPageBuilder,
  text: string,
  centerX: number,
  y: number,
  maxWidth: number,
  size: number,
): void {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (page.measureText(candidate, {fontSize: size, fontFamily: FONT}) <= maxWidth || !current) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  lines.forEach((line, index) => _center(page, line, centerX, y - index * 14, {size}));
}

function _checkbox(page: PdfPageBuilder, x: number, y: number, checked: boolean): void {
  page.drawRect({
    x,
    y,
    width: 12,
    height: 12,
    fill: checked ? CHECKED_FILL : undefined,
    stroke: INK,
    lineWidth: 1,
  });
  if (checked) {
    _line(page, x + 2.5, y + 6, x + 5.2, y + 3.2, 1.4, WHITE);
    _line(page, x + 5.2, y + 3.2, x + 10, y + 9.5, 1.4, WHITE);
  }
}

function _formatTravelDate(item: TravelOrderItem): string {
  const start = DateTime.fromISO(item.startDate).toFormat('MMMM d, yyyy');
  if (!item.endDate) return start;
  const end = DateTime.fromISO(item.endDate).toFormat('MMMM d, yyyy');
  return `${start} - ${end}`;
}

function _formatIssuedDate(value: string): string {
  return DateTime.fromISO(value).toFormat('MMMM d, yyyy');
}

function _text(
  page: PdfPageBuilder,
  value: string,
  x: number,
  y: number,
  options: {size?: number; bold?: boolean; italic?: boolean} = {},
): void {
  page.drawText(value, {
    x,
    y,
    fontSize: options.size ?? 10,
    fontFamily: FONT,
    bold: options.bold,
    italic: options.italic,
  });
}

function _center(
  page: PdfPageBuilder,
  value: string,
  x: number,
  y: number,
  options: {size?: number; bold?: boolean; italic?: boolean} = {},
): void {
  page.drawText(value, {
    x,
    y,
    fontSize: options.size ?? 10,
    fontFamily: FONT,
    bold: options.bold,
    italic: options.italic,
    anchor: 'middle',
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
