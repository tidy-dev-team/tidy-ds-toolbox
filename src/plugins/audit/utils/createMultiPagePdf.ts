/**
 * Multi-page PDF creation utility
 * Uses pdf-lib to merge multiple PDF pages into one document
 */

import { PDFDocument } from "pdf-lib";

export async function createMultiPagePdf(
  pdfPagesData: Uint8Array[],
): Promise<void> {
  const mergedPdf = await PDFDocument.create();

  for (const pdfPageData of pdfPagesData) {
    const pdfDoc = await PDFDocument.load(pdfPageData);
    const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
    mergedPdf.addPage(copiedPage);
  }

  const mergedPdfBytes = await mergedPdf.save();

  const blob = new Blob([mergedPdfBytes], { type: "application/pdf" });
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(blob);
  downloadLink.download = "Audit result.pdf";

  downloadLink.click();
  URL.revokeObjectURL(downloadLink.href);
}

/**
 * Download a single PDF
 */
export function downloadPdf(
  pdfData: Uint8Array,
  filename = "report.pdf",
): void {
  const blob = new Blob([pdfData], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
