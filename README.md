# PortfolioDDD

A portfolio site for 3D artists. Artists upload their models and renders, and visitors browse them in a 3D carousel. Any model can be opened in an inspector to view its wireframe, textures and lighting.

## Features

- Upload models in GLB, glTF, OBJ or STL, or as a .zip with their textures. The server converts each one to an optimized GLB.
- A 3D carousel for each portfolio.
- An inspector with shading modes, texture channels, model stats and post-processing. Artists can save a default view for each model.
- Render galleries with a lightbox and responsive images.
- Drafts, scheduled publishing, and public, unlisted or private artworks.
- Likes, comments, collections, follows and a following feed.
- An explore page with trending, newest and most-liked sorting, search, tags and categories.
- Direct messages and hire requests, encrypted at rest, with a "who can message me" setting, limits on messages from strangers, and reporting.
- Real-time notifications and messages.
- A job board and an asset marketplace.
- Analytics for artists: views, likes and followers.
- Moderation: reports, blocking, suspensions and an admin page.
- An opt-out from AI training for artists' work.
- Account security: email verification, password reset and two-factor sign-in.
- Custom domains for artist profiles.
- English, Bosnian and German interface languages.
- Link previews and SEO: page metadata, preview images and a sitemap.

## Tech stack

- Frontend: React, TypeScript, Vite, Three.js
- Backend: Node.js, Express, PostgreSQL
- Models: gltf-transform and meshopt

## Getting started

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env    # set DB_PASSWORD and JWT_SECRET
npm run migrate
```

Run the backend and frontend in two terminals:

```bash
npm run start    # API on http://localhost:3001
npm run dev      # app on http://localhost:5173
```

Or start everything with Docker:

```bash
docker compose up
```

Before deploying publicly, also set `MESSAGE_ENCRYPTION_KEY` and `REQUIRE_EMAIL_VERIFICATION=true` (see `.env.example`). Then run `npm run messages:encrypt` once to encrypt messages stored before encryption existed.

## Tests

```bash
npm test                 # backend (needs PostgreSQL)
npm run test:frontend    # frontend
npm run test:e2e         # end-to-end
```

## Learn more

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the project is built.
