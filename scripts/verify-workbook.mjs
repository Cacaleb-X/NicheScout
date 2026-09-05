import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/verify-workbook.mjs <file.xlsx>");
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const leads = await workbook.inspect({ kind: "table", sheetId: "Leads", range: "A1:AA10", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 27, maxChars: 12000 });
const queries = await workbook.inspect({ kind: "table", sheetId: "Search Queries", range: "A1:C12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 3, maxChars: 6000 });
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" });
const previewDir = "/tmp/nichescout-workbook-preview";
await fs.mkdir(previewDir, { recursive: true });
for (const sheetName of ["Leads", "Search Queries"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${previewDir}/${sheetName.replaceAll(" ", "_")}.png`, new Uint8Array(await preview.arrayBuffer()));
}
console.log(JSON.stringify({ leads: leads.ndjson, queries: queries.ndjson, errors: errors.ndjson, previewDir }, null, 2));
