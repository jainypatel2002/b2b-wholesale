# Distributor ↔ Vendor Portal (Next.js + Supabase)

Features:
- Roles: Distributor / Vendor
- Distributor: categories, inventory (cost/price/stock), orders, invoices (cash), profit dashboard
- Vendor: catalog, cart, place orders, view invoices

## Tech
- Next.js App Router
- Supabase Auth + Postgres + RLS
- `@supabase/ssr` (recommended replacement for deprecated auth-helpers)

---

## 1) Local setup

### Prereqs
- Node.js 20+ (recommended)
- A Supabase project

### Install
```bash
npm install
```

### Environment variables
Create `.env.local` in the project root:
```bash
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Run:
```bash
npm run dev
```
Open http://localhost:3000

---

## 2) Supabase setup (backend)

1. Create a new project in Supabase.
2. Go to **SQL Editor** → run the script:
   - `supabase/schema.sql`
3. Go to **Authentication → Providers**:
   - Enable Email/Password.
   - For easiest testing, disable email confirmation (optional).

---

## 3) App onboarding flow

1. Sign up / sign in.
2. Go to `/onboarding`:
   - If Distributor: choose **Distributor**.
   - If Vendor: choose **Vendor** and paste distributor code.
3. Distributor code is shown on `/distributor`.

---

## 4) GitHub setup

1. Create a GitHub repo (empty).
2. On your computer:
```bash
git init
git add .
git commit -m "Initial commit"

git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

## 5) Deployment (Vercel)

1. Import the repo in Vercel.
2. Set Environment Variables in Vercel Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Deploy.

### Important (Supabase Auth URL settings)
In Supabase:
- **Auth → URL Configuration**
  - Set **Site URL** to your Vercel domain
  - Add your Vercel domain to **Redirect URLs**

---

## 6) Notes on “no bugs” behavior

- All sensitive tables are protected with RLS.
- Price/cost are snapshotted into `order_items` + `invoice_items` so profit stays correct historically.
- Profit is counted only when invoices are marked **paid** (cash collected).

---

## Troubleshooting

- If you get a 401/empty data on deployed app, double-check:
  - Vercel env vars
  - Supabase Auth Site URL + Redirect URLs
- If signup emails don’t arrive:
  - Disable confirmation temporarily OR configure SMTP.
