// Set DATABASE_URL before any module that calls makeDb() at load time (e.g. src/lib/db.ts).
// Tests pass DATABASE_APP_URL; this file aliases it so the singleton picks it up.
if (process.env["DATABASE_APP_URL"] && !process.env["DATABASE_URL"]) {
  process.env["DATABASE_URL"] = process.env["DATABASE_APP_URL"]
}
