require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.static("public"));

const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false }
}) : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hr_contacts (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      designation TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payment_events (
      id BIGSERIAL PRIMARY KEY,
      event_id TEXT UNIQUE NOT NULL,
      payment_link_id TEXT,
      payment_id TEXT,
      payload JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

app.get("/api/health", async (req, res) => {
  res.json({ ok: true, databaseConfigured: Boolean(pool), paymentWebhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET) });
});

// Razorpay Dashboard -> Account & Settings -> Webhooks.
// Subscribe to payment_link.paid. Never trust a browser redirect as proof of payment.
app.post("/api/webhooks/razorpay", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !pool) return res.status(503).json({ error: "Webhook is not configured." });
  const signature = req.get("X-Razorpay-Signature") || "";
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  const a = Buffer.from(signature), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Invalid signature." });
  const event = req.body;
  if (event.event !== "payment_link.paid") return res.json({ received: true, ignored: true });
  const entity = event.payload?.payment_link?.entity || {};
  const payment = event.payload?.payment?.entity || {};
  const eventId = req.get("x-razorpay-event-id");
  if (!eventId) return res.status(400).json({ error: "Missing event id." });
  await pool.query(
    "INSERT INTO payment_events(event_id,payment_link_id,payment_id,payload) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO NOTHING",
    [eventId, entity.id || null, payment.id || null, event]
  );
  res.json({ received: true });
});

// Directory remains locked until a real member-authentication flow is configured.
// Do not expose contact data through a static frontend or public API.
app.get("/api/directory", (req, res) => {
  res.status(503).json({ error: "Member verification is not configured yet. Contact data is not publicly available." });
});

app.get("*", (req, res) => res.sendFile(require("path").join(__dirname, "public", "index.html")));
const port = Number(process.env.PORT || 3000);
initDb().then(() => app.listen(port, () => console.log(`HR CONNECT listening on ${port}`)))
  .catch(err => { console.error("Startup failed:", err); process.exit(1); });
