// Client-only: builds a CSV blob and triggers a browser download. No
// server round-trip needed since report data is already loaded client-side.
function escapeCsvCell(value: string | number): string {
  let s = String(value);
  // Neutralize spreadsheet formula injection: a text cell a spreadsheet would
  // evaluate as a formula (leading =, @, +, or a - that isn't part of a number)
  // is prefixed with a single quote so Excel/Sheets treat it as literal text.
  // Only strings are checked - numeric cells, including negative amounts, pass
  // through untouched so they still parse as numbers.
  if (typeof value === "string" && (/^[=@+\t\r]/.test(s) || /^-[^\d\s]/.test(s))) {
    s = `'${s}`;
  }
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  // BOM so Excel opens accented French characters correctly.
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
