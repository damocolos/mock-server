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

## 🚀 Quickstart Workflow

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

# Open documentation in browser
open http://localhost:3000/docs
```

---

## ☁️ Vercel Deployment

The project is preconfigured with [vercel.json](file:///c:/Users/hokaj/lab/mock-server/vercel.json) using `@vercel/node` and includes the static documentation bundle in `public/`.

Deploy directly using the Vercel CLI:
```bash
vercel
```
Ensure your `DATABASE_URL` environment variable is set in your Vercel Project Settings.
