import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import ExcelJS from "exceljs";
import type { SearchInput, SearchQuery, Store } from "../models/types.ts";

const columns = [
  "Rank", "Store Name", "Brand", "Branch", "City", "District", "Category", "Niche Query",
  "Match Score", "Contact Score", "Priority Score", "Dianping Rating", "Review Count", "Avg Price",
  "Public Phone", "Dianping URL", "XHS Account", "XHS Account Type", "XHS Profile URL", "XHS Last Active",
  "Other Contact", "Evidence", "Contact Status", "First Contact Date", "Reply Status", "Follow Up Date", "Notes",
];

function leadRows(stores: Store[], input: SearchInput): unknown[][] {
  return stores.map((store, index) => {
    const phone = store.contacts.find((contact) => contact.type === "PHONE");
    const xhs = store.accounts.find((account) => ["OFFICIAL", "POSSIBLE_OFFICIAL"].includes(account.authorType));
    const other = store.contacts.filter((contact) => contact.type !== "PHONE" && contact.type !== "XHS_ACCOUNT")
      .map((contact) => `${contact.type}: ${contact.value} (${contact.source}, ${Math.round(contact.confidence * 100)}%)`).join("; ");
    return [
      index + 1, store.storeName, store.brandName ?? "", store.branchName ?? "", store.city, store.district ?? "",
      store.category ?? "", input.niche.join(" / "), store.matchScore, store.contactScore, store.priorityScore,
      store.rating ?? null, store.reviewCount ?? null, store.avgPrice ?? null, phone?.value ?? "", store.dianpingUrl ?? "",
      xhs?.handle ?? "", xhs?.authorType ?? "", xhs?.profileUrl ?? "", xhs?.lastActive ? new Date(xhs.lastActive) : null,
      other, store.evidence.join("；"), "未联系", null, "待处理", null, "",
    ];
  });
}

function styleTitle(sheet: ExcelJS.Worksheet, range: string, text: string, size: number, italic = false): void {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = text;
  cell.font = { name: "Arial", size, bold: !italic, italic, color: { argb: italic ? "FF64748B" : "FF172554" } };
  cell.alignment = { vertical: "middle" };
}

function setHyperlink(sheet: ExcelJS.Worksheet, row: number, column: number, url: unknown): void {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
  const cell = sheet.getCell(row, column);
  cell.value = { text: url, hyperlink: url, tooltip: url };
  cell.font = { ...cell.font, color: { argb: "FF0563C1" }, underline: true };
}

export async function exportLeadsXlsx(path: string, stores: Store[], input: SearchInput, queries: SearchQuery[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "NicheScout";
  workbook.calcProperties.fullCalcOnLoad = true;
  const leads = workbook.addWorksheet("Leads", { views: [{ state: "frozen", xSplit: 2, ySplit: 4, topLeftCell: "C5", activeCell: "C5", showGridLines: false }] });
  const querySheet = workbook.addWorksheet("Search Queries", { views: [{ state: "frozen", ySplit: 3, topLeftCell: "A4", activeCell: "A4", showGridLines: false }] });

  styleTitle(leads, "A1:AA1", `NicheScout leads — ${input.city} / ${input.category} / ${input.niche.join("、")}`, 15);
  styleTitle(leads, "A2:AA2", `Generated ${new Date().toISOString().slice(0, 10)} · Public/mock data only · Contact details require manual verification`, 10, true);
  leads.getRow(1).height = 28;
  leads.getRow(2).height = 20;
  const rows = leadRows(stores, input);
  const tableRows = rows.length ? rows : [columns.map(() => null)];
  leads.addTable({
    name: "NicheScoutLeads",
    ref: "A4",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: columns.map((name) => ({ name, filterButton: true })),
    rows: tableRows,
  });
  const lastRow = 4 + tableRows.length;
  const header = leads.getRow(4);
  header.height = 34;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  for (let row = 5; row <= lastRow; row += 1) {
    const current = leads.getRow(row);
    current.height = rows.length ? 42 : 20;
    current.eachCell({ includeEmpty: true }, (cell, column) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "top", wrapText: column > 1, horizontal: column === 1 ? "center" : column >= 9 && column <= 14 ? "right" : "left" };
    });
    for (const column of [9, 10, 11, 12]) leads.getCell(row, column).numFmt = "0.0";
    for (const column of [13, 14]) leads.getCell(row, column).numFmt = "#,##0";
    for (const column of [20, 24, 26]) leads.getCell(row, column).numFmt = "yyyy-mm-dd";
    leads.getCell(row, 23).dataValidation = { type: "list", allowBlank: true, formulae: ['"未联系,已联系,需复核,不再跟进"'] };
    leads.getCell(row, 25).dataValidation = { type: "list", allowBlank: true, formulae: ['"待处理,已回复,未回复,拒绝,有意向"'] };
    setHyperlink(leads, row, 16, rows[row - 5]?.[15]);
    setHyperlink(leads, row, 19, rows[row - 5]?.[18]);
  }
  leads.addConditionalFormatting({
    ref: `I5:I${lastRow}`,
    rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }], color: [{ argb: "FFFEE2E2" }, { argb: "FFFEF3C7" }, { argb: "FFDCFCE7" }] }],
  });
  leads.addConditionalFormatting({
    ref: `K5:K${lastRow}`,
    rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }], color: [{ argb: "FFFEE2E2" }, { argb: "FFFEF3C7" }, { argb: "FFDCFCE7" }] }],
  });
  const widths = [7, 28, 20, 16, 10, 13, 12, 24, 12, 13, 13, 14, 13, 11, 18, 31, 18, 20, 31, 15, 24, 48, 14, 16, 14, 16, 28];
  widths.forEach((width, index) => { leads.getColumn(index + 1).width = width; });

  styleTitle(querySheet, "A1:C1", "Search queries", 15);
  querySheet.getRow(1).height = 28;
  const queryRows = queries.map((query, index) => [index + 1, query.text, query.reason]);
  querySheet.addTable({
    name: "SearchQueries",
    ref: "A3",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true },
    columns: ["No.", "Query", "Reason"].map((name) => ({ name, filterButton: true })),
    rows: queryRows.length ? queryRows : [[null, null, null]],
  });
  querySheet.getRow(3).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  for (let row = 4; row <= 3 + Math.max(queryRows.length, 1); row += 1) {
    querySheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = { vertical: "middle" };
    });
  }
  querySheet.getColumn(1).width = 8;
  querySheet.getColumn(2).width = 44;
  querySheet.getColumn(3).width = 26;

  await mkdir(dirname(path), { recursive: true });
  await workbook.xlsx.writeFile(path);
  return workbook;
}
