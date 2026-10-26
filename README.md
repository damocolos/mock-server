# Dynamic Mock Server

A lightweight, high-performance mock API server designed to simulate dynamic HTTP responses on demand. Configured for serverless deployment on **Vercel** with interactive documentation and test console.

---

## 📖 Interactive Documentation & API Playground

Access the full interactive documentation page with live API testing console:
- **Local:** [http://localhost:3000/docs](http://localhost:3000/docs)
- **Vercel:** `https://your-deployment.vercel.app/docs`
- **Health Check:** `GET /` (returns server and database status)

---

## ⚡ Core Dynamic Endpoints

The documentation page focuses exclusively on the dynamic mock API engine:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/mocks` | Create a new mock configuration (specifying `status_code`, `response`, and optional `label`). Returns a UUID `id`. |
| `GET` | `/api/mocks/:id` | Fetch the stored mock configuration by UUID. |
| `PATCH` | `/api/mocks/:id` | Partially update an existing mock configuration. |
| `ALL` | `/api/dynamic/:id/*path` | The mock gateway. Call using **any** HTTP verb (`GET`, `POST`, `PUT`, `DELETE`, etc.) and any wildcard subpath to trigger the stored response. |

---

## 📡 Webhook Receiver Engine & Real-Time Stream

A high-performance webhook ingestion engine that validates incoming payloads, persists deliveries to PostgreSQL, enforces per-webhook rate limits (10 req/min), and streams updates in real time via Server-Sent Events (SSE).

### Live Dashboard & Inspector
- **Web UI:** [http://localhost:3000/webhooks](http://localhost:3000/webhooks)
- Features: Live SSE table sorted by `created_at DESC`, glowing row animations, payload drawer inspector (Body, Headers, Query, IP, Metadata), and one-click endpoint generator.

### Webhook Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/webhooks` | **Create Webhook ID (API only):** Generates a unique, active webhook target UUID. |
| `GET` | `/api/webhooks` | List all registered webhook channels and total delivery counts. |
| `GET` | `/api/webhooks/:id` | Fetch configuration and status of a specific webhook. |
| `DELETE` | `/api/webhooks/:id` | Soft-delete a webhook endpoint (marks status as `deleted`). |
| `ALL` | `/api/webhooks/:id/incoming` | **Inbound Webhook Receiver:** Accepts any HTTP method from outer services. Enforces 10 req/min limit, validates ID/status, persists to DB, broadcasts via SSE, and returns `200 OK`. |
| `GET` | `/api/webhooks/:id/logs` | Query delivery history for a webhook, sorted by `created_at DESC`. |
| `GET` | `/api/webhooks-logs` | Query global delivery logs across all channels, sorted by `created_at DESC`. |
| `GET` | `/api/webhooks/stream` | **Server-Sent Events (SSE):** Real-time stream of incoming webhooks across all targets. |
| `GET` | `/api/webhooks/:id/stream` | Real-time SSE stream filtered to a specific target ID. |

---

### Inbound Webhook Execution Flow & Rules

1. **Rate Limiting:**
   - Enforced per `webhook_id`: **Maximum 10 requests per minute**.
   - Standard headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
   - Exceeded response: `429 Too Many Requests` with `Retry-After: <seconds>`.
2. **Validation:**
   - If `:id` is unidentified or not found $\rightarrow$ `404 Not Found`.
   - If `:id` has been deleted or deactivated $\rightarrow$ `410 Gone`.
3. **Data Persistence:**
   - Saves incoming `method`, `headers`, `query`, `body` (JSON/text), client `ip`, and execution `metadata` into PostgreSQL table `webhook_logs`.
4. **Acknowledgment:**
   - Returns immediate `200 OK`:
     ```json
     {
       "success": true,
       "message": "Webhook received successfully",
       "data": {
         "delivery_id": "787f3c21-f1a4-4a2b-a01c-6d2743890123",
         "webhook_id": "b3e34b9d-47fb-4ef7-8fc2-06834b6b19a1",
         "timestamp": "2026-10-26T12:00:00.000Z"
       }
     }
     ```
5. **Real-time SSE Notification:**
   - Newly saved record is broadcast to all active SSE subscribers and prepended live to the `/webhooks` table UI.

---

### Webhook Quickstart

#### 1. Generate a Webhook ID
```bash
curl -X POST "http://localhost:3000/api/webhooks" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Stripe Payouts Channel"
  }'
```
Response:
```json
{
  "success": true,
  "message": "Webhook endpoint created successfully.",
  "data": {
    "id": "b3e34b9d-47fb-4ef7-8fc2-06834b6b19a1",
    "name": "Stripe Payouts Channel",
    "status": "active",
    "webhook_url": "http://localhost:3000/api/webhooks/b3e34b9d-47fb-4ef7-8fc2-06834b6b19a1/incoming",
    "relative_url": "/api/webhooks/b3e34b9d-47fb-4ef7-8fc2-06834b6b19a1/incoming",
    "created_at": "2026-10-26T12:00:00.000Z"
  }
}
```

#### 2. Dispatch a Webhook from an Outer Service
```bash
curl -X POST "http://localhost:3000/api/webhooks/b3e34b9d-47fb-4ef7-8fc2-06834b6b19a1/incoming" \
  -H "Content-Type: application/json" \
  -H "X-Custom-Signature: sha256=test_signature" \
  -d '{
    "event": "payment.succeeded",
    "amount": 250000,
    "currency": "IDR",
    "customer": { "id": "cust_101", "name": "Budi Santoso" }
  }'
```

#### 3. Subscribe to Real-Time SSE Stream
```bash
curl -N "http://localhost:3000/api/webhooks/stream"
```

---

## 🚀 Quickstart Workflow (Dynamic Mocks)

### 1. Create a Dynamic Mock
```bash
curl -X POST "http://localhost:3000/api/mocks" \
  -H "Content-Type: application/json" \
  -d '{
    "status_code": 200,
    "label": "User Profile Mock",
    "response": {
      "id": 101,
      "name": "Jane Doe",
      "role": "admin"
    }
  }'
```
Response:
```json
{
  "success": true,
  "message": "API configuration created successfully.",
  "data": {
    "id": "e4b1a234-5678-4901-abcd-ef0123456789",
    "label": "User Profile Mock",
    "status_code": 200,
    "response": { "id": 101, "name": "Jane Doe", "role": "admin" },
    "timestamp": "2026-10-13T09:40:00.000Z"
  }
}
```

### 2. Invoke the Dynamic Gateway
Call the mock with any HTTP method and any nested subpath:
```bash
curl -X GET "http://localhost:3000/api/dynamic/e4b1a234-5678-4901-abcd-ef0123456789/users/101"
```
Returns:
```json
{
  "id": 101,
  "name": "Jane Doe",
  "role": "admin"
}
```

---

## 💻 Local Development

```bash
# Install dependencies
npm install

# Run dev server with file watching
npm run dev

# Open documentation or webhook inspector in browser
open http://localhost:3000/docs
open http://localhost:3000/webhooks
```

---

## ☁️ Vercel Deployment

The project is preconfigured with [vercel.json](file:///c:/Users/hokaj/lab/mock-server/vercel.json) using `@vercel/node` and includes the static documentation bundle in `public/`.

Deploy directly using the Vercel CLI:
```bash
vercel
```
Ensure your `DATABASE_URL` environment variable is set in your Vercel Project Settings.

