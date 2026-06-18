type ExcelWorksheetLike = {
  pageSetup?: unknown;
  views?: unknown[];
};

type ExcelPrintLayoutOptions = {
  printArea: string;
  orientation?: "portrait" | "landscape";
  fitToHeight?: number;
};

const LEGAL_PAPER_SIZE = 5;

/**
 * Applies workbook print settings so Excel export preview matches the printed page layout.
 */
export function applyReadyToPrintLayout(
  worksheet: ExcelWorksheetLike,
  { printArea, orientation = "portrait", fitToHeight = 0 }: ExcelPrintLayoutOptions,
): void {
  worksheet.pageSetup = {
    paperSize: LEGAL_PAPER_SIZE,
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight,
    horizontalCentered: true,
    verticalCentered: false,
    printArea,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.35,
      bottom: 0.35,
      header: 0.1,
      footer: 0.1,
    },
  };

  worksheet.views = [{
    showGridLines: false,
    style: "pageBreakPreview",
  }];
}
