import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import ExcelJS from "exceljs";
import { exportLeadsXlsx } from "../src/exporters/xlsx.ts";
import type { SearchInput, Store } from "../src/models/types.ts";

test("XLSX Export writes a real workbook with CRM columns", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nichescout-xlsx-"));
  const path = join(dir, "leads.xlsx");
  const input: SearchInput = { city: "长沙", category: "酒吧", niche: ["哈利波特主题"], limit: 1, excludeKeywords: [], output: path };
  const store: Store = { id: "1", storeName: "9¾魔法酒馆", normalizedName: "9¾魔法酒馆", city: "长沙", category: "酒吧", dianpingUrl: "https://example.com/store/1", sources: [], posts: [], accounts: [], contacts: [], evidence: ["店名包含魔法"], matchScore: 90, contactScore: 40, priorityScore: 70, reviewStatus: "MATCHED" };
  await exportLeadsXlsx(path, [store], input, [{ text: "长沙 哈利波特 酒吧", reason: "细分词" }]);
  assert.ok((await stat(path)).size > 1000);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Leads", "Search Queries"]);
  const leads = workbook.getWorksheet("Leads");
  const queries = workbook.getWorksheet("Search Queries");
  assert.ok(leads);
  assert.ok(queries);
  assert.deepEqual(leads.getRow(4).values.slice(1), [
    "Rank", "Store Name", "Brand", "Branch", "City", "District", "Category", "Niche Query",
    "Match Score", "Contact Score", "Priority Score", "Dianping Rating", "Review Count", "Avg Price",
    "Public Phone", "Dianping URL", "XHS Account", "XHS Account Type", "XHS Profile URL", "XHS Last Active",
    "Other Contact", "Evidence", "Contact Status", "First Contact Date", "Reply Status", "Follow Up Date", "Notes",
  ]);
  assert.equal(leads.getCell("B5").value, "9¾魔法酒馆");
  assert.equal(leads.getCell("W5").value, "未联系");
  assert.equal(leads.getCell("Y5").value, "待处理");
  assert.equal(leads.getCell("W5").dataValidation.type, "list");
  assert.deepEqual(leads.getCell("P5").value, {
    text: "https://example.com/store/1",
    hyperlink: "https://example.com/store/1",
  });
  assert.equal(leads.getTables().length, 1);
  assert.equal(queries.getTables().length, 1);
  assert.equal(leads.views[0]?.state, "frozen");
  assert.equal(queries.views[0]?.state, "frozen");
});
