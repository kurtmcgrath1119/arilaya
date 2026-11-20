# AriLaya

A GIS-based web platform for listing, mapping, and searching available lots in Mamburao, Occidental Mindoro.
Built with React, Leaflet and OpenStreetMap, Node.js (Express), and SQLite.

## Features
- Interactive lot map with filters (barangay, price, size, land type, status, landmark distance)
- Buyer and seller accounts (email/password or Google), with buyer and seller dashboards
- Sellers mark lot boundaries on the map; the admin approves listings before they go public
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
npm run seed
npm start                   (terminal 1)
cd client && npm run dev    (terminal 2, then open http://localhost:5173)
```