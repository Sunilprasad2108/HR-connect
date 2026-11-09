# HR CONNECT

HR CONNECT is a paid HR directory project. The public landing page links to the supplied Razorpay payment page.

## Current implementation
- Responsive landing page and ₹249 Razorpay payment link.
- Express server with PostgreSQL connection and schema initialization.
- Razorpay `payment_link.paid` webhook signature verification and idempotent event storage.
- Directory API intentionally remains locked. No HR contact data is exposed publicly.

## Run locally
1. Install Node.js 20 or later and PostgreSQL.
2. Copy `.env.example` to `.env` and configure `DATABASE_URL`.
3. Run `npm install`, then `npm start`.
4. Open `http://localhost:3000`.

## Razorpay webhook
In the Razorpay Dashboard, add webhook URL `https://YOUR-DOMAIN/api/webhooks/razorpay`, set the same secret in `RAZORPAY_WEBHOOK_SECRET`, and subscribe to `payment_link.paid`. The webhook records verified payment events; it does not yet grant directory access to a user.

## Required before accepting paid members
- Add a phone OTP provider and bind each verified phone to a successful payment.
- Add member sessions, access expiry/revocation and rate limiting.
- Import the owner's authorized HR contact spreadsheet into PostgreSQL; do not commit personal contact data to Git.
- Obtain consent/authorization for contact sharing and provide deletion/correction handling.
- Add a masked-call provider and number provisioning. A masked relay cannot be implemented using only Razorpay or a static website.
- Test payment webhook delivery, duplicate events, failed payments, refund handling, access revocation and privacy controls.

## Deployment
Deploy as a Node.js web service on Railway (or another Node host), attach PostgreSQL, set the environment variables, and use the generated HTTPS domain for the Razorpay webhook. Do not enable the directory endpoint until OTP and payment-to-member binding are implemented and tested.
