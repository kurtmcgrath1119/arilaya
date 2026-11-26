# AriLaya

A GIS-based web platform for listing, mapping, and searching available lots in Mamburao, Occidental Mindoro.

Built with React, Leaflet, OpenStreetMap, Express, Sharp, Supabase Auth, Supabase Postgres, and private Supabase Storage.

## What Supabase provides

- **Auth:** email/password, Google OAuth, email confirmation, and password recovery.
- **Postgres:** profiles, lots, landmarks, favorites, feedback, and photo records.
- **Storage:** processed WebP listing photos in the private `lot-photos` bucket.

Express still runs the application, validates Supabase access tokens, enforces buyer/seller/admin permissions, and processes photos with Sharp. Supabase does not replace the app host; Render, Docker, or another Node host is still required.

## 1. Create a fresh Supabase project

Use a new project for the first migration. The importer refuses to run when Auth users, Storage objects, or application tables already contain data.

1. Create a project at [supabase.com](https://supabase.com/dashboard).
2. Choose a region close to the app and save the database password securely.
3. Open **SQL Editor**, create a new query, paste the complete contents of [`supabase/schema.sql`](supabase/schema.sql), and run it once.
4. Open **Storage** and confirm the `lot-photos` bucket exists and is **private**.

The schema creates:

- UUID profiles linked to `auth.users`
- Existing integer lot, landmark, feedback, and photo IDs
- Foreign keys for owners, favorites, and photos
- Buyer/seller role selection without client-assigned admin access
- Row Level Security and revoked direct browser table privileges
- A private photo bucket and owner/admin-aware Storage policies

Do not run `npm run seed` before importing real data.

## 2. Configure Supabase Auth

Open **Authentication → URL Configuration**.

For local development, set:

- **Site URL:** `http://localhost:5173`
- **Redirect URLs:**
  - `http://localhost:5173/auth/callback`
  - `http://127.0.0.1:5173/auth/callback`
  - `http://localhost:5173/reset-password`
  - `http://127.0.0.1:5173/reset-password`

Before production cutover, add:

- **Site URL:** `https://arilaya.onrender.com`
- **Redirect URLs:**
  - `https://arilaya.onrender.com/auth/callback`
  - `https://arilaya.onrender.com/reset-password`

Keep email confirmation enabled unless you deliberately want immediate registration sessions. The login page handles both outcomes.

### Google OAuth

1. In Google Cloud Console, open the existing Web application OAuth client.
2. Add this authorized redirect URI, replacing the project reference:

   ```text
   https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
   ```

3. In Supabase, open **Authentication → Sign In / Providers → Google**.
4. Enable Google and enter the Google OAuth client ID and client secret.
5. Save and allow a few minutes for propagation.

The browser now uses Supabase's OAuth redirect flow; the old Google Identity Services script and server ID-token endpoint are no longer used.

### Production email

Configure custom SMTP under **Authentication → Emails** before production. Supabase's built-in email service is rate-limited and should not be relied on for password resets or confirmations.

## 3. Configure the server environment

From the project root:

```sh
copy .env.example .env
```

Edit `.env` with values from Supabase:

| Key | Where to get it |
| --- | --- |
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_ANON_KEY` | Project Settings → API Keys; publishable/anon key |
| `SUPABASE_SECRET_KEY` | Project Settings → API Keys; secret/service-role key |
| `DATABASE_URL` | Connect → Session pooler connection string |
| `GOOGLE_CLIENT_ID` | The same Google OAuth client ID used above |

Use the **Session pooler** connection string on port `5432` for the long-running Express server. Percent-encode special characters in the database password when they appear in the URI.

Never put `SUPABASE_SECRET_KEY` or `DATABASE_URL` in a `VITE_` variable, browser code, Docker build arguments, or chat. Only `SUPABASE_URL` and the publishable/anon key are exposed through `/api/auth/config`.

## 4. Install and take a fresh migration backup

```sh
npm install
cd client && npm install && cd ..
```

Stop the local app and Vite dev server before the final migration so no new SQLite writes or photo files are created during the snapshot.

Run:

```sh
npm run migrate:sqlite
```

The command performs these steps:

1. Creates a fresh SQLite online backup, including committed WAL data.
2. Copies the current `uploads` folder into `backups/migration-<timestamp>/uploads`.
3. Validates duplicate emails, roles, relationships, boundaries, coordinates, and photo paths.
4. Refuses a non-empty destination.
5. Creates confirmed Supabase Auth users with random unknown passwords.
6. Uploads processed WebP photos to deterministic private object paths.
7. Imports relational data in one Postgres transaction.
8. Preserves all existing integer IDs and stores the old-user-ID → Auth-UUID map privately.
9. Resets identity sequences and validates row counts and relationships.
10. Removes newly created Auth users and uploaded objects if the import fails before commit.

The SQLite password hashes cannot be transferred to Supabase Auth. After a successful import, every migrated user must use **Forgot password?** once to set a new Supabase password.

If a source account already used Google, its email and Google subject metadata are preserved. Confirm same-email Google linking with a test account in staging before production cutover.

## 5. Create the first admin

Run this only after a successful import:

```sh
npm run admin:create
```

Enter an admin email and a strong password when prompted. The script creates a confirmed Auth user, or resets an existing account's password if that email is already present, then assigns `profiles.role = 'admin'` server-side.

Admin access is no longer controlled by `ADMIN_USERNAME` or `ADMIN_PASSWORD`.

## 6. Run locally

Terminal 1:

```sh
npm start
```

Terminal 2:

```sh
cd client && npm run dev
```

Open `http://localhost:5173`. The admin page remains at `http://localhost:5173/admin.html`.

Optional sample data is available only for an empty database:

```sh
npm run seed
```

Do not seed a database that already contains imported or real records.

## 7. Deploy on Render

The Supabase version does not need a Render persistent disk, `DB_PATH`, `UPLOAD_DIR`, `SESSION_SECRET`, or a local uploads volume.

Set these environment variables in **Render → Settings → Environment**:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Publishable/anon key |
| `SUPABASE_SECRET_KEY` | Secret/service-role key |
| `DATABASE_URL` | Supabase Session pooler URI |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID used by Supabase |

Remove the old `DB_PATH`, `UPLOAD_DIR`, `SESSION_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` variables.

Set the health check path to `/api/health`. Leave Render's build and start commands empty when using the Dockerfile so it runs `CMD ["node", "server.js"]`.

Before switching traffic:

1. Add the production Site URL and both production redirect URLs in Supabase.
2. Confirm custom SMTP and the Google provider.
3. Rehearse registration, login, password reset, Google sign-in, and admin login against staging.
4. Stop writes to the old app.
5. Take one final fresh SQLite migration backup and import into a fresh staging/project database.
6. Verify approved lots, owner relationships, favorites, feedback, and photos.
7. Deploy the new image and test the production URLs below.

```sh
curl https://arilaya.onrender.com/api/health
curl https://arilaya.onrender.com/api/lots
```

The health response should report `ok: true`, `supabaseConfigured: true`, and `customStorageConfigured: true`.

## 8. Docker

Build and run with the values in `.env`:

```sh
docker compose up --build -d
```

Or run the image directly:

```sh
docker run -p 3000:3000 --env-file .env kurtmcgrath024/arilaya:latest
```

The image contains no SQLite database, uploads, secrets, or persistent `/data` volume.

## Security and operations

- Browser requests carry Supabase access tokens; Express loads the current profile and role from Postgres on every protected request.
- Direct `anon` and `authenticated` table privileges are revoked. The server uses the secret key and database connection for trusted business operations.
- Listing photos are private. Express signs URLs only after checking that the lot is approved, owned by the caller, or administered by the caller.
- Signed photo URLs expire after one hour. Reload a page or refetch a dashboard to refresh them.
- Use Supabase's managed backups/PITR and Storage backups for ongoing production protection. `backup.js` remains only for the legacy SQLite source.
- Keep the migration backup private and never commit `.env`, `backups/`, database files, or uploads.

## Rollback

Keep the previous Render service/image and its SQLite disk configuration available until the new system is verified. Rolling back does not merge records created in Supabase after cutover; export or reconcile those records before switching back.
