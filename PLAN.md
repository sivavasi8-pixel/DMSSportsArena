

# Cricket Nets Booking App – Implementation Plan
 · 

## Overview
Build one mobile-first web app (installable on phones as a PWA) where players book net lanes and bowling-machine slots, and the owner runs everything from an admin panel. It costs nothing to host: React and an Express API on one Render web service, and the database and venue photos in a new free Neon project.
What the first release must do:
Players sign up with name, mobile and a few details, then log in with mobile number or username plus a 4 or 6 digit PIN.
Players see a live slot grid, book a net or bowling machine, pay by UPI or at the nets, and see upcoming and past bookings.
A booked slot turns grey for everyone immediately; two people tapping the same slot can never both get it.
Admin sees who booked what, blocks slots, manages nets and machines, prices, users, PIN resets, payments, location and photos.
Players see the nets' location, map link and photo gallery right after login.
Glossary used below: a resource is anything bookable (Net 1, Net 2, Bowling Machine 1). A slot is one resource for one time window on one date (Net 2, 18 Oct, 6:00–7:00 PM).

## Tech stack and free hosting
Keep your app on Render, but put the database on Neon (your existing account, a new project for this app): Render's free Postgres is deleted after 30 days, so it cannot hold real bookings. Render free docs state that free Postgres databases expire 30 days after creation, have 1 GB storage and no backups, and that free web services sleep after 15 minutes without traffic.
|  
Layer 
Choice 
Free limit / note
|  
Frontend 
React + Vite + TypeScript, Tailwind CSS, shadcn/ui, Framer Motion, lucide-react icons 
Built into the API service as static files (one URL, simplest for login cookies); a separate Render Static Site works once you have your own domain
|  
Backend API 
Node.js + Express + TypeScript, Zod validation, Prisma ORM 
Render free Web Service; sleeps after 15 min idle (fix below)
|  
Database 
Neon Postgres 
Each free project gets its own 0.5 GB storage and 100 CU-hours a month; sleeps after 5 min idle and wakes on the next query
|  
Photo storage 
Supabase Storage (public bucket nets-photos) 
Venue photos stored in Neon (bytea, compressed under 200 KB) and served by the API with caching; 30 photos use about 6 MB
|  
Keep-awake 
cron-job.org pinging /api/health every 10 min, 5 AM–11 PM IST 
Keeps the Render API warm in opening hours. /api/health must NOT query the database, so Neon still sleeps and saves compute hours
|  
Maps 
Google Maps embed URL + "Open in Maps" deep link 
No API key or billing needed
|  
Code + CI 
GitHub, auto-deploy to Render on push to main 
Free
Neon free-plan figures are from Neon's free plan FAQ. Each Neon project has its own quota, so this app does not eat into your other apps' limits. A small nets business will use well under 50 MB of database in its first year. Supabase is a fine alternative if you ever want built-in file storage and realtime.
Why a separate Express API instead of calling Supabase straight from the browser: PIN login is custom (Supabase Auth expects email or OTP), and booking rules, admin rights and payment checks are safer enforced in one server you control. The browser never sees the Supabase service key.
Make it a PWA (vite-plugin-pwa): players tap "Add to Home Screen" and it opens full-screen like a native app, with no Play Store fees.

## Roles, login and security
One login screen serves everyone: a single "Mobile number or username" box plus a PIN keypad. The server reads the user's role and sends admins to /admin and players to /home.
Roles
|  
Role 
Can do
|  
user (player) 
Book and cancel own slots, see own history, view location and photos, edit own profile, change own PIN
|  
admin 
Everything: all bookings, block or unblock slots, manage resources, prices and timings, all users, PIN resets, payment status, location, photos, reports
|  
super_admin (owner) 
Same as admin, plus create or remove other admins. Seeded once from a script, never via signup
Signup fields: full name, mobile (10 digits, unique), username (optional, unique, 3–20 chars, letters/digits/underscore), PIN (4 or 6 digits, entered twice), plus optional email, date of birth, playing role (batsman / bowler / all-rounder / keeper), and skill level. Keep optional fields on a second step so signup takes under 30 seconds.
How login resolves the user ID: if the input is 10 digits, look up by mobile; otherwise look up by username (case-insensitive). Mobile numbers are always unique, so users can log in either way.
Keeping a short PIN safe (a 4-digit PIN has only 10,000 combinations, so these are required, not optional):
Store only a bcrypt hash of the PIN (cost 10), never the PIN itself.
Lock the account for 15 minutes after 5 wrong PINs; also rate-limit the login endpoint per IP (express-rate-limit, 10 tries per 15 min).
Block weak PINs at signup: 0000, 1234, 1111-style repeats, and the last 4 or 6 digits of their own mobile number.
Issue a JWT in an httpOnly, Secure, SameSite cookie, 30-day expiry for players and 12 hours for admins.
Admins must use a 6-digit PIN.
Serve everything over HTTPS (Render does this by default).
Forgot PIN: free SMS OTP is not reliable, so the flow is a "Forgot PIN" button that tells the player to contact the nets; the admin resets it from the Users screen, which sets a temporary PIN and forces a change at next login. Add WhatsApp or SMS OTP later if you choose a paid provider.

## Data model
Nine tables cover every feature; nets and bowling machines share one resources table so both book the same way. All times are stored in UTC and shown in IST (Asia/Kolkata).
|  
Table 
Key columns 
Notes
|  
users 
id, full_name, mobile (unique), username (unique, nullable), pin_hash, role, email, dob, playing_role, skill_level, is_active, must_change_pin, failed_attempts, locked_until, created_at 
Admins are users with role admin
|  
resources 
id, name, type (net / bowling_machine), description, surface (turf / mat / astro), is_active, sort_order 
"Net 1", "Net 2", "Bowling Machine 1"
|  
operating_hours 
id, resource_id (nullable = all), day_of_week, open_time, close_time, slot_minutes 
Default 60-minute slots; 30 allowed
|  
pricing_rules 
id, resource_type, day_type (weekday / weekend), start_time, end_time, price_inr 
Lets evening and weekend slots cost more
|  
bookings 
id, booking_code, user_id, resource_id, slot_date, start_time, end_time, status (held / confirmed / cancelled / completed / no_show), hold_expires_at, amount_inr, payment_mode (upi / at_nets), payment_status (pending / verification / paid / refunded), upi_ref, notes, created_by, created_at 
booking_code like NB-241018-0042
|  
slot_blocks 
id, resource_id (nullable = all), block_date, start_time, end_time, reason, created_by 
Maintenance, coaching, rain, private event
|  
venue_settings 
single row: venue_name, address, map_embed_url, map_link, lat, lng, contact_phone, whatsapp, upi_id, upi_payee_name, cancellation_hours, max_advance_days, max_bookings_per_day 
Edited from admin Settings
|  
venue_photos 
id, url, caption, sort_order, is_cover 
Image bytes in an image_data column (bytea)
|  
audit_logs 
id, actor_id, action, entity, entity_id, details (JSON), created_at 
Who blocked, cancelled, reset a PIN, marked paid
The constraint that prevents double booking (put this in a Prisma migration as raw SQL):
Cancelled and expired rows are ignored by the index, so a freed slot can be booked again, but the database itself rejects any second active booking for the same slot, whatever the app code does.

## Booking engine
Slots are not stored in advance; the API generates them on request from operating hours, then marks each one from bookings and blocks. This means changing timings or adding Net 3 needs no data migration.
Slot states shown on the grid
|  
State 
Colour 
Who sees it 
Tappable
|  
Available 
Green outline, price shown 
Everyone 
Yes
|  
Selected by you 
Solid green with tick 
The player selecting 
Yes (deselect)
|  
Held by someone else (paying) 
Amber, "Being booked" 
Everyone else 
No
|  
Booked 
Grey, struck 
Everyone; admin also sees name + mobile 
No (admin: opens booking)
|  
Blocked by admin 
Grey hatched with reason ("Maintenance") 
Everyone 
No (admin: unblock)
|  
Past 
Faded 
Everyone 
No
Same slot, same moment: the hold-then-confirm rule
Player taps slots (multi-select up to max_bookings_per_day, across nets and machines) and presses Continue.
The API opens a database transaction and inserts one held row per slot with hold_expires_at = now + 5 minutes. The unique index lets only the first insert win.
The second player gets HTTP 409 with the clashing slots; the app shows "Someone just grabbed Net 2, 6 PM", refreshes the grid, and keeps their other selections.
The winner sees a 5-minute countdown on the checkout screen, chooses UPI or Pay at nets, and confirms. Status becomes confirmed.
If they leave or time runs out, a job deletes expired holds every minute (node-cron in the API, plus a check on every slot read so an expired hold never blocks anyone even if the job missed).
All slots in one checkout succeed or fail together, so nobody pays for half a booking.
If A's 5-minute timer runs out without confirming, the hold is deleted and the slot turns green again for everyone.
Live grey-out: the slot page re-fetches every 10 seconds while open and immediately after any 409, so other players see a slot turn grey within seconds. Upgrade path: switch to Supabase Realtime subscriptions on bookings later for instant updates.
Admin blocking: admin picks resource(s) (or All), date range, time range and a reason. Blocking a slot that already has a booking warns first and offers "Block and cancel bookings", which notifies the affected players via a WhatsApp share link. Recurring blocks (every Monday 6–8 AM coaching) are a later enhancement.
Business rules (all editable in Settings)
Book up to 14 days ahead; no bookings for slots that have started.
Player cancels free up to 4 hours before start; after that only admin can cancel.
Max 3 slots per player per day to stop one person hogging evenings.
Admin can create a booking for a walk-in or phone customer, choosing an existing user or creating one on the spot.
Admin can mark completed or no_show after the slot; repeated no-shows are visible on the user profile.

## Payments
Start with free direct UPI to your own UPI ID, verified by the admin; add a payment gateway only if manual checking becomes a burden. Gateways such as Razorpay charge a per-transaction fee, so they are not free.
Option A: Pay by UPI (free)
Checkout builds a UPI intent link: upi://pay?pa=<upi_id>&pn=<payee_name>&am=<amount>&cu=INR&tn=<booking_code>.
On a phone, a "Pay with UPI app" button opens GPay, PhonePe or Paytm with amount and booking code filled in. On a laptop, show the same link as a QR code (qrcode.react).
After paying, the player enters the 12-digit UTR / transaction ID (optional screenshot upload). Status becomes verification.
Admin sees a "Payments to verify" list, matches the UTR against the bank app, and taps Mark paid. Unverified UPI bookings stay confirmed; admin decides on disputes.
Option B: Pay at nets
Booking is confirmed with payment status pending. At the nets, the admin opens Today's bookings and taps Paid (cash) or Paid (UPI at counter). The booking card shows a "Pay at nets" badge so staff know to collect.
Later, if volume grows: Razorpay or Cashfree checkout with webhook auto-confirmation; the hold-then-confirm flow above already fits a gateway, because the slot is held while the player pays.
Admin reports: daily and monthly collection split by UPI, cash and pending, exportable as CSV.

## Screens and UI design
Design for a phone held in one hand first, since most players will book from WhatsApp-style habits on mobile; the admin panel also works on a laptop at the counter.
Visual direction
Colours: deep pitch green #0F5132 as primary, fresh turf green #22C55E for available, cricket-ball red #DC2626 for errors and cancel, warm cream #FAF7F0 background, slate text. Full dark mode with a toggle.
Type: "Poppins" for headings, "Inter" for body (Google Fonts, free).
Shapes: 16 px rounded cards, soft shadows, a bottom tab bar on mobile (Home, Book, My Bookings, Profile), sidebar on desktop admin.
Motion: Framer Motion for slot select pop, sheet slide-up checkout, confetti burst on confirmation (canvas-confetti).
Feedback: skeleton loaders instead of spinners, toast messages (sonner), haptic vibration on slot tap where supported.
Imagery: your own nets photos as the hero; empty states with simple cricket illustrations (unDraw, free).
Player screens
|  
Screen 
What it shows
|  
Splash + Login 
Logo, one ID field, big numeric PIN keypad with dots, "New here? Sign up", "Forgot PIN"
|  
Signup (2 steps) 
Step 1 name, mobile, username, PIN twice; step 2 optional details
|  
Home 
Greeting, hero photo carousel, "Book a Net" and "Book Bowling Machine" cards, next upcoming booking card with countdown, location card with mini map and Directions / Call / WhatsApp buttons
|  
Book 
Horizontal date strip (14 days), toggle Nets / Bowling Machine, grid with resources as columns and times as rows, price on each available cell, sticky bottom bar "2 slots · ₹1,200 · Continue"
|  
Checkout sheet 
Slot summary, 5-minute hold timer, payment choice (UPI / Pay at nets), UPI button or QR, UTR input, Confirm
|  
Confirmation 
Booking code, details, Add to Google Calendar, Share on WhatsApp, Directions
|  
My Bookings 
Tabs Upcoming / Past / Cancelled; each card with status and payment badges, Cancel (within window), Book again
|  
Venue 
Full photo gallery with lightbox, embedded map, address, timings, contact
|  
Profile 
Edit details, change PIN, dark mode, logout
Admin screens
|  
Screen 
What it shows
|  
Dashboard 
Today's bookings count, revenue today and this month, occupancy %, payments to verify, next 3 slots, 7-day bookings chart (Recharts)
|  
Live Schedule 
Same grid as players but every cell shows player name and mobile; tap to view, mark paid, cancel, move or mark no-show; drag-select empty cells to block or create a booking
|  
Bookings 
Searchable, filterable table (date, resource, status, payment), CSV export
|  
Block slots 
Form + list of upcoming blocks with Unblock
|  
Users 
Search by name / mobile / username; profile with booking history, no-show count; actions: edit, deactivate, reset PIN, unlock, make admin
|  
Payments 
To-verify queue with UTR, mark paid / reject; collection report
|  
Resources & Pricing 
Add, rename, disable nets and machines; opening hours; slot length; price rules
|  
Venue & Photos 
Address, map link, contact, UPI ID; drag-and-drop photo upload with reorder, caption, cover photo
|  
Settings & Audit log 
Booking rules; list of every admin action
Before coding, ask Claude to produce the Login, Book and Admin Live Schedule screens as design mockups, approve the look, then build against them.

## API endpoints
All routes sit under /api; anything under /api/admin checks role in the JWT and returns 403 otherwise. Every write validates input with Zod and writes an audit log for admin actions.
|  
Area 
Method + path 
Purpose
|  
Auth 
POST /auth/signup 
Create player, set cookie
|  
Auth 
POST /auth/login 
{identifier, pin}; mobile or username
|  
Auth 
POST /auth/logout, GET /auth/me 
Session
|  
Auth 
POST /auth/change-pin 
Old + new PIN; also used after admin reset
|  
Venue 
GET /venue 
Settings, map, contact, photos
|  
Slots 
GET /slots?date=YYYY-MM-DD&type=net 
Generated grid with state per cell; admin gets player details
|  
Bookings 
POST /bookings/hold 
{slots:[{resourceId, date, start}]} → holds or 409 with clashes
|  
Bookings 
POST /bookings/confirm 
{holdIds, paymentMode, upiRef?}
|  
Bookings 
DELETE /bookings/hold/:id 
Release when player backs out
|  
Bookings 
GET /bookings/me?tab=upcoming 
History
|  
Bookings 
POST /bookings/:id/cancel 
Within cancellation window
|  
Admin 
GET /admin/dashboard 
Counters + chart data
|  
Admin 
GET, POST, PATCH /admin/bookings 
List, create for walk-in, change status / payment / move
|  
Admin 
GET, POST, DELETE /admin/blocks 
Manage blocks
|  
Admin 
GET, PATCH /admin/users, POST /admin/users/:id/reset-pin, /unlock 
User management
|  
Admin 
CRUD /admin/resources, /admin/hours, /admin/pricing 
Setup
|  
Admin 
PATCH /admin/venue; POST, PATCH, DELETE /admin/photos 
Venue and gallery (upload to the API, stored compressed in Neon)
|  
Admin 
GET /admin/reports/collections?from&to, /admin/audit 
Reports, CSV
|  
System 
GET /health 
For the keep-awake ping

## Phased build plan with Claude
Build in seven phases, each ending in something you can click and test; give Claude one phase at a time, not the whole app at once. Put this document in the repo as PLAN.md and start every Claude session with "Read PLAN.md, then do Phase N". Using Claude Code on your repo works best because it can run, test and fix the code itself.
Setup — Monorepo cricket-nets/ with web/ (Vite React TS, Tailwind, shadcn/ui) and api/ (Express TS, Prisma). Supabase project, .env.example, Prisma schema from the Data model section, seed script (2 nets, 1 bowling machine, hours 6 AM–10 PM, sample prices, one super admin). Done when: both run locally and the seed works.
Auth — Signup, login by mobile or username + PIN, bcrypt, lockout, rate limit, JWT cookie, /auth/me, route guards for player and admin, Login and Signup screens with the PIN keypad. Done when: wrong PIN 5 times locks the account; an admin lands on /admin.
Slots and booking (the core) — Slot generation, unique index, hold → confirm → cancel, expired-hold cleanup, 409 handling, Book screen grid, checkout sheet with timer, confirmation, My Bookings. Done when: two browsers racing for one slot gives exactly one winner (write an automated test that fires 20 parallel holds).
Payments — UPI intent link + QR, UTR entry, pay-at-nets badge, admin verify queue. Done when: a test payment of ₹1 to your own UPI ID flows to Paid.
Admin panel — Dashboard, Live Schedule with names, Bookings table, Block slots, Users with PIN reset, Resources & Pricing, Settings, audit log.
Venue and polish — Venue settings, photo upload stored in Neon with client-side compression (browser-image-compression), gallery, map embed, Home screen, dark mode, animations, PWA manifest and icons, empty and error states.
Hardening and launch — Input validation everywhere, helmet, CORS locked to your domain, error logging, timezone tests around midnight IST, Lighthouse score above 90 on mobile, deploy, keep-awake cron, backups (below).
Starter prompt for Phase 1 (copy and adapt for later phases):
Tips for working with Claude: commit to GitHub after every phase so you can roll back; when something breaks, paste the exact error; ask for tests on the booking logic specifically; and review each phase in the browser on your phone before moving on.

## Deployment and go-live
Deploy one Render web service (API + built React app) from one GitHub repo, pointing at Supabase, and add a free ping so the API stays awake during opening hours.
Deployment steps
Neon: create a new project for this app in the AWS Singapore region (closest to India); copy the pooled connection string (host contains -pooler, add sslmode=require) as DATABASE_URL and the direct one as DIRECT_URL for Prisma migrations; no file bucket needed, photos live in the database.
Render Web Service nets-api: root api/, build npm ci && npx prisma migrate deploy && npm run build, start node dist/index.js, region Singapore; env vars DATABASE_URL, DIRECT_URL, JWT_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY, WEB_ORIGIN.
Optional, once you own a domain: Render Static Site nets-web: root web/, build npm ci && npm run build, publish dist, rewrite rule /* → /index.html, env VITE_API_URL.
Cookies across two onrender.com subdomains are blocked by browsers, so either serve the web app from the API service (Express serves web/dist, one URL) or put both on your own domain (app.yournets.in and api.yournets.in). Serving both from one service is the simplest free option.
cron-job.org: GET /api/health every 10 minutes, 5 AM–11 PM IST.
Run the seed once to create the super admin; log in and change the PIN.
Watch-outs on the free plan
Neon's free plan only keeps a 6-hour restore window: add a weekly GitHub Action that runs pg_dump and stores the file as a private artifact, or export CSVs from admin.
Render free web services get a fixed monthly allowance of instance hours; one always-on service fits, a second one may not.
Neon free compute is 100 CU-hours per project per month (about 400 hours at the smallest size). Let it sleep between bookings; never point the keep-awake ping at a database query.
A custom domain (about ₹800/year for .in) is the only thing worth paying for; it makes cookies, sharing and trust easier.
Go-live checklist
Super admin PIN changed, test users deleted
Real resources, hours and prices entered
UPI ID tested with a ₹1 booking
Location, map link and at least 5 photos uploaded
Two-phone race test on the same slot passes
Booking at 11:30 PM for tomorrow shows the right date
Installed as PWA on Android and iPhone
QR code poster at the nets linking to the app
Backup job ran once successfully
After launch (phase 2 ideas): WhatsApp reminders 2 hours before the slot, monthly memberships and slot packs, coaching sessions, recurring blocks, Razorpay auto-confirm, and a waitlist for full evenings.
Sources: Render — Deploy for Free · Supabase free tier limits 2026