import ExcelJS from "exceljs";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/verify-workbook.mjs <file.xlsx>");

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(inputPath);
const leads = workbook.getWorksheet("Leads");
const queries = workbook.getWorksheet("Search Queries");
if (!leads || !queries) throw new Error("Expected Leads and Search Queries worksheets");

const formulaErrors = [];
for (const sheet of workbook.worksheets) {
  sheet.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    if (value && typeof value === "object" && "formula" in value) {
      const result = value.result;
      if (typeof result === "string" && /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!|SPILL!|CALC!)/.test(result)) {
        formulaErrors.push(`${sheet.name}!${cell.address}:${result}`);
      }
    }
  }));
}

const report = {
  sheets: workbook.worksheets.map((sheet) => sheet.name),
  leads: {
    rows: leads.rowCount,
    columns: leads.columnCount,
    headers: leads.getRow(4).values.slice(1),
    tables: leads.getTables().map((table) => table.name),
    frozen: leads.views[0],
    contactStatusValidation: leads.getCell("W5").dataValidation,
  },
  queries: {
    rows: queries.rowCount,
    columns: queries.columnCount,
    headers: queries.getRow(3).values.slice(1),
    tables: queries.getTables().map((table) => table.name),
    frozen: queries.views[0],
  },
  formulaErrors,
};

console.log(JSON.stringify(report, null, 2));
