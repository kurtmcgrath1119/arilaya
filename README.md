# AriLaya

A GIS-based web platform for listing, mapping, and searching available lots in Mamburao, Occidental Mindoro.
Built with React, Leaflet and OpenStreetMap, Node.js (Express), and SQLite.

## Features
- Interactive lot map with filters (barangay, price, size, land type, status, landmark distance)
- Buyer and seller accounts (email/password or Google), with buyer and seller dashboards
- Sellers mark lot boundaries on the map and add up to six photos; the admin approves listings before they go public
- Public photo galleries with direct “View on map” links, plus a saved-lot comparison in the buyer dashboard
- Admin page for managing lot records, and a built-in feedback form for system evaluation

## Run with Docker (easiest)
```
docker run -p 3000:3000 -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=choose-a-password -e SESSION_SECRET=any-long-text -v arilaya-data:/data kurtmcgrath024/arilaya:latest
```
Open http://localhost:3000. The admin page is at http://localhost:3000/admin.html.
Google sign-in needs a GOOGLE_CLIENT_ID (add `-e GOOGLE_CLIENT_ID=...`); email sign-in works without it.

## Run from the source code
```
npm install
cd client && npm install && cd ..
copy .env.example .env      (then edit .env)
npm run seed                (optional sample data; production starts with an empty database)
npm start                   (terminal 1)
cd client && npm run dev    (terminal 2, then open http://localhost:5173)
```

## Deploy on Render without losing accounts or lots

The Docker image intentionally does **not** contain `arilaya.db` or `uploads`. Localhost and Render therefore use different databases unless you restore your local backup onto Render's persistent disk. Docker's `VOLUME /data` declaration alone does not make Render storage persistent.

### 1. Attach persistent storage

1. Use a paid Render Web Service plan; free Web Services cannot attach persistent disks.
2. Open the service's **Disk** page and add a disk named `arilaya-data`.
3. Set its mount path to exactly `/data` and choose a size such as `1 GB`.
4. Save. Render redeploys the service, with a short interruption while the disk is attached.

Add these environment variables in **Settings → Environment**:

| Key | Value |
| --- | --- |
| `DB_PATH` | `/data/arilaya.db` |
| `UPLOAD_DIR` | `/data/uploads` |
| `SESSION_SECRET` | A long random value |
| `GOOGLE_CLIENT_ID` | `370041677958-7utg9bm6s09ot545rneb3gc7rp67accp.apps.googleusercontent.com` |
| `ADMIN_USERNAME` | Your admin username |
| `ADMIN_PASSWORD` | A strong admin password |

Generate a session secret locally with:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the health check path to `/api/health`. If Render pulls your Docker Hub image, use `kurtmcgrath024/arilaya:1.2.1`; if it builds this repository, leave the build and start commands empty so the Dockerfile's `CMD ["node", "server.js"]` is used.

### 2. Back up localhost data

From the project root, run:

```sh
npm run backup
```

This creates `backups/<timestamp>/arilaya.db` and copies uploaded photos into `backups/<timestamp>/uploads`. It uses SQLite's online backup API, so it includes committed records from `arilaya.db-wal`; copying only `arilaya.db` can miss your accounts and lots. Do not commit or publish the backup folder.

### 3. Restore the backup on Render

Use Render's **Shell** or SSH/SCP access to copy the backup to the mounted disk. For SCP, replace the username and region with the connection values shown by Render:

```sh
scp -s backups/<timestamp>/arilaya.db <render-user>@ssh.<render-region>.render.com:/data/arilaya-restore.db
scp -s -r backups/<timestamp>/uploads/. <render-user>@ssh.<render-region>.render.com:/data/uploads/
```

Verify the uploaded database in Render's Shell before switching to it:

```sh
node -e "const D=require('better-sqlite3');const d=new D('/data/arilaya-restore.db',{readonly:true});console.log(d.pragma('quick_check'));console.log({users:d.prepare('SELECT COUNT(*) n FROM users').get().n,lots:d.prepare('SELECT COUNT(*) n FROM lots').get().n});d.close()"
```

Then set `DB_PATH=/data/arilaya-restore.db` in Render and redeploy. Keeping the restored file under a new name preserves the previous production database. Any production accounts created after the local snapshot remain in the old file and are not merged automatically.

### 4. Fix Google sign-in

In Google Cloud Console, open **APIs & Services → Credentials**, edit the Web application OAuth client with ID `370041677958-7utg9bm6s09ot545rneb3gc7rp67accp.apps.googleusercontent.com`, and add these **Authorized JavaScript origins**:

```text
https://arilaya.onrender.com
http://localhost:5173
http://127.0.0.1:5173
```

Origins contain only scheme, host, and optional port—no path or trailing slash. The current GoogleLogin credential flow does not need a redirect URI. If the OAuth consent screen is in **Testing** mode, add the Google account you are testing under **Test users**. Allow a few minutes for changes to propagate, then hard-refresh the login page.

### 5. Verify production

```sh
curl https://arilaya.onrender.com/api/health
curl https://arilaya.onrender.com/api/lots
```

The health response should report `ok: true`, `googleConfigured: true`, and `customStorageConfigured: true`. Confirm that the expected approved lots appear, then test email registration/login and Google sign-in. Seller submissions with `approval: pending` are intentionally hidden from the public map until approved at `/admin.html`.