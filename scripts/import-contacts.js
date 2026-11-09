require("dotenv").config();
const ExcelJS = require("exceljs");
const { Pool } = require("pg");
const path = require("path");

async function main() {
  const file = process.argv[2];
  const replace = process.argv.includes("--replace");
  if (!file) throw new Error("Usage: npm run import:contacts -- /secure/path/HR.xlsx [--replace]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(file));
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheet.");

  const headers = new Map();
  sheet.getRow(1).eachCell((cell, col) => {
    headers.set(String(cell.value || "").trim().toLowerCase().replace(/[^a-z]/g, ""), col);
  });
  const col = (...names) => {
    for (const n of names) if (headers.has(n)) return headers.get(n);
    throw new Error("Missing required column: " + names[0]);
  };
  const designationCol = col("designation");
  const companyCol = col("companyname");
  const nameCol = col("hrname", "name");
  const phoneCol = col("contactnumber", "phone", "mobilenumber");
  const emailCol = col("personalmailid", "email", "emailid");
  const clean = v => v == null ? "" : String(v).replace(/\u00a0/g, " ").trim();
  const records = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const record = {
      designation: clean(row.getCell(designationCol).text),
      company: clean(row.getCell(companyCol).text),
      name: clean(row.getCell(nameCol).text),
      phone: clean(row.getCell(phoneCol).text).replace(/[^0-9]/g, ""),
      email: clean(row.getCell(emailCol).text).toLowerCase()
    };
    if (!record.name && !record.phone && !record.email) continue;
    if (!record.name || !record.phone || !/^\d{10}$/.test(record.phone) || !record.email) {
      throw new Error("Invalid or incomplete contact data at spreadsheet row " + i + ". Import stopped without changing the database.");
    }
    records.push(record);
  }
  if (!records.length) throw new Error("No contact rows found.");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`CREATE TABLE IF NOT EXISTS hr_contacts (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, company TEXT NOT NULL DEFAULT '',
      designation TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const existing = await client.query("SELECT COUNT(*)::int AS count FROM hr_contacts");
    if (existing.rows[0].count > 0 && !replace) {
      throw new Error("Database already contains contacts. Re-run with --replace only if you intend to replace the existing directory.");
    }
    if (replace) await client.query("TRUNCATE TABLE hr_contacts RESTART IDENTITY");
    for (const r of records) {
      await client.query(
        "INSERT INTO hr_contacts(name,company,designation,phone,email) VALUES($1,$2,$3,$4,$5)",
        [r.name,r.company,r.designation,r.phone,r.email]
      );
    }
    await client.query("COMMIT");
    console.log("Imported " + records.length + " HR records. Contact details were not written to the repository.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(err => { console.error(err.message); process.exit(1); });
