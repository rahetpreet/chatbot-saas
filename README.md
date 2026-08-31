# No-Code Chatbot SaaS Platform (Zero-Cost / Free-First Architecture)

A multi-tenant B2B SaaS platform enabling businesses to visually build automated node-based conversational flows, deploy lightweight embeddable Shadow DOM widgets, generate dynamic trackable campaign links with QR codes, capture and export leads/transcripts, and leverage modular AI fallbacks—built completely from the ground up for ₹0 initial infrastructure cost.

---

## 🌟 Key Capabilities

### 1. Visual Drag-and-Drop Node Flow Builder (`@xyflow/react`)
- **10 Core Node Types**:
  - `Start Node`: Triggers on widget open, delay, or URL parameter.
  - `Message Node`: Rich text, markdown, image/video/PDF media embeds.
  - `Buttons / Quick-Reply Node`: Multi-choice branching with distinct handle connectors.
  - `Input Form Node`: Input validation for Name, Email, Phone, Number, Date, Free text.
  - `Attachment Node`: Visitor file upload with size and type constraints.
  - `Condition Node`: IF/ELSE logic based on captured variables, UTM parameters, device, time.
  - `Webhook Node`: REST API integration with variable interpolation.
  - `AI Fallback Node`: Query local FAQ knowledge base / local Ollama model.
  - `Live Handover Node`: Pauses bot and alerts human operators.
  - `Close Node`: Marks conversation resolved and triggers lead notification.
- **Interactive Simulator Playground**: Live side-by-side test canvas with real-time variable inspector.
- **Versioning**: Draft vs Published snapshots.

### 2. Isolated Shadow DOM Embeddable Widget (`/widget.js`)
- Runs in an isolated Shadow DOM to eliminate any global CSS bleeding or collisions.
- Responsive sliding drawer for mobile devices, popup card on desktop.
- Audio-visual typing indicator and synthesized Web Audio chime (zero audio file dependencies).
- LocalStorage session memory to restore conversations across page reloads.

### 3. Campaign & Trackable Link Generator
- Dynamic unique chat URLs (`https://yourdomain.com/c/acme-corp?campaign=promo&contact=usr-101`).
- CSV contact book importer for batch-generating personalized chat links.
- Real-time visit tracker logging IP, browser, device, timestamps, and open status.
- Local high-res QR code generator (downloadable as PNG or SVG with ₹0 external API cost).

### 4. Live Conversations Inbox & Lead Management
- 2-Pane live conversation inbox with status filters (`ACTIVE`, `HANDOVER`, `RESOLVED`, `ABANDONED`).
- Live human operator reply capabilities.
- Captured lead table with custom variable mapping and scoring.
- One-click exports: Conversation transcripts to PDF/JSON, Leads to CSV/JSON.

### 5. Super Admin Portal
- Multi-tenant company onboarding and subdomains.
- Subscription lifecycle control (`ACTIVE`, `PAUSED`, `SUSPENDED`, `TERMINATED`).
- Resource quota management per tenant (messages, flows, campaign links, storage).
- **"Login as Client" Tenant Impersonation** for instant customer support.
- Aggregated global metrics and system audit logs.

### 6. Zero-Cost / Free-First Architecture Abstraction Layer
- `EmailProvider`: `ConsoleEmailProvider` (logs to console + `/dev/email-inbox` without paid APIs) & `SMTPProvider` (Nodemailer for custom tenant SMTP).
- `StorageProvider`: `LocalStorageProvider` (tenant-partitioned `/public/uploads/tenants/...`) & S3-compatible cloud storage adapter.
- `AIProvider`: `DisabledAIProvider` (pure rule-based flow), `OllamaProvider` (free local AI via `localhost:11434`), and `ExternalAPIProvider` (optional free tiers for Groq/OpenRouter/Gemini).
- `QRCodeProvider`: On-device SVG/PNG QR generation without third-party APIs.
- `ExportProvider`: Native client/server CSV and PDF generation (`jspdf`, `papaparse`).

---

## 🚀 Quickstart & Local Development

### Prerequisites
- Node.js 18+ / 20+ / 24+
- PostgreSQL (via local install or Docker)

### 1. Setup Environment
```bash
cp .env.example .env
```

### 2. Start PostgreSQL (Optional via Docker)
```bash
docker compose up -d postgres
```

### 3. Database Schema Migration & Seeding
```bash
npm run db:push
npm run db:seed
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Default Credentials (Pre-Seeded)

| Role | Email | Password | Description |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin@platform.local` | `Password123!` | Global platform dashboard, tenant onboarding, quotas, impersonation |
| **Client Admin (Acme Corp)** | `client@acme.com` | `Password123!` | Demo tenant with published multi-branch flow, leads, campaigns |

---

## 📦 Deployment & Embed Usage

To embed the chatbot on any website, include this single script tag in the HTML:
```html
<script src="https://yourdomain.com/widget.js" data-tenant-slug="acme-corp" async></script>
```

Or open the standalone chat page:
```
http://localhost:3000/c/acme-corp
```

Test the live widget embed demo page:
```
http://localhost:3000/sample-embed.html
```

Inspect the ₹0 development email mailbox:
```
http://localhost:3000/dev/email-inbox
```
