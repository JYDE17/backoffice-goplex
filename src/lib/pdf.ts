import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Client-only: builds a real PDF (selectable text, small file size) and opens
// it in a new tab with the print dialog already triggered - the user prints
// (or saves as PDF from the dialog) without a download landing in the
// Downloads folder. Mirrors the downloadCsv helper's signature where possible
// so report pages can reuse the same headers/rows they already compute for
// CSV export.

export type PdfSection =
  | {
      type: "table";
      heading?: string;
      headers: string[];
      rows: (string | number)[][];
      rightAlign?: number[];
    }
  | { type: "keyvalue"; heading?: string; pairs: [string, string][] };

const MARGIN = 40;
const ACCENT: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [113, 113, 122];
const INK: [number, number, number] = [24, 24, 27];

function header(doc: jsPDF, title: string, subtitle: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...INK);
  doc.text("BackOffice", MARGIN, 44);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Goplex Brossard - Karting", MARGIN, 58);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...INK);
  doc.text(title, MARGIN, 86);
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, MARGIN, 100);
  }

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.5);
  doc.line(MARGIN, 110, doc.internal.pageSize.getWidth() - MARGIN, 110);

  return 130;
}

function footer(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `Genere le ${new Date().toLocaleString("fr-CA")} - page ${i}/${pageCount}`,
      MARGIN,
      pageHeight - 20,
    );
    doc.text("BackOffice - Jeremy Dionne", pageWidth - MARGIN, pageHeight - 20, { align: "right" });
  }
}

export function printPdf(
  filename: string,
  title: string,
  subtitle: string,
  sections: PdfSection[],
) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = header(doc, title, subtitle);
  const pageWidth = doc.internal.pageSize.getWidth();

  for (const section of sections) {
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      y = 50;
    }

    if (section.heading) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(section.heading, MARGIN, y);
      y += 16;
    }

    if (section.type === "keyvalue") {
      doc.setFontSize(9.5);
      for (const [label, value] of section.pairs) {
        if (y > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          y = 50;
        }
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...MUTED);
        doc.text(label, MARGIN, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...INK);
        doc.text(value, pageWidth - MARGIN, y, { align: "right" });
        y += 15;
      }
      y += 10;
    } else {
      const columnStyles: Record<number, { halign: "right" }> = {};
      for (const i of section.rightAlign ?? []) columnStyles[i] = { halign: "right" };

      autoTable(doc, {
        startY: y,
        head: [section.headers],
        body: section.rows,
        margin: { left: MARGIN, right: MARGIN },
        styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK },
        headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 247, 249] },
        columnStyles,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 24;
    }
  }

  footer(doc);

  // Open in a new tab with the print dialog pre-triggered instead of
  // downloading. The filename becomes the document title, so "save as PDF"
  // from the print dialog still suggests a sensible name.
  doc.setProperties({ title: filename.replace(/\.pdf$/, "") });
  doc.autoPrint();
  const url = doc.output("bloburl");
  window.open(url, "_blank");
}
