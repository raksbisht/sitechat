<div align="center">

<h1><img src="docs/images/sitechat-logo.svg" alt="SiteChat" width="280" height="62" /></h1>

### AI-Powered Customer Support Platform

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white)](https://mongodb.com)
[![LangChain](https://img.shields.io/badge/LangChain-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white)](https://langchain.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

A production-ready **RAG (Retrieval Augmented Generation)** chatbot platform that enables businesses to create intelligent, context-aware chatbots for their websites.

[Quick Start](#quick-start) · [API Docs](#api-reference) · [Widget Integration](#widget-integration) · [Contributing](#contributing)

</div>

---

## ✨ Why SiteChat?

| | Feature | Description |
|:--:|---------|-------------|
| 🔒 | **Privacy First** | Run entirely on your infrastructure. Use local LLMs (Ollama) for complete data isolation—your conversations never touch external servers. |
| ♾️ | **Unlimited Everything** | One deployment = unlimited sites, unlimited chatbots, unlimited conversations. No per-site fees, no usage caps. |
| 🏠 | **Self-Hosted** | Your data stays on your servers. Full privacy and control over your customer interactions. |
| 🔄 | **No Vendor Lock-in** | Swap between Ollama, OpenAI, Anthropic, or Azure with a single env var. |
| 🚀 | **Production Ready** | Security headers, rate limiting, JWT auth, and 440+ tests included. |
| 🎨 | **White-Label** | Fully customizable branding for the platform and chat widget. |
| 📦 | **Easy Integration** | Single `<script>` tag to add chat to any website. |

---

## 📸 Screenshots

<details open>
<summary><strong>Chat Widget</strong></summary>

The embeddable chat widget that visitors interact with on your website.

![Chat Widget](docs/images/widget.png)

</details>

<details open>
<summary><strong>Dashboard & Widget Customization</strong></summary>

Manage your sites, customize widget appearance, and see a live preview of your chatbot.

![Dashboard](docs/images/dashboard.png)

</details>

<details open>
<summary><strong>Q&A Training</strong></summary>

Create custom question-answer pairs to improve chatbot responses and train your AI.

![Q&A Training](docs/images/training.png)

</details>

<details open>
<summary><strong>Embed Code</strong></summary>

Get a ready-to-use embed code to add the chatbot to any website with a single script tag.

![Embed Code](docs/images/embed-code.png)

</details>

---

## 🔄 SiteChat vs Commercial Alternatives

Many businesses rely on cloud-based chatbot services that charge recurring subscription fees and store customer data on third-party servers. SiteChat offers a fundamentally different approach:

| Aspect | Commercial SaaS Platforms | SiteChat |
|--------|---------------------------|----------|
| **Pricing** | Monthly subscriptions ($49-$500+/mo), usage-based fees | One-time deployment, no recurring fees ever |
| **Sites & Chatbots** | Pay per site, limited chatbots per plan | **Unlimited sites, unlimited chatbots** from single install |
| **Conversations** | Metered usage, overage charges | Unlimited conversations, no caps |
| **Data Privacy** | Your data on their servers, shared infrastructure | **100% self-hosted**, data never leaves your control |
| **AI Model Privacy** | All queries sent to cloud APIs | Run local LLMs (Ollama) for **complete data isolation** |
| **Page/Content Limits** | Tiered limits (50-5000 pages), overages charged | Unlimited pages and documents |
| **LLM Flexibility** | Locked to their chosen model (usually one provider) | Swap between Ollama, OpenAI, Anthropic, or Azure freely |
| **Customization** | Limited branding options, "Powered by" badges | Full white-labeling, complete UI control |
| **Compliance** | Limited compliance options | GDPR/HIPAA-ready, air-gapped deployments possible |
| **Vendor Lock-in** | Proprietary formats, no data export | Open source, standard formats, full portability |
| **API Access** | Limited or premium-tier only | Full API access included |

### When to Choose SiteChat

- **Agencies & Multi-Site Businesses**: Manage chatbots for all your client sites or properties from one installation—no per-site fees
- **Privacy-Critical Industries**: Healthcare, legal, finance, or government where data sovereignty is non-negotiable
- **Complete Data Isolation**: Run local LLMs with Ollama—customer conversations never leave your servers
- **High-Volume Operations**: Unlimited conversations without metered billing or overage charges
- **Custom Integrations**: Need deep integration with internal systems via full API access
- **Long-Term Cost Control**: One deployment, zero recurring fees—scale without scaling costs
- **Full Branding**: Complete white-labeling with no third-party badges or attributions

### Trade-offs to Consider

SiteChat requires self-hosting infrastructure and technical expertise to deploy and maintain. Commercial platforms offer managed hosting and support, which may be preferable for teams without DevOps resources.

---

## 📑 Table of Contents

| Getting Started | Reference | Operations |
|:----------------|:----------|:-----------|
| [🚀 Quick Start](#-quick-start) | [📚 API Reference](#-api-reference) | [🧪 Testing](#-testing) |
| [⚙️ Configuration](#️-configuration) | [🔌 Widget Integration](#-widget-integration) | [🔒 Production Security](#-production-security-checklist) |
| [🏗️ Architecture](#️-architecture) | [🎯 Features](#-features) | [🤝 Contributing](#-contributing) |
| [📸 Screenshots](#-screenshots) | [🔄 Comparison](#-sitechat-vs-commercial-alternatives) | [🆕 Recent updates](#-recent-updates) |

---

## 🆕 Recent updates

Highlights from the latest platform and dashboard work:

### Authentication and admin safety

- **Mandatory admin password change** — New auto-created admin accounts are flagged with `must_change_password`. Legacy admin users without that field are migrated on startup so they must pick a new password on first login.
- **API lock until password is set** — While `must_change_password` is true, admins may only call `GET` / `PATCH` `/api/auth/me`. Other dashboard APIs return `403` with code `must_change_password`.
- **Profile password flow** — `PATCH /api/auth/me` allows setting a new password **without** the current password when `must_change_password` is true; otherwise the current password is still required.
- **Admin management of site owners** — `PATCH /api/auth/users/{user_id}` lets admins update a site owner’s (`role=user`) display name and/or password.
- **User API** — Responses include `must_change_password` where applicable.

### Conversations API (authorization)

- **JWT on conversation routes** — Listing, search, detail, notes, tags, status, export, delete, and related operations require a valid Bearer token.
- **Role-scoped data** — **Admins** see all sites (optional `site_id` filter). **Support agents** see only conversations for sites in `assigned_site_ids` (multi-site queries use a `site_id` `$in` filter). **Site owners** see only their own sites’ conversations.
- **Agent restrictions** — Agents cannot export conversations or delete (single or bulk). **`POST /api/conversations/auto-close`** is **admin-only**. Exports for non-admins require explicit `site_id` and/or `session_ids` scoped to sites they can access.

### Human handoff and widget

- **Visitor abandon** — `POST /api/handoff/{handoff_id}/abandon` (public, rate-limited) marks a handoff abandoned when the visitor leaves; body includes `session_id` for verification. The embeddable widget calls this on unload/navigation where possible (including `sendBeacon`).
- **Re-request signal** — If a visitor requests a human again while the request is still **pending**, the server bumps `visitor_queue_signals` and updates the row so the agent queue and **SSE** stream can highlight “still waiting / nudge” behavior.
- **Agent queue visibility** — Support agents see **unassigned** items (open pool) plus handoffs **assigned to them**. Admins and site owners still see the full queue for the site(s). SSE uses the same rules and includes queue row identity (including signals) so updates propagate reliably.
- **Abandoned handoffs** — Messaging, assignment, and status changes are rejected appropriately once a session is abandoned.

### Leads

- **Site-scoped access** — List, export, count, and delete check that the caller may view that site (`can_view_site`). **Agents cannot delete leads.**

### Dashboard and marketing frontend

- **First-login gate** — After login, admins with `must_change_password` get a blocking “Set your password” modal until they save a new password (dashboard is inert until then).
- **Agents** — Default view is **Handoffs**; **white-label** settings are not loaded for the agent role. Sidebar navigation uses delegated clicks and keeps **menu + utility links** in sync for the active view.
- **Handoffs UI** — Copy explains the shared pending queue; **assign to agent** sits with the conversation chrome for clearer workflow.
- **Landing** — The chat widget is loaded with a normal `<script>` tag (same-origin in dev). For a separate API host, set `data-api-url` on the script.
- **Cache busting** — Dashboard CSS may use a query string on `styles.css` after UI changes so browsers pick up new styles.

### Configuration and widget build

- **Default CORS** — Includes `http://localhost:8015` and `http://127.0.0.1:8015` for common alternate dev ports.
- **Widget build** — If `npm run build` fails with “source missing”, restore **`frontend/src/widget/chatbot.js`** from the repo; `frontend/widget/` is build output only.

---

## 🎯 Features

| Category | Features |
|----------|----------|
| **Core** | Site management, document upload, RAG chatbot, multi-LLM support |
| **Widget** | Embeddable chat, customizable appearance, proactive triggers, lead capture |
| **Operations** | Conversation history, analytics dashboard, human handoff, Q&A training |
| **Admin** | JWT auth, role-based access, mandatory admin password setup, security hardening, white-labeling |

### Core

<details open>
<summary><strong>Site & Document Management</strong></summary>

- **Website Crawling** - Automatically crawl and index website content with status tracking
- **Multi-site Support** - Manage multiple websites from a single dashboard
- **Scheduled Re-crawling** - Daily/weekly/monthly auto-crawl with URL filtering
- **Document Upload** - PDF, DOCX, TXT, MD with automatic chunking and vector embeddings

</details>

<details open>
<summary><strong>AI Chatbot with RAG</strong></summary>

- **Intelligent Responses** - Context-aware answers using retrieved content
- **Source Citations** - Responses include references to source documents
- **Confidence Scores** - Each response includes a confidence rating
- **Follow-up Suggestions** - AI suggests relevant follow-up questions
- **Streaming Responses** - Real-time streaming for better UX
- **Multi-LLM Support** - Ollama, OpenAI, Anthropic, Azure OpenAI

</details>

### Widget & Engagement

<details open>
<summary><strong>Embeddable Chat Widget</strong></summary>

- **Single Script Tag** - Easy integration on any website
- **Customizable** - Colors, title, welcome message, position
- **Responsive** - Works on desktop and mobile
- **Live Preview** - See changes in real-time while customizing
- **Embed Code Generator** - Copy-paste ready integration code
- **Behavior Config** - System prompt, temperature, max tokens

</details>

<details open>
<summary><strong>Proactive Triggers</strong></summary>

- **Conditions** - Time on page, scroll depth, exit intent, URL patterns, visit count
- **Actions** - Nudge notification or auto-open chat
- **Settings** - Custom messages, cooldown periods
- **Analytics** - Track impressions, clicks, and conversions

</details>

<details open>
<summary><strong>Lead Generation</strong></summary>

- **Widget Capture** - Collect visitor email and name during chat sessions
- **Duplicate Prevention** - Automatically skip re-prompting for existing leads
- **Source Tracking** - Track where leads originated (chat, form, etc.)
- **CSV Export** - Export all leads with timestamps for CRM import
- **Search & Pagination** - Easily browse and search captured leads
- **Access Control** - Dashboard lead APIs enforce per-site access; **agents cannot delete** leads

</details>

### Operations

<details open>
<summary><strong>Conversation Management</strong></summary>

- **Authenticated API** - List, search, detail, tags, notes, and exports require JWT; access is limited by role (admin / site owner / agent)
- **Full History** - Admins see all sites; agents only assigned sites; owners only their sites
- **Search & Filter** - By content, date, or site (scoped like list)
- **Export** - Download conversations for analysis (not available to agents; site owners need explicit site/session scope)
- **Bulk Operations** - Delete or manage multiple conversations (agents cannot delete)
- **Auto-close** - Inactive conversation cleanup is **admin-only**
- **Session Tracking** - Track user sessions and engagement

</details>

<details open>
<summary><strong>Analytics Dashboard</strong></summary>

- **Metrics** - Conversations, messages, confidence scores, response times
- **Time Periods** - Day, week, month views
- **Visualizations** - Interactive charts with Chart.js
- **Per-site Filtering** - Drill down by specific sites

</details>

<details open>
<summary><strong>Human Handoff</strong></summary>

- **Triggers** - User-initiated, AI-suggested (low confidence), phrase detection
- **Visitor Abandon** - Visitors can abandon a handoff when leaving the page; widget calls the public abandon endpoint with session verification
- **Re-request While Pending** - Repeated “connect to human” while still pending bumps a queue signal for agent visibility and SSE updates
- **Agent Dashboard** - Real-time queue, pending/active/resolved filters; **agents** see the open pool plus tickets assigned to them; admins/owners see the full site queue
- **Business Hours** - Configurable schedule, timezone support, offline messages
- **Live Chat** - Real-time messaging between agent and visitor (blocked for resolved/abandoned sessions)

</details>

<details open>
<summary><strong>Q&A Training</strong></summary>

- **Custom Q&A Pairs** - Create question-answer pairs to improve chatbot responses
- **From Conversations** - Convert existing chat exchanges into training data
- **Edit & Refine** - Modify answers before saving as training data
- **Enable/Disable** - Toggle Q&A pairs on/off without deleting
- **RAG Integration** - Q&A pairs are automatically used in response generation
- **Statistics** - Track total, enabled, and recently added Q&A pairs

</details>

### Admin & Security

<details open>
<summary><strong>Authentication & Authorization</strong></summary>

- **JWT Authentication** - Secure token-based auth
- **Role-based Access** - Admin, site owner (`user`), and support **agent** roles with scoped data access
- **Mandatory Admin Password** - New and migrated admin accounts can be required to set a new password before using the rest of the API; until then, only profile (`/api/auth/me`) is allowed
- **Admin Updates Site Owners** - Admins can patch site-owner accounts (`name` / `password`) via `/api/auth/users/{user_id}`
- **Password Policy** - Configurable complexity requirements
- **Session Management** - Secure login/logout; `must_change_password` exposed in user responses

</details>

<details open>
<summary><strong>Security Features</strong></summary>

- **Headers** - X-Frame-Options, CSP, HSTS, X-XSS-Protection
- **CORS** - Configurable origins, no wildcards in production
- **Validation** - Content limits, input sanitization, user agent blocking
- **Rate Limiting** - Per-IP limits on login, chat, lead capture, and handoff endpoints
- **Spam Protection** - Honeypot fields on lead capture and handoff to silently block bots
- **Environment Modes** - Development, staging, production with auto-warnings

</details>

<details open>
<summary><strong>White-labeling</strong></summary>

- **Platform** - Custom name, logo, favicon, colors, footer
- **Widget** - Hide "Powered by" branding, custom branding text/link

</details>

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | FastAPI, Python 3.10+, Pydantic |
| **Database** | MongoDB (Motor async driver) |
| **Vector Store** | FAISS (swappable: Chroma, Pinecone, Qdrant) |
| **LLM** | LangChain + Ollama/OpenAI/Anthropic/Azure |
| **Embeddings** | HuggingFace Sentence Transformers |
| **Auth** | JWT (python-jose), passlib, SlowAPI (rate limiting) |
| **Frontend** | Vanilla JS, CSS Variables, Chart.js |
| **Widget** | Standalone JS (obfuscated via javascript-obfuscator) |
| **Doc Processing** | PyPDF, docx2txt, BeautifulSoup4 |

## 🏗️ Architecture

SiteChat uses a **Provider Pattern** for all infrastructure components, making it easy to swap providers without changing business logic.

### Supported Providers

| Component | Options | Default |
|-----------|---------|---------|
| **LLM** | Ollama, OpenAI, Anthropic, Azure | Ollama |
| **Embeddings** | HuggingFace, OpenAI, Ollama | HuggingFace |
| **Vector Store** | FAISS, Chroma, Pinecone, Qdrant | FAISS |
| **Database** | MongoDB, PostgreSQL (planned) | MongoDB |
| **Storage** | Local, S3 (planned), GCS (planned) | Local |
| **Cache** | Memory, Redis (planned) | Memory |

### Switching Providers

Change environment variables in `.env`:

```bash
# Example: Switch to OpenAI
LLM_PROVIDER=openai
LLM_MODEL=gpt-4-turbo
OPENAI_API_KEY=sk-xxx

# Example: Switch to Pinecone
VECTOR_STORE_PROVIDER=pinecone
PINECONE_API_KEY=xxx
PINECONE_INDEX=sitechat
```

## 📁 Project Structure

```
sitechat/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry point
│   │   ├── config.py              # Configuration & settings
│   │   ├── core/                  # Dependencies & security middleware
│   │   ├── providers/             # Swappable infrastructure
│   │   │   ├── factory.py         # LangChain component factories
│   │   │   ├── database/          # Database providers (MongoDB)
│   │   │   ├── storage/           # Storage providers (Local/S3)
│   │   │   └── cache/             # Cache providers (Memory/Redis)
│   │   ├── database/              # Vector store & DB operations
│   │   ├── models/                # Pydantic schemas
│   │   ├── routes/                # API endpoints
│   │   │   ├── auth.py, chat.py, sites.py, documents.py
│   │   │   ├── conversations.py, analytics.py, crawl.py
│   │   │   ├── triggers.py, handoff.py, platform.py, embed.py
│   │   │   ├── leads.py, qa.py    # Lead capture & Q&A training
│   │   └── services/              # Business logic
│   │       ├── rag_engine.py      # RAG implementation
│   │       ├── crawler.py         # Web crawler
│   │       ├── document_processor.py, indexer.py
│   ├── tests/                     # Pytest test suite
│   │   ├── unit/                  # Unit tests
│   │   ├── integration/           # API tests
│   │   ├── security/              # Security tests
│   │   └── providers/             # Provider tests
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── landing.html               # Marketing landing (served at /)
│   ├── index.html                 # Dashboard SPA (served at /app)
│   ├── login.html                 # Login page
│   ├── demo.html                  # Widget demo
│   ├── js/app.js                  # Dashboard logic
│   ├── css/styles.css
│   ├── css/landing.css            # Landing page styles
│   ├── package.json               # Widget build config
│   ├── build.js                   # Obfuscation script
│   ├── src/widget/chatbot.js      # Widget source (edit here; commit to git)
│   └── widget/                    # Obfuscated widget (served)
│       ├── chatbot.js             # Production build
│       └── chatbot.min.js         # Minified build
├── e2e/                           # Playwright E2E tests
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Python | 3.10+ | Backend server |
| MongoDB | 6.0+ | Database |
| Ollama | Latest | Local LLM |
| Node.js | 18+ | Widget build (optional) |

### Setup & Run

```bash
# 1. Clone and setup backend
git clone <repository-url>
cd sitechat/backend
python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
# Windows: python -m venv venv && venv\Scripts\activate && pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings (see Configuration section below)

# 3. Start MongoDB
mongod --dbpath /path/to/data

# 4. Pull Ollama model and start server
ollama pull llama3.2
ollama serve

# 5. Run the application (in a new terminal)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Access Points

| URL | Description |
|-----|-------------|
| http://localhost:8000 | Marketing landing |
| http://localhost:8000/app | Dashboard (after login) |
| http://localhost:8000/dashboard | Same as `/app` |
| http://localhost:8000/login | Sign in |
| http://localhost:8000/api/docs | API Documentation |
| http://localhost:8000/demo | Widget Demo |

> **Seeing “It works!”?** That is Apache on port **80**, not SiteChat. Use **http://localhost:8000** above, or run `./scripts/run-sitechat.sh` from the repo root (opens the browser). To serve SiteChat on plain `http://localhost`, see [deploy/APACHE_PROXY.md](deploy/APACHE_PROXY.md).

### Default Login

- **Email**: admin@sitechat.in
- **Password**: Admin123!

> ⚠️ **Change these credentials in production!**

### Optional: Build Widget (for development)

```bash
cd frontend
npm install
npm run build
```

## ⚙️ Configuration

### Environment Variables

See `backend/.env.example` for a complete list of all configuration options.

```env
# ===========================================
# App Settings
# ===========================================
APP_NAME=SiteChat
DEBUG=true

# ===========================================
# LLM Provider (ollama, openai, anthropic, azure)
# ===========================================
LLM_PROVIDER=ollama
LLM_MODEL=llama3.1:8b
OLLAMA_BASE_URL=http://localhost:11434
# OPENAI_API_KEY=sk-xxx          # If using OpenAI
# ANTHROPIC_API_KEY=sk-ant-xxx   # If using Anthropic

# ===========================================
# Embeddings Provider (huggingface, openai, ollama)
# ===========================================
EMBEDDINGS_PROVIDER=huggingface
EMBEDDINGS_MODEL=all-MiniLM-L6-v2

# ===========================================
# Vector Store (faiss, chroma, pinecone, qdrant)
# ===========================================
VECTOR_STORE_PROVIDER=faiss
FAISS_INDEX_PATH=./data/faiss_index

# ===========================================
# Database (mongodb)
# ===========================================
DATABASE_PROVIDER=mongodb
MONGODB_URL=mongodb://localhost:27017
MONGODB_DB=sitechat

# ===========================================
# Storage (local)
# ===========================================
STORAGE_PROVIDER=local
LOCAL_STORAGE_PATH=./data/uploads

# ===========================================
# Cache (memory)
# ===========================================
CACHE_PROVIDER=memory
CACHE_TTL=300

# ===========================================
# Security Settings
# ===========================================
ENVIRONMENT=production  # development, staging, production
CORS_ORIGINS=https://yourdomain.com,https://api.yourdomain.com
TRUSTED_HOSTS=yourdomain.com,api.yourdomain.com
ENABLE_SECURITY_HEADERS=true

# ===========================================
# Authentication
# ===========================================
# Generate a strong secret: python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=your-64-character-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRE_HOURS=24

# Admin (created on first run if ADMIN_PASSWORD is set)
# Set to empty string to disable auto-creation
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YourStr0ng!Passw0rd

# Password policy
MIN_PASSWORD_LENGTH=8
REQUIRE_PASSWORD_COMPLEXITY=true
```

---

## 📚 API Reference

Full documentation available at `/api/docs` (Swagger UI) when running the server.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| GET | `/api/auth/me` | Get current user (includes `must_change_password` when applicable) |
| PATCH | `/api/auth/me` | Update profile; set `new_password` without current password when `must_change_password` is true |
| PATCH | `/api/auth/users/{user_id}` | Admin: update site owner name/password (`role=user`) |
| GET | `/api/sites` | List all sites |
| POST | `/api/sites` | Create new site |
| GET | `/api/sites/{site_id}` | Get site details |
| DELETE | `/api/sites/{site_id}` | Delete site |

### Chat & Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Send message (JSON) |
| POST | `/api/chat/stream` | Send message (SSE streaming) |
| POST | `/api/chat/feedback` | Submit feedback |
| POST | `/api/documents/upload` | Upload document |
| GET | `/api/documents/{site_id}` | List documents |
| DELETE | `/api/documents/{doc_id}` | Delete document |

### Crawling

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/crawl` | Start website crawl |
| GET | `/api/crawl/status/{site_id}` | Check crawl status |
| GET | `/api/sites/{site_id}/crawl-schedule` | Get schedule config |
| PUT | `/api/sites/{site_id}/crawl-schedule` | Update schedule |
| POST | `/api/sites/{site_id}/crawl-now` | Trigger immediate crawl |
| GET | `/api/sites/{site_id}/crawl-history` | Get crawl history |
| GET | `/api/sites/{site_id}/crawl-status` | Get current crawl status |

### Conversations & Analytics

All `/api/conversations/*` routes require authentication; list/search/detail respect admin vs site-owner vs **agent** site scope. Agents cannot export or delete.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/conversations` | List conversations (scoped by role) |
| GET | `/api/conversations/search` | Search by message content (scoped) |
| GET | `/api/conversations/{session_id}` | Get conversation |
| DELETE | `/api/conversations/{session_id}` | Delete conversation (not agents) |
| POST | `/api/conversations/bulk-delete` | Delete multiple conversations (not agents) |
| POST | `/api/conversations/export` | Export conversations (not agents; scoped for non-admins) |
| POST | `/api/conversations/auto-close` | Close inactive conversations (**admin only**) |
| GET | `/api/analytics/overview` | Dashboard overview |
| GET | `/api/analytics/sites/{site_id}` | Site-specific analytics |

### Triggers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sites/{site_id}/triggers` | List triggers |
| POST | `/api/sites/{site_id}/triggers` | Create trigger |
| PUT | `/api/sites/{site_id}/triggers/{id}` | Update trigger |
| DELETE | `/api/sites/{site_id}/triggers/{id}` | Delete trigger |
| GET | `/api/sites/{site_id}/triggers/analytics` | Trigger analytics |

### Human Handoff

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/handoff` | Create handoff request (re-post while pending bumps visitor queue signal) |
| POST | `/api/handoff/{handoff_id}/abandon` | Visitor abandons handoff (`session_id` in body); public, rate-limited |
| GET | `/api/handoff/{id}` | Get handoff status |
| GET | `/api/handoff/{id}/messages` | Get messages |
| POST | `/api/handoff/{id}/messages` | Send visitor message |
| POST | `/api/handoff/{id}/agent-message` | Send agent message |
| PUT | `/api/handoff/{id}/status` | Update status (claim/resolve) |
| GET | `/api/sites/{site_id}/handoff/queue` | Get agent queue (agents: unassigned + assigned to them) |
| GET | `/api/sites/{site_id}/handoff/config` | Get handoff config |
| PUT | `/api/sites/{site_id}/handoff/config` | Update handoff config |

### Lead Generation

Dashboard lead routes require auth and per-site access; agents cannot delete.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leads` | Capture a new lead (widget) |
| GET | `/api/leads/check/{site_id}/{session_id}` | Check if lead exists |
| GET | `/api/sites/{site_id}/leads` | List leads (paginated) |
| GET | `/api/sites/{site_id}/leads/export` | Export leads as CSV |
| GET | `/api/sites/{site_id}/leads/count` | Get total leads count |
| DELETE | `/api/leads/{lead_id}` | Delete a lead (not agents) |

### Q&A Training

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sites/{site_id}/qa` | Create Q&A pair |
| GET | `/api/sites/{site_id}/qa` | List Q&A pairs (paginated) |
| GET | `/api/sites/{site_id}/qa/stats` | Get Q&A statistics |
| GET | `/api/sites/{site_id}/qa/{qa_id}` | Get single Q&A pair |
| PUT | `/api/sites/{site_id}/qa/{qa_id}` | Update Q&A pair |
| DELETE | `/api/sites/{site_id}/qa/{qa_id}` | Delete Q&A pair |
| POST | `/api/sites/{site_id}/qa/from-conversation` | Create from conversation |
| POST | `/api/sites/{site_id}/qa/{qa_id}/toggle` | Toggle enabled status |

### Platform

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/platform/whitelabel` | Get white-label config |
| PUT | `/api/platform/whitelabel` | Update config (admin) |
| POST | `/api/platform/whitelabel/reset` | Reset to defaults (admin) |

## 🔌 Widget Integration

Add the chatbot to any website with a single script tag:

```html
<script 
  src="https://your-domain.com/widget/chatbot.js"
  data-site-id="YOUR_SITE_ID"
  data-api-url="https://your-domain.com/api"
  data-color="#0D9488"
  data-title="Chat with us"
  data-position="bottom-right">
</script>
```

### Widget Options

| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-site-id` | Site ID (required) | - |
| `data-api-url` | Backend API base URL (omit when the page is same-origin with the API; set when the marketing site and API use different hosts) | - |
| `data-color` | Primary theme color | `#0D9488` |
| `data-title` | Chat header title | `Chat with us` |
| `data-welcome` | Welcome message | `Hi! How can I help you?` |
| `data-position` | Widget position | `bottom-right` |

### Widget Development

The **authoritative widget code** lives at `frontend/src/widget/chatbot.js`. It is part of this repository—commit it like any other source file.

The **embeddable script** your sites load is generated under `frontend/widget/` (`chatbot.js` is obfuscated for production; `chatbot.min.js` is a lighter build). Only those built files need to be URL-served to end users; they are produced from `src/widget/`, not hand-edited.

```bash
cd frontend
npm install          # First time only
npm run build        # Regenerates frontend/widget/chatbot.js and chatbot.min.js
```

If `npm run build` fails with “Source file not found”, `frontend/src/widget/chatbot.js` is missing from your tree—restore it from git; do not rely on `widget/*.js` alone as the source of truth.

---

## 🔒 Production Security Checklist

Before deploying to production, ensure you've completed the following security steps:

### 1. Environment Configuration

```bash
# Set to production mode
ENVIRONMENT=production
DEBUG=false
```

### 2. Generate Strong JWT Secret

```bash
# Generate a secure secret
python -c "import secrets; print(secrets.token_hex(32))"

# Set in .env
JWT_SECRET=<generated-64-character-secret>
```

### 3. Configure CORS

```bash
# Only allow your specific domains
CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
TRUSTED_HOSTS=yourdomain.com,app.yourdomain.com
```

### 4. Set Strong Admin Credentials

```bash
# Use a strong password (8+ chars, uppercase, lowercase, number)
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YourStr0ng!Passw0rd

# Or disable auto-creation and create via API
ADMIN_PASSWORD=
```

### 5. Security Headers

Security headers are automatically added in production:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - Enables XSS filtering
- `Strict-Transport-Security` - Enforces HTTPS (production only)
- `Content-Security-Policy` - Controls resource loading
- `Referrer-Policy` - Controls referrer information

### 6. Widget Security

Secure your embeddable chat widget:

#### Subresource Integrity (SRI)

Use SRI hashes to ensure the widget script hasn't been tampered with:

```html
<script>
(function() {
  var s = document.createElement('script');
  s.src = 'https://yourdomain.com/widget/chatbot.js';
  s.async = true;
  s.integrity = 'sha384-YOUR_SRI_HASH';  // Get from /api/embed/security/{site_id}
  s.crossOrigin = 'anonymous';
  s.dataset.siteId = 'YOUR_SITE_ID';
  s.dataset.apiUrl = 'https://yourdomain.com';
  document.head.appendChild(s);
})();
</script>
```

To get your SRI hash:
```bash
curl https://yourdomain.com/api/embed/security/YOUR_SITE_ID
```

#### Security Tab Settings

Configure widget security in the dashboard under **Site Settings → Security**:

| Setting | Description |
|---------|-------------|
| **Enforce Domain Validation** | Only allow widget to load on whitelisted domains |
| **Allowed Domains** | List of permitted domains (supports wildcards like `*.example.com`) |
| **Require Referrer Header** | Reject API requests without a valid Referer header |
| **Rate Limit (per session)** | Maximum API requests per session per minute (10-200) |
| **Secure Embed Code** | Copy-ready embed code with SRI hash included |

#### Domain Whitelisting

Restrict where your widget can be embedded:

1. Go to your site settings in the dashboard
2. Navigate to the "Security" tab
3. Add allowed domains (supports wildcards like `*.example.com`)
4. Enable "Enforce domain validation" to reject unauthorized domains

#### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/embed/script/{site_id}` | Get embed code with optional SRI |
| `GET /api/embed/security/{site_id}` | Get security info (SRI hash, allowed domains) |

### 7. Additional Recommendations

- **HTTPS**: Always use HTTPS in production (configure via reverse proxy)
- **Database**: Use authentication for MongoDB (`MONGODB_URL=mongodb://user:pass@host:27017`)
- **Secrets**: Never commit `.env` files to version control
- **Monitoring**: Enable logging and set up alerts for security events
- **Updates**: Keep dependencies updated (`pip install --upgrade`)

---

## 🧪 Testing

The project includes **440+ tests** across backend, frontend, and end-to-end test suites.

### Quick Start

```bash
# Backend (pytest)
cd backend && pytest

# Frontend (jest)
cd frontend && npm test

# E2E (playwright)
cd e2e && npm test
```

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# Run by category
pytest tests/unit/           # Unit tests (RAG, crawler, document processing)
pytest tests/integration/    # API endpoint tests
pytest tests/security/       # Security & auth tests
pytest tests/providers/      # Provider & database tests

# Other options
pytest tests/test_auth.py              # Specific file
pytest tests/test_auth.py::TestLogin   # Specific class
pytest -v                              # Verbose output
pytest --cov=app --cov-report=html     # With coverage report
```

### Frontend Tests

```bash
cd frontend
npm test                 # Run tests
npm run test:coverage    # With coverage
npm run test:watch       # Watch mode
```

### E2E Tests

```bash
cd e2e
npm install       # First time only (also installs browser binaries)
npm test          # Run tests
npm run test:ui   # Interactive UI mode
npm run test:report   # View HTML report
```

### Test Summary

| Category | Location | Tests | Description |
|----------|----------|-------|-------------|
| Unit | `backend/tests/unit/` | 120 | RAG engine, crawler, document processor |
| Integration | `backend/tests/integration/` | 176 | REST API endpoints |
| Security | `backend/tests/security/` | 55 | Auth, JWT, input sanitization, SRI |
| Providers | `backend/tests/providers/` | 91 | LLM, embeddings, vector store, database |
| Frontend | `frontend/tests/` | 60+ | Widget and dashboard JS functions |
| E2E | `e2e/tests/` | ~25 | Full user flows (login, sites, chat) |

### Writing New Tests

| Type | Location | Pattern | Notes |
|------|----------|---------|-------|
| Backend | `backend/tests/<category>/` | `test_*.py` | Use fixtures from `conftest.py`, `@pytest.mark.asyncio` for async |
| Frontend | `frontend/tests/` | `*.test.js` | Use mocks from `setup.js` |
| E2E | `e2e/tests/` | `*.spec.js` | Follow Playwright patterns |

Mock external dependencies (MongoDB, vector store, LLM APIs) in all test types.

## 📄 License

MIT License - feel free to use this project for your own purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

<div align="center">

**[⬆ Back to Top](#-sitechat)**

Built with ❤️ using FastAPI, LangChain, and MongoDB

</div>
