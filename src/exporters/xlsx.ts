import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
// @ts-ignore - provided by the Codex workspace runtime.
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
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

export async function exportLeadsXlsx(path: string, stores: Store[], input: SearchInput, queries: SearchQuery[]) {
  const workbook = Workbook.create();
  const leads = workbook.worksheets.add("Leads");
  const querySheet = workbook.worksheets.add("Search Queries");
  leads.showGridLines = false;
  querySheet.showGridLines = false;

  leads.getRange("A1:AA1").merge();
  leads.getRange("A1").values = [[`NicheScout leads — ${input.city} / ${input.category} / ${input.niche.join("、")}`]];
  leads.getRange("A2:AA2").merge();
  leads.getRange("A2").values = [[`Generated ${new Date().toISOString().slice(0, 10)} · Public/mock data only · Contact details require manual verification`]];
  leads.getRange("A4:AA4").values = [columns];
  const rows = leadRows(stores, input);
  if (rows.length) leads.getRangeByIndexes(4, 0, rows.length, columns.length).values = rows;
  const lastRow = Math.max(5, rows.length + 4);
  leads.tables.add(`A4:AA${lastRow}`, true, "NicheScoutLeads").style = "TableStyleMedium2";
  leads.freezePanes.freezeRows(4);
  leads.freezePanes.freezeColumns(2);

  leads.getRange("A1:AA1").format = { font: { name: "Arial", size: 15, bold: true, color: "#172554" }, rowHeight: 28 };
  leads.getRange("A2:AA2").format = { font: { name: "Arial", size: 10, italic: true, color: "#64748B" }, rowHeight: 20 };
  leads.getRange("A4:AA4").format = { fill: "#1E3A5F", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true, rowHeight: 34 };
  leads.getRange(`A5:AA${lastRow}`).format.font = { name: "Arial", size: 10, color: "#1F2937" };
  leads.getRange(`A5:AA${lastRow}`).format.verticalAlignment = "top";
  leads.getRange(`B5:AA${lastRow}`).format.wrapText = true;
  leads.getRange(`A5:A${lastRow}`).format.horizontalAlignment = "center";
  leads.getRange(`I5:N${lastRow}`).format.horizontalAlignment = "right";
  leads.getRange(`I5:K${lastRow}`).format.numberFormat = "0.0";
  leads.getRange(`L5:L${lastRow}`).format.numberFormat = "0.0";
  leads.getRange(`M5:N${lastRow}`).format.numberFormat = "#,##0";
  leads.getRange(`T5:T${lastRow}`).format.numberFormat = "yyyy-mm-dd";
  leads.getRange(`X5:X${lastRow}`).format.numberFormat = "yyyy-mm-dd";
  leads.getRange(`Z5:Z${lastRow}`).format.numberFormat = "yyyy-mm-dd";
  leads.getRange(`W5:W${lastRow}`).dataValidation = { rule: { type: "list", values: ["未联系", "已联系", "需复核", "不再跟进"] } };
  leads.getRange(`Y5:Y${lastRow}`).dataValidation = { rule: { type: "list", values: ["待处理", "已回复", "未回复", "拒绝", "有意向"] } };
  leads.getRange(`I5:I${lastRow}`).conditionalFormats.add("colorScale", { colors: ["#FEE2E2", "#FEF3C7", "#DCFCE7"], thresholds: ["min", { type: "percentile", value: 50 }, "max"] });
  leads.getRange(`K5:K${lastRow}`).conditionalFormats.add("colorScale", { colors: ["#FEE2E2", "#FEF3C7", "#DCFCE7"], thresholds: ["min", { type: "percentile", value: 50 }, "max"] });
  const widths = [7, 28, 20, 16, 10, 13, 12, 24, 12, 13, 13, 14, 13, 11, 18, 31, 18, 20, 31, 15, 24, 48, 14, 16, 14, 16, 28];
  widths.forEach((width, index) => { leads.getRangeByIndexes(0, index, lastRow, 1).format.columnWidth = width; });
  if (rows.length) leads.getRange(`A5:AA${lastRow}`).format.rowHeight = 42;

  querySheet.getRange("A1:C1").merge();
  querySheet.getRange("A1").values = [["Search queries"]];
  querySheet.getRange("A3:C3").values = [["No.", "Query", "Reason"]];
  const queryRows = queries.map((query, index) => [index + 1, query.text, query.reason]);
  querySheet.getRangeByIndexes(3, 0, queryRows.length, 3).values = queryRows;
  querySheet.tables.add(`A3:C${queryRows.length + 3}`, true, "SearchQueries").style = "TableStyleMedium2";
  querySheet.freezePanes.freezeRows(3);
  querySheet.getRange("A1:C1").format = { font: { name: "Arial", size: 15, bold: true, color: "#172554" }, rowHeight: 28 };
  querySheet.getRange("A3:C3").format = { fill: "#1E3A5F", font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" }, horizontalAlignment: "center" };
  querySheet.getRange(`A4:C${queryRows.length + 3}`).format.font = { name: "Arial", size: 10, color: "#1F2937" };
  querySheet.getRange("A:A").format.columnWidth = 8;
  querySheet.getRange("B:B").format.columnWidth = 44;
  querySheet.getRange("C:C").format.columnWidth = 26;

  await mkdir(dirname(path), { recursive: true });
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(path);
  return workbook;
}
