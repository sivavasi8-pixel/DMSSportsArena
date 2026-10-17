# DMS Sports Arena

Mobile-first PWA for booking cricket nets and bowling-machine slots, with an admin panel.
Built from [PLAN.md](PLAN.md): React + Vite + Tailwind (`web/`), Express + Prisma + Postgres (`api/`).
One Render web service serves both; the database is a Neon project.

## Run locally
```bash
npm --prefix api i && npm --prefix web i
npm run dev:db          # throwaway Postgres on :54329 (keep running)
cd api && npx prisma migrate deploy && npm run seed && cd ..
npm run dev:api         # API on :3100
npm run dev:web         # app on http://localhost:5173
```
Seeded owner login: mobile `9999999999`, PIN `482916` (forced to change at first login; see `api/.env`).
Tests (incl. 20 parallel holds for one slot): `npm test` (needs the dev DB + seed).

## Deploy (free)
1. Neon: new project, region AWS Singapore. Copy the pooled string → `DATABASE_URL`, the direct string → `DIRECT_URL`.
2. Push to GitHub, create a Render Blueprint from `render.yaml`, fill `DATABASE_URL`, `DIRECT_URL`, `WEB_ORIGIN`.
3. Run `npm --prefix api run seed` once with the production env to create the owner, then log in and change the PIN.
4. cron-job.org: `GET https://<your-app>/api/health` every 10 min, 5 AM–11 PM IST (the endpoint never touches the DB, so Neon can sleep).
5. Add repo secret `DIRECT_URL` to enable the weekly backup workflow.
6. Admin → Venue & Photos: address, map embed, UPI ID, photos. Admin → Resources & Pricing: hours and prices.

## Notes
- Double-booking is prevented by a partial unique index on active bookings (see the migration), not just app code.
- Times are IST wall-clock strings (`HH:MM`) with `DATE` columns; holds expire after 5 minutes.
- Photos are compressed in the browser and stored as `bytea` in Postgres (no Supabase needed).
