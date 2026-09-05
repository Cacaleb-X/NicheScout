import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// @ts-ignore workspace runtime dependency
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";
import { exportLeadsXlsx } from "../src/exporters/xlsx.ts";
import type { SearchInput, Store } from "../src/models/types.ts";

test("XLSX Export writes a real workbook with CRM columns", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nichescout-xlsx-"));
  const path = join(dir, "leads.xlsx");
  const input: SearchInput = { city: "长沙", category: "酒吧", niche: ["哈利波特主题"], limit: 1, excludeKeywords: [], output: path };
  const store: Store = { id: "1", storeName: "9¾魔法酒馆", normalizedName: "9¾魔法酒馆", city: "长沙", category: "酒吧", sources: [], posts: [], accounts: [], contacts: [], evidence: ["店名包含魔法"], matchScore: 90, contactScore: 40, priorityScore: 70, reviewStatus: "MATCHED" };
  await exportLeadsXlsx(path, [store], input, [{ text: "长沙 哈利波特 酒吧", reason: "细分词" }]);
  assert.ok((await stat(path)).size > 1000);
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(path));
  const inspection = await workbook.inspect({ kind: "table", sheetId: "Leads", range: "A4:AA5", include: "values,formulas", tableMaxRows: 3, tableMaxCols: 30 });
  assert.match(inspection.ndjson, /Contact Status/);
  assert.match(inspection.ndjson, /First Contact Date/);
  assert.match(inspection.ndjson, /Notes/);
});
