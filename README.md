<p align="center">
  <img src="client/public/favicon.svg" width="80" alt="TV Recommender logo" />
</p>

<h1 align="center">TV Recommender</h1>

<p align="center">
  A full-stack TV show discovery app powered by <a href="https://www.themoviedb.org/">TMDB</a> and AI-driven natural language search via <a href="https://groq.com/">Groq</a>.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white" alt="NestJS 10" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" alt="Docker Compose" />
</p>

---

## Features

🔍 **Search** — Find TV shows by name using the TMDB database

🤖 **AI Recommendations ** — Describe what you're in the mood for in plain English and get smart recommendations powered by Groq LLM + TMDB deep validation

📺 **Watchlist** — Save shows, mark them as watched, and manage your personal list

📋 **Reference-Based Discovery** — Select shows from your watchlist as taste references and the AI finds similar content (works even without a text query)

📄 **Show Details** — View cast, trailers, keywords, seasons, and more for any show

🔐 **Authentication** — JWT-based registration and login with secure password hashing

---

## AI Recommendation Architecture — Title-First Pipeline

The natural language search (`POST /api/tv/discover-natural`) uses a **Title-First** architecture. Instead of translating a user query into abstract TMDB filter parameters, the system asks the LLM to brainstorm real show titles, then uses TMDB as a strict fact-checker.

### Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                                │
│  query: "funny sitcoms on Netflix"                                  │
│  referenceShows: [{ name: "The Office", tmdb_id: 2316 }]           │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STEP 1 — LLM BRAINSTORM                          │
│  Groq (Llama 3.3 70B) receives the query + reference show names.    │
│  Returns structured JSON:                                           │
│    • hard_filters (provider, region, language, country, genres,      │
│      year range, networks, companies, runtime, status)              │
│    • candidate_titles (30–40 real TV show titles with years)        │
│                                                                     │
│  Key prompt rules:                                                  │
│    • PLATFORM AWARENESS — bias toward platform catalog              │
│    • SEPARATE REGION FROM CONTENT — "Netflix Israel" ≠ Israeli shows│
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│               STEP 2 — RESOLVE FILTER IDs (parallel)                │
│  Provider names → TMDB provider IDs    ┐                            │
│  Genre names    → TMDB genre IDs       ├─ via Promise.all()        │
│                                        ┘                            │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│          STEP 3 — TMDB SEARCH + FULL DETAILS (2-phase fetch)        │
│                                                                     │
│  Phase A: Title → ID                                                │
│    search/tv?query=<title>  →  extract first result ID              │
│    (cached in titleToId map)                                        │
│                                                                     │
│  Phase B: ID → Full Object + Providers (single call)                │
│    tv/{id}?append_to_response=watch/providers                       │
│    (cached in fullShows map)                                        │
│                                                                     │
│  Both phases run concurrently across all titles.                    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 4 — RUTHLESS HARD-FACT VALIDATION                 │
│  Each full TMDB object is checked against ALL hard_filters:         │
│                                                                     │
│    ✓ Origin country          ✓ Original language                    │
│    ✓ Excluded genres         ✓ Year range (min/max)                 │
│    ✓ Show status             ✓ Episode runtime (min/max)            │
│    ✓ Networks (include/exclude)                                     │
│    ✓ Production companies (include/exclude)                         │
│    ✓ Watch providers (flatrate/rent/buy per region)                 │
│                                                                     │
│  Shows that fail ANY check are dropped.                             │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                STEP 5 — PAYLOAD TRIMMING                            │
│  Full TMDB objects are mapped to a lightweight shape:               │
│    id, name, overview, poster_path, backdrop_path,                  │
│    first_air_date, vote_average, genre_ids,                         │
│    origin_country, original_language, watch/providers               │
│                                                                     │
│  Top 20 results returned to the client.                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Caching Strategy

The service maintains an in-memory `IdCache` that eliminates redundant TMDB API calls across requests:

| Cache | Key | Value | Purpose |
|-------|-----|-------|---------|
| `titleToId` | lowercase title string | TMDB show ID | Skip `search/tv` for known titles |
| `fullShows` | TMDB show ID | Full details + providers object | Skip `tv/{id}?append_to_response` for known IDs |
| `genres` | genre name | genre ID | Fetched once, reused forever |
| `providers` | `REGION:name` | provider ID | Fetched once per region |
| `keywords` | keyword name | keyword ID | Accumulated over time |

This means popular shows like "Breaking Bad" or "The Office" cost zero API calls on repeat queries.

### Input Modes

The pipeline supports three input modes:

| Mode | query | referenceShows | Behavior |
|------|-------|----------------|----------|
| Text only | `"dark sci-fi"` | `[]` | LLM brainstorms from the text description |
| Text + References | `"on Netflix"` | `[The Office, Parks and Rec]` | LLM uses references as stylistic anchors while obeying the text constraints |
| References only | `""` | `[Breaking Bad, Ozark]` | LLM brainstorms exclusively from the reference shows' tone and genre |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 8, React Router 6, MUI 7 |
| Backend | NestJS 10, TypeORM, Passport JWT |
| Database | PostgreSQL 16 |
| AI / LLM | Groq API (Llama 3.3 70B) |
| External Data | TMDB API v3 |
| Infrastructure | Docker Compose, Nginx |

## Project Structure

```
├── client/                 # React SPA (Vite)
│   ├── src/
│   │   ├── components/     # Shared components (ProtectedRoute)
│   │   ├── context/        # Auth context provider
│   │   ├── pages/          # Route pages (Login, Register, Watchlist, Preferences, ShowDetails)
│   │   ├── types/          # TypeScript type definitions
│   │   ├── utils/          # Utility functions
│   │   ├── TvSearch.tsx    # Main search page
│   │   └── App.tsx         # Router & app shell
│   └── Dockerfile
│
├── server/                 # NestJS API
│   ├── src/
│   │   ├── auth/           # Authentication (JWT, guards, strategies)
│   │   ├── tv/             # TV search, discover, natural language orchestration
│   │   ├── users/          # User entity & service
│   │   ├── watchlist/      # Watchlist CRUD
│   │   └── app.module.ts   # Root module
│   └── Dockerfile
│
├── docker-compose.yml      # Production stack
└── docker-compose.dev.yml  # Dev DB only
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Docker](https://www.docker.com/) & Docker Compose
- A [TMDB API](https://developer.themoviedb.org/) bearer token
- A [Groq API](https://console.groq.com/) key (for AI-powered search)

### 1. Clone the repo

```bash
git clone https://github.com/your-username/tv-recommender.git
cd tv-recommender
```

### 2. Configure environment variables

```bash
# Server
cp server/.env.example server/.env
# Edit server/.env and fill in:
#   TMDB_BEARER_TOKEN=your_tmdb_token
#   GROQ_API_KEY=your_groq_key
#   JWT_SECRET=a-strong-random-secret

# Client
cp client/.env.example client/.env
# Default API URL is http://localhost:3000/api — adjust if needed
```

### 3. Run with Docker (recommended)

```bash
# Full stack (DB + Server + Client)
docker compose up --build

# App available at http://localhost:8080
# API available at http://localhost:3000
```

### 4. Run locally for development

```bash
# Start only the database
docker compose -f docker-compose.dev.yml up -d

# Server
cd server
npm install
npm run start:dev

# Client (in a separate terminal)
cd client
npm install
npm run dev
```

The client dev server runs at `http://localhost:5173` and the API at `http://localhost:3000`.

## API Overview

All endpoints (except auth) require a `Bearer` token in the `Authorization` header.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Log in and receive a JWT |
| `GET` | `/api/auth/me` | Get current user profile |
| `GET` | `/api/tv/search?query=` | Search shows by name |
| `GET` | `/api/tv/discover` | Discover shows with filters |
| `POST` | `/api/tv/discover-natural` | AI-powered natural language search |
| `GET` | `/api/tv/:id` | Get show details |
| `GET` | `/api/tv/:id/videos` | Get show trailers/videos |
| `GET` | `/api/watchlist` | List user's watchlist |
| `POST` | `/api/watchlist` | Add show to watchlist |
| `PATCH` | `/api/watchlist/:showId/watched` | Toggle watched status |
| `DELETE` | `/api/watchlist/:showId` | Remove from watchlist |

## License

This project is for personal/educational use. TV data provided by [TMDB](https://www.themoviedb.org/). AI inference powered by [Groq](https://groq.com/).
