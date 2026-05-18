# Testing Paystack Webhooks Locally with ngrok

## Overview

Paystack webhooks are sent from Paystack's servers to your backend. In local development your server is not publicly reachable, so you need a tunnel. **ngrok** creates a public HTTPS URL that forwards traffic to your local port.

The webhook endpoint is:
```
POST /webhooks/paystack
```

---

## Prerequisites

- Node.js backend running locally (default port: `3000`)
- ngrok installed — download from [ngrok.com/download](https://ngrok.com/download) or:
  ```bash
  npm install -g ngrok
  # or on macOS:
  brew install ngrok/ngrok/ngrok
  ```
- A Paystack account with dashboard access

---

## Step 1 — Start your backend

```bash
npm run dev
```

Confirm it is running:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## Step 2 — Start ngrok

```bash
ngrok http 3000
```

ngrok prints output like:

```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

Copy the `https://` URL — you will use it in the next step. The URL changes every time you restart ngrok (unless you have a paid account with a fixed domain).

---

## Step 3 — Register the webhook URL in Paystack

1. Open [Paystack Dashboard → Settings → API Keys & Webhooks](https://dashboard.paystack.com/#/settings/developer)
2. In the **Webhook URL** field, enter:
   ```
   https://<your-ngrok-subdomain>.ngrok-free.app/webhooks/paystack
   ```
3. Click **Save**.

---

## Step 4 — Test with a real payment

Make a test payment through Paystack's test mode (use test card `4084084084084081`, CVV `408`, expiry any future date). After payment succeeds, Paystack sends a `charge.success` webhook to your URL.

---

## Step 5 — Simulate a webhook manually

You can fire a test webhook without making a payment using `curl`. Replace `<secret>` with your `PAYSTACK_SECRET_KEY` from `.env`:

```bash
SECRET=<your_PAYSTACK_SECRET_KEY>
NGROK_URL=https://<your-subdomain>.ngrok-free.app

PAYLOAD='{"event":"charge.success","data":{"reference":"test_ref_001","amount":5000,"currency":"NGN","status":"success","customer":{"email":"test@example.com"}}}'

SIG=$(echo -n "$PAYLOAD" | openssl dgst -sha512 -hmac "$SECRET" -hex | awk '{print $2}')

curl -s -X POST "$NGROK_URL/webhooks/paystack" \
  -H "Content-Type: application/json" \
  -H "x-paystack-signature: $SIG" \
  -d "$PAYLOAD"
```

Expected response: `{"success":true}`

---

## Step 6 — Verify in the admin dashboard

Open the admin dashboard and navigate to **Operations → Webhook Logs**.

The **Webhook Diagnostics** panel at the top shows:
- The configured endpoint path
- The last received webhook, its event type, signature validity, and status

The table below shows all received events. Click any row to view the full payload.

---

## What the backend logs on receipt

Every incoming webhook produces a structured log entry:

```json
{
  "level": "info",
  "message": "paystack_webhook_received",
  "event": "charge.success",
  "reference": "test_ref_001",
  "has_raw_body": true,
  "signature_present": true
}
```

If signature validation fails, you will see `paystack_webhook_invalid_signature` at `warn` level. Check that:
- The `PAYSTACK_SECRET_KEY` env var matches the key used to sign the request
- The raw body is being read correctly (the app uses `express.raw()` middleware before `express.json()` for the webhook route)

---

## Signature verification — how it works

Paystack signs each webhook with HMAC-SHA512 of the raw request body using your secret key. The backend:

1. Reads `req.rawBody` (populated by the `rawBody` Express middleware)
2. Computes `HMAC-SHA512(rawBody, PAYSTACK_SECRET_KEY)`
3. Compares against the `x-paystack-signature` header

The webhook is stored regardless of signature validity, but **only valid-signature `charge.success` events are enqueued for processing**. Invalid-signature events show as `failed` in the Webhook Logs table.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `signature_valid: false` in logs | Wrong `PAYSTACK_SECRET_KEY`, or raw body not captured |
| Webhook not received at all | ngrok not running, wrong URL registered in Paystack |
| `400` or `500` response | Check backend logs with `npm run dev` |
| Event stored but wallet not credited | Check **Operations → Failed Deliveries** for queue errors |
| `duplicate` status in Webhook Logs | Same reference received twice — BullMQ deduplication prevented double-credit |

---

## Environment variables involved

| Variable | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | Used to verify webhook HMAC signature |
| `SYSTEM_SETTLEMENT_WALLET_ID` | Required to credit user wallet after successful payment |
| `PORT` | Backend port (default `3000`) — must match your `ngrok http <PORT>` command |
