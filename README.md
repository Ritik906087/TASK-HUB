# TASK HUB

Full-stack Task Earning Web, PWA & Android WebView Platform built with **React + Vite + Tailwind CSS + Express + PostgreSQL (Drizzle ORM)**.

- **Admin Panel Route:** `/adm7870` (Default credentials: `admin` / `Admin@123456` unless overridden via `ADMIN_DEFAULT_PASSWORD`)

---

## Required Environment Variables

Set these in your hosting dashboard before deploying:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (or use `SQL_HOST`, `SQL_USER`, `SQL_PASSWORD`, `SQL_DB_NAME`) |
| `JWT_SECRET` | Random secret for user auth tokens |
| `ADMIN_JWT_SECRET` | Random secret for admin auth tokens |
| `APP_ENCRYPTION_KEY` | 32-char secret for encrypting bank/UPI payout details |
| `ADMIN_DEFAULT_PASSWORD` | Initial admin password for `/adm7870` |
| `APP_URL` | Public URL of your deployed site |

---

## Deployment Guides

### 1. Render (Recommended Full-Stack + PostgreSQL)
Configured via `render.yaml`:
1. In Render Dashboard, click **New → Blueprint** and select `Ritik906087/TASK-HUB`.
2. Render automatically creates the Node.js Web Service + managed PostgreSQL database (`task-hub-db`).
3. Once deployed, push the schema once from your shell or Render shell:
   ```bash
   npx drizzle-kit push
   ```

### 2. Vercel (Full-Stack Serverless)
Configured via `vercel.json` + `api/index.ts`:
1. Import `Ritik906087/TASK-HUB` in Vercel.
2. Add a PostgreSQL database (Vercel Postgres / Neon / Supabase) and set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_JWT_SECRET`, `APP_ENCRYPTION_KEY`, `ADMIN_DEFAULT_PASSWORD`.
3. Deploy — `/api/*` automatically routes to `api/index.ts` and `/adm7870` & `/register` serve the SPA.

### 3. Netlify (Frontend + Netlify Functions)
Configured via `netlify.toml` + `netlify/functions/api.ts`:
1. Connect `Ritik906087/TASK-HUB` in Netlify.
2. Build command: `npm run build` · Publish directory: `dist` · Functions directory: `netlify/functions`.
3. Add `DATABASE_URL` and secrets under **Site configuration → Environment variables**.

### 4. Cloudflare Pages
Configured via `wrangler.toml`, `functions/api/[[path]].ts`, and `public/_redirects`:
1. Connect `Ritik906087/TASK-HUB` in **Cloudflare Dashboard → Workers & Pages → Create → Pages**.
2. Build command: `npm run build` · Build output directory: `dist`.
3. Set `BACKEND_API_URL` (e.g. your Render backend URL) under **Settings → Environment Variables** so `/api/*` proxies seamlessly to your PostgreSQL backend.
   *(Optionally set `ALLOWED_ORIGINS` on your Render backend to your `*.pages.dev` URL.)*

---

## Download Android APK from GitHub

Every push to `main` automatically builds `TASK-HUB.apk` via `.github/workflows/build-apk.yml`:
- **GitHub Releases:** `https://github.com/Ritik906087/TASK-HUB/releases`
- **GitHub Actions:** Open the **Actions** tab → latest **Build Android APK** run → download `TASK-HUB-apk`.
- To point the APK to a custom Render/Vercel/Netlify/Cloudflare URL, set Repository Variable `APP_URL` under **Settings → Secrets and variables → Actions → Variables** and re-run the workflow.
