# PortfolioDDD

A portfolio site for 3D artists, somewhere between Sketchfab and ArtStation. Artists upload models and renders, and visitors browse them in a circular 3D carousel. Any piece can be opened in a focus mode with a full inspector: wireframe, texture channels, matcap, and post-processing.

## Stack

| Layer    | Tech |
|----------|------|
| Frontend | React 19, TypeScript 5.9, Vite 7, Three.js 0.182, React Router |
| Backend  | Node.js 20+, Express 5, TypeScript (run with `ts-node`, ESM) |
| Data     | PostgreSQL (`pg`), SQL migrations |
| Assets   | Local disk or any S3-compatible bucket (S3, R2, MinIO...), optional CDN |
| Tooling  | zod (validation), sharp (images), gltf-transform + meshopt (models), vitest, Playwright |

## Features

- **Portfolio and viewer.** Each profile has a circular carousel of models. Focus mode adds an inspector with shading modes, texture channels, model stats, environment, tone mapping, exposure, AO, bloom, vignette and background. Artists can save a default view (camera, lighting, post-processing) that every visitor sees.
- **Upload pipeline.** Accepts GLB, glTF, FBX, OBJ, STL, `.zip` bundles, and (with Blender installed) `.blend` and USD. Everything is converted to an optimized, meshopt-compressed GLB. Processing status is shown live.
- **Renders.** A gallery per artwork with a lightbox. Images are served as responsive WebP at the size the browser needs.
- **Community.** Likes, comments, collections, follows, a following feed, notifications, and direct messages.
- **Discovery.** An explore page with trending, newest and most-liked sorting, search, tags and categories.
- **Real time.** Notifications and messages arrive instantly over Server-Sent Events. Slow polling remains as a fallback.
- **Jobs and marketplace.** Job board, hire requests, and asset listings.
- **Analytics.** Views, likes and follower charts for artists.
- **Moderation.** Reports, blocks, suspensions and an admin page. Artists can opt out of AI training: their pages and images get `noai` headers.
- **SEO and link previews.** Server-rendered `<title>`, Open Graph, Twitter and JSON-LD tags; generated 1200×630 preview images; `sitemap.xml` and `robots.txt`.

## Getting started

Requirements: Node.js 20+ and PostgreSQL 14+. Blender is optional, for `.blend` and USD uploads.

```bash
npm install
cp .env.example .env          # fill in DB_PASSWORD and JWT_SECRET
npm run migrate               # create/upgrade the schema
```

Run the backend and frontend in two terminals:

```bash
npm run start                 # API on http://localhost:3001
npm run dev                   # Vite on http://localhost:5173
```

Make an account an admin:

```bash
npm run make-admin -- <email or username>
```

`docker compose up` starts Postgres and the app together (see [docs/DOCKER.md](docs/DOCKER.md)).

### Production

`npm run build` puts the frontend in `dist/`. When `dist/` exists, the backend serves it itself, injecting per-page metadata into the HTML for link previews. Set `PUBLIC_URL` so canonical URLs, the sitemap and preview image links point at the real domain.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server |
| `npm run start` | Backend with auto-reload (`nodemon` + `ts-node`) |
| `npm run build` | Type-check (`tsc -b`) and build the frontend |
| `npm run lint` | ESLint |
| `npm run migrate` | Apply pending SQL migrations (`src/backend/db/migrations`) |
| `npm run make-admin -- <user>` | Give a user the admin role |
| `npm run storage:migrate` | Copy local `uploads/` into the configured bucket and rewrite DB URLs |
| `npm test` | Backend tests (vitest; needs a database) |
| `npm run test:frontend` | Component tests (vitest + jsdom) |
| `npm run test:all` | Both of the above |
| `npm run test:e2e` | Playwright end-to-end tests (needs both servers running) |

## Configuration

All configuration is read from `.env`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | localhost:5432 | PostgreSQL connection |
| `JWT_SECRET` | — (required) | Signs auth tokens |
| `PORT` | `3001` | Backend port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `VITE_API_URL` | `http://localhost:3001` | Backend URL baked into the frontend build |
| `PUBLIC_URL` | request origin | Public site origin for canonical URLs, sitemap, OG images |
| `STORAGE_DRIVER` | `local` | `local` (`./uploads`) or `s3` |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | — / `auto` / AWS | Bucket settings (endpoint for R2, MinIO, etc.) |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | AWS default chain | Bucket credentials |
| `S3_FORCE_PATH_STYLE` | `false` | `true` for MinIO and similar |
| `CDN_BASE_URL` | bucket URL | Public URL stored for uploaded files (CDN in front of the bucket) |
| `MAX_MODEL_UPLOAD_MB` | `300` | Model upload size limit |
| `MODEL_COMPRESSION` | `meshopt` | Geometry compression: `meshopt`, `draco` or `none` |
| `MODEL_MAX_TEXTURE_SIZE` | `4096` | Textures larger than this are downscaled |
| `BLENDER_PATH` | auto-detect | Blender executable for `.blend` and USD conversion |
| `DISABLE_RATE_LIMIT` | `false` | Turn rate limiting off (also off when `NODE_ENV=test`) |

Uploaded files are served with `Cache-Control: immutable` (names are random UUIDs). A CDN can therefore cache `/uploads`, `/img` (resized images) and `/og` (preview images) indefinitely.

## Project layout

```
src/
├── App.tsx, main.tsx          top-level state and routing
├── types/                     types shared by frontend and backend
├── frontend/
│   ├── components/            pages and UI (explore, jobs, marketplace, messages,
│   │                          analytics, moderation, sidebar, toolbar, ...)
│   ├── inspector/             model inspector, post-processing, texture channels
│   ├── three/                 glTF loader setup
│   ├── realtime/              SSE client and hooks
│   ├── contexts/, hooks/      auth and theme
│   ├── config/api.ts          backend URL and asset URL helper
│   └── utils/                 upload progress, responsive image URLs
└── backend/
    ├── server.ts, app.ts      entry point and Express wiring
    ├── routes/, controllers/, repositories/   HTTP → handlers → SQL
    ├── pipeline/              model conversion and optimization
    ├── services/              realtime (SSE + LISTEN/NOTIFY), image resizer, publisher
    ├── storage/               local / S3 file storage
    ├── seo/                   page metadata, OG images, sitemap, robots
    ├── middleware/            auth, rate limits, validation, noai
    ├── validation/            zod schemas
    ├── db/                    migrations and runner
    ├── scripts/               make-admin, migrate-storage
    └── tests/                 backend tests
e2e/                           Playwright specs
docs/                          concept and architecture write-ups
```
