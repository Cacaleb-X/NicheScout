import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import ExcelJS from "exceljs";
import type { SearchInput, StoreVerificationResult } from "../models/types.ts";

const columns = [
  "Store Candidate", "XHS Evidence", "XHS Source URL", "AMap Match Status", "AMap Store Name",
  "AMap POI ID", "Address", "District", "AMap Adcode", "Business Area", "Category", "Public Phone", "Phone Source",
  "Store Match Confidence", "Review Status", "Notes",
];

function rowsFor(verifications: StoreVerificationResult[]): unknown[][] {
  return verifications.map((verification) => [
    verification.candidate.candidateName,
    verification.candidate.evidence.map((item) => item.text).join("；"),
    (verification.candidate.sourceNoteUrls || [verification.candidate.sourceNoteUrl]).filter(Boolean).join("；"),
    verification.matchStatus,
    verification.matchedRecord?.storeName ?? "",
    verification.matchedRecord?.externalId ?? "",
    verification.matchedRecord?.address ?? "",
    verification.matchedRecord?.district ?? "",
    verification.matchedRecord?.adcode ?? "",
    verification.matchedRecord?.businessArea ?? "",
    verification.matchedRecord?.category ?? "",
    verification.matchedRecord?.publicPhone ?? "",
    verification.matchedRecord?.publicPhone ? "AMAP" : "",
    verification.matchConfidence,
    verification.reviewStatus,
    verification.notes ?? "",
  ]);
}

export async function exportStoreVerificationsXlsx(path: string, verifications: StoreVerificationResult[], input: SearchInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NicheScout";
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet("Store Verification", { views: [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5", activeCell: "B5", showGridLines: false }] });
  sheet.mergeCells("A1:P1");
  sheet.getCell("A1").value = `AMap store verification — ${input.city} / ${input.category} / ${input.niche.join("、")}`;
  sheet.getCell("A1").font = { name: "Arial", size: 15, bold: true, color: { argb: "FF172554" } };
  sheet.getRow(1).height = 28;
  sheet.mergeCells("A2:P2");
  sheet.getCell("A2").value = "XHS public search-card candidates verified with AMap POI Search 2.0; missing phone is not a verification failure";
  sheet.getCell("A2").font = { name: "Arial", size: 10, italic: true, color: { argb: "FF64748B" } };
  sheet.getRow(2).height = 20;

  const rows = rowsFor(verifications);
  const tableRows = rows.length ? rows : [columns.map(() => null)];
  sheet.addTable({
    name: "StoreVerificationTable",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: columns.map((name) => ({ name, filterButton: true })),
    rows: tableRows,
  });
  sheet.getRow(4).height = 36;
  sheet.getRow(4).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  const lastRow = 4 + tableRows.length;
  for (let row = 5; row <= lastRow; row += 1) {
    const current = sheet.getRow(row);
    current.height = rows.length ? 54 : 20;
    current.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "top", wrapText: true };
    });
    sheet.getCell(row, 14).numFmt = "0%";
    const sourceUrl = rows[row - 5]?.[2];
    if (typeof sourceUrl === "string" && /^https?:\/\/[^；]+$/i.test(sourceUrl)) {
      sheet.getCell(row, 3).value = { text: sourceUrl, hyperlink: sourceUrl, tooltip: sourceUrl };
      sheet.getCell(row, 3).font = { name: "Arial", size: 10, color: { argb: "FF0563C1" }, underline: true };
    }
  }
  sheet.addConditionalFormatting({
    ref: `N5:N${lastRow}`,
    rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }], color: [{ argb: "FFFEE2E2" }, { argb: "FFFEF3C7" }, { argb: "FFDCFCE7" }] }],
  });
  sheet.addConditionalFormatting({
    ref: `D5:D${lastRow}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "AMBIGUOUS", style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }, font: { color: { argb: "FF92400E" } } } },
      { type: "containsText", operator: "containsText", text: "NOT_FOUND", style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } }, font: { color: { argb: "FF991B1B" } } } },
    ],
  });
  const widths = [26, 48, 38, 18, 28, 19, 36, 14, 14, 17, 28, 20, 14, 19, 16, 40];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });

  await mkdir(dirname(path), { recursive: true });
  await workbook.xlsx.writeFile(path);
  return workbook;
}
