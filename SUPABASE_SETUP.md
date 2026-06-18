# Art with Nia — Supabase setup

The site reads its works (paintings for sale) from a Supabase table called
`works`. You add and edit pieces in the **Supabase dashboard → Table Editor** —
no code changes needed once it's connected. Until you paste your credentials,
the site falls back to the built-in sample works, so it always renders.

There are **3 one-time steps**.

---

## 1. Run the database setup

In your Supabase project → **SQL Editor** → paste and run the whole block below.
It creates the `works` table, makes it publicly *readable* (but not writable),
creates a public image bucket, and seeds the 8 sample works so your gallery
isn't empty.

```sql
-- ── Works table ─────────────────────────────────────────────
create table if not exists public.works (
  id            text primary key,             -- url slug, e.g. 'salt-ember'
  sort          int  not null default 0,      -- display order (low = first)
  title         text not null,
  year          int,
  medium        text,
  size          text,
  description   text,
  type          text not null default 'buynow',  -- 'auction' | 'buynow'
  image_url     text,                          -- public URL from Storage (optional)
  palette       jsonb,                         -- ["#hex","#hex","#hex"] fallback art
  variant       text,                          -- 'field' | 'orb' | 'strata' | 'veil'
  price         numeric,                       -- buy-now pieces
  current_bid   numeric,                       -- auctions
  bids          int default 0,                 -- auctions
  closes_at     timestamptz,                   -- auctions
  min_increment numeric default 100,           -- auctions
  buy_now       numeric,                       -- optional buy-now price on an auction
  ended         boolean default false,         -- auctions (auto-true once closes_at passes)
  final_price   numeric,                       -- ended auctions
  history       jsonb default '[]'::jsonb,     -- optional bid history
  created_at    timestamptz default now()
);

-- ── Public can READ works, nobody can write from the browser ──
alter table public.works enable row level security;
drop policy if exists "Public read works" on public.works;
create policy "Public read works" on public.works for select using (true);
-- (No insert/update/delete policy = writes only via the dashboard / service role.)

-- ── Public image bucket for artwork photos ──────────────────
insert into storage.buckets (id, name, public)
values ('artworks', 'artworks', true)
on conflict (id) do nothing;

drop policy if exists "Public read artworks" on storage.objects;
create policy "Public read artworks" on storage.objects
  for select using (bucket_id = 'artworks');

-- ── Seed: the 8 sample works (edit/delete these freely later) ─
insert into public.works
  (id, sort, title, year, medium, size, description, type, palette, variant,
   price, current_bid, bids, closes_at, min_increment, buy_now, ended, final_price)
values
  ('tidewall', 1, 'Tidewall, No. 4', 2024, 'Oil and marble dust on linen', '120 × 95 cm',
   'Built up over four months in thin tidal layers, the surface holds the memory of every wash that came before it. Best viewed in raking afternoon light.',
   'auction', '["#1f3a3d","#3f6b63","#cdbfa3"]', 'strata',
   null, 4600, 14, now() + interval '1 day 6 hours 12 minutes', 100, 8500, false, null),

  ('ochre-field', 2, 'Ochre Field', 2023, 'Oil on cotton canvas', '90 × 90 cm',
   'A single field of ground ochre, scraped back and reapplied until the colour seems to emit its own warmth. Part of the Dry Season series.',
   'buynow', '["#caa05a","#e7d3a7","#9c6b32"]', 'field',
   3200, null, 0, null, 100, null, false, null),

  ('salt-ember', 3, 'Salt & Ember', 2024, 'Pigment and ash on panel', '70 × 56 cm',
   'Wood ash from the studio stove bound into a low, smouldering horizon. A small, intense piece meant to be lived with closely.',
   'auction', '["#221f1d","#3a322c","#c8603a"]', 'orb',
   null, 7800, 23, now() + interval '2 hours 47 minutes', 100, 12000, false, null),

  ('quiet-meridian', 4, 'Quiet Meridian', 2022, 'Acrylic and graphite on board', '60 × 80 cm',
   'A horizon line drawn and erased a hundred times, leaving only a soft graphite ghost across a wash of sage. Quiet and exacting.',
   'buynow', '["#8a988b","#c2c6bd","#5f6d63"]', 'veil',
   5400, null, 0, null, 100, null, false, null),

  ('vesper', 5, 'Vesper', 2023, 'Oil on linen', '100 × 100 cm',
   'The last of the Dusk paintings — a plum field swallowing a pale, sinking disc. Exhibited at Galeria Foz, 2024.',
   'auction', '["#2a2336","#4a3b57","#b98aa0"]', 'orb',
   null, 9200, 31, now() - interval '3 days', 200, null, true, 9200),

  ('low-country', 6, 'Low Country', 2024, 'Mixed media on board', '110 × 80 cm',
   'Layered greens and silt, dragged horizontally to suggest flooded fields seen from a slow train. Unframed; ready to hang.',
   'buynow', '["#3b4a2f","#6f7d4e","#b7a378"]', 'strata',
   2800, null, 0, null, 100, null, false, null),

  ('argent', 7, 'Argent', 2024, 'Silverpoint and wash on prepared paper', '50 × 65 cm',
   'Drawn in pure silverpoint, the metal will warm and deepen with the years. A study in restraint and patience.',
   'auction', '["#b9bcc0","#e9e9ec","#8d9197"]', 'veil',
   null, 3100, 9, now() + interval '21 hours 35 minutes', 50, 5200, false, null),

  ('bloom-reserve', 8, 'Bloom in Reserve', 2023, 'Oil on canvas', '95 × 75 cm',
   'A rose-clay swell held just before opening — the most colour Nia allows into a single canvas. Studio favourite, rarely shown.',
   'buynow', '["#b06a5c","#e8c4b8","#7d4034"]', 'field',
   6750, null, 0, null, 100, null, false, null)
on conflict (id) do nothing;
```

---

## 2. Connect the site to your project

In **Project Settings → API**, copy your **Project URL** and **anon public** key.
Open `index.html`, find this block near the top of the `<script>`, and paste them in:

```js
const SUPABASE_URL      = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOi...your anon public key...";
```

> The anon key is **meant** to be public and safe to commit — it can only *read*
> the `works` table (per the policy above). It is not a secret. There is no
> `.env` file to manage for this static site.

Reload the page: the gallery now reads from your `works` table instead of the
sample data.

---

## 3. Add & edit works (day-to-day)

All of this happens in the Supabase dashboard — no code.

**To add a painting:** Table Editor → `works` → **Insert row**. Key fields:

| Field | Notes |
|---|---|
| `id` | a url-safe slug, e.g. `morning-tide` (lowercase, hyphens) |
| `sort` | lower numbers show first |
| `title`, `year`, `medium`, `size`, `description` | shown on the card + detail page |
| `type` | `auction` or `buynow` |
| `image_url` | the artwork photo (see below). Leave blank to use generated art |
| **Buy-now** | set `price` |
| **Auction** | set `current_bid`, `bids`, `closes_at`, `min_increment`, and optionally `buy_now` |

**To add the photo:** Storage → `artworks` bucket → **Upload file** → click the
file → **Copy URL** → paste it into that row's `image_url`. Portrait images look
best (they're shown in a 4:5 / framed crop).

**Auctions close automatically:** once `closes_at` is in the past, the piece shows
as "Auction closed". To show a sold result, also set `ended = true` and
`final_price`.

> The **works catalog** and **orders** are live from Supabase. **Payments are
> not taken online** — orders are saved as requests and Nia follows up to
> arrange payment/delivery.

---

## 4. Accounts & orders (email + password)

Visitors create an account (email + password), stay signed in across visits, and
when they **reserve**, **buy-now**, or **place a bid**, it's saved as an *order*
on their account. You see every order in the dashboard; each visitor sees only
their own.

### a) Create the `orders` table
SQL Editor → run this once:

```sql
create table if not exists public.orders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_id     text,                       -- slug of the work
  work_title  text,                       -- snapshot of the title
  kind        text not null,              -- 'reserve' | 'buy' | 'bid'
  amount      numeric,
  status      text not null default 'requested',   -- you update this in the dashboard
  created_at  timestamptz default now()
);

alter table public.orders enable row level security;
-- each signed-in user can create and read ONLY their own orders
drop policy if exists "own orders insert" on public.orders;
create policy "own orders insert" on public.orders
  for insert with check (auth.uid() = user_id);
drop policy if exists "own orders read" on public.orders;
create policy "own orders read" on public.orders
  for select using (auth.uid() = user_id);
```

You (as the project owner) see **all** orders in **Table Editor → `orders`**.
Update each order's `status` (e.g. `requested` → `confirmed` → `fulfilled`) as you
process it.

### b) Turn on password sign-up
**Authentication → Providers → Email** must be enabled (it is by default).

- **For instant access** (recommended to start): **Authentication → Providers →
  Email → turn _off_ "Confirm email."** New accounts can sign in immediately.
- **For confirmed emails** (more secure): leave "Confirm email" **on** — new users
  get a confirmation link first. The site handles both: if confirmation is on,
  sign-up shows a "Confirm your email" message. If you keep it on, also set
  **URL Configuration → Site URL** to your live site (e.g.
  `https://artwithnia.pages.dev`) and add it to **Redirect URLs** as
  `https://artwithnia.pages.dev/**`, and add **custom SMTP** (Authentication →
  SMTP Settings) so confirmation emails arrive reliably.

> Sessions persist automatically — once signed in, visitors stay signed in on
> that device until they sign out.

---

## 5. Automatic "you won" emails when an auction ends

A static site can't react to an auction closing, so this runs server-side: a
**scheduled Supabase Edge Function** (`supabase/functions/notify-auction-winners/`)
that, every few minutes, finds auctions whose `closes_at` has passed, picks the
**highest bid** from `orders`, emails that bidder, and marks the auction settled
so it never double-sends. Email is sent via **Resend**.

### a) Add the settlement flag
SQL Editor → run once:

```sql
alter table public.works
  add column if not exists winner_notified boolean not null default false;
```

### b) Set up Resend (email delivery)
1. Create an account at **resend.com**.
2. **Add & verify your domain** `artwithnia.com` (add the DNS records Resend
   gives you) so emails send from `nia@artwithnia.com`. *(To test first, Resend
   lets you send from `onboarding@resend.dev` to your own address.)*
3. Create an **API key** and copy it.

### c) Deploy the function
**Dashboard (no CLI):** Edge Functions → **Create function** → name it exactly
`notify-auction-winners` → paste the contents of
`supabase/functions/notify-auction-winners/index.ts` → **Deploy**.

**Or CLI:**
```bash
supabase login
supabase functions deploy notify-auction-winners --project-ref wtngjmtrxgdgoyjbqily
```

### d) Add the secrets
Edge Functions → **Secrets** (or `supabase secrets set …`):
- `RESEND_API_KEY` — from step (b)  *(required)*
- `WINNER_FROM_EMAIL` — e.g. `Art with Nia <nia@artwithnia.com>`  *(optional)*
- `SITE_URL` — `https://artwithnia.com`  *(optional)*

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — you
> don't set those. The service-role key stays inside the function (server-side
> only) and is never exposed to the browser.

### e) Schedule it (every 5 minutes)
SQL Editor → run once (uses your **anon public** key, which is fine to embed):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'notify-auction-winners',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://wtngjmtrxgdgoyjbqily.supabase.co/functions/v1/notify-auction-winners',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_ANON_PUBLIC_KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

To **test now**, invoke it once from the dashboard (Edge Functions → Run) or:
```bash
curl -X POST 'https://wtngjmtrxgdgoyjbqily.supabase.co/functions/v1/notify-auction-winners' \
  -H 'Authorization: Bearer YOUR_ANON_PUBLIC_KEY'
```
With a test auction whose `closes_at` is in the past and a bid placed from a real
account, that account should receive the email, and the work flips to
`winner_notified = true`, `ended = true`, `final_price = <winning bid>`.

> **⚠️ Important caveat — harden bids before real money changes hands.** Right
> now a bid is just a row the user inserts; the database doesn't verify it beats
> the current bid, and bids aren't shared live between visitors. So "highest bid"
> is whatever the largest `orders` row is — fine for capturing interest, but it
> could be gamed. For a real binding auction, add **server-side bid validation**
> (a Postgres function / RPC that checks the bid and updates `works.current_bid`
> atomically). Happy to build that next.

---

## Deploying

This is a static site (one `index.html`). Host it anywhere — Vercel, Netlify,
Cloudflare Pages, GitHub Pages — by uploading the folder or connecting a repo.
No build step is required. The `supabase/` folder is function source only — it
is **not** served by the static host and does not affect the build.
