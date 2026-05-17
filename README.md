# ☀️ Doctor Electric CRM (prod-crm-app)

A modern, high-performance solar CRM designed for managing clients, workflows, quotations, installations, payments, and documents. Optimized for seamless desktop and mobile/tablet usage.

---

## ⚡ Main Features

- **🎯 Simple & Quick Lead Form**: Create leads in seconds by asking for only 5 essential fields (Name, Phone, Address, Roof, System Size). Add detailed documents, surveys, quotations, and payments later from the Client Panel.
- **📷 Mobile Camera Integration**: Instant photo capture capability directly within the browser using phone/tablet camera (`capture="environment"`) for Site Images, Aadhaar cards, Electricity bills, and Subsidy documents.
- **🛡️ Secure User Management**: Complete User control panel with customized roles (Admin, Sales Team, Engineer, Accountant, Manager).
- **❌ Admin User Deletion**: Admins can easily purge outdated system users directly from the UI, with complete activity audit logging and automatic safe-guards to prevent self-deletion.
- **☁️ Hourly R2 Backups**: Built-in automated scheduler that saves compressed, gzipped database snapshots directly to Cloudflare R2 every hour. Prunes older files automatically to keep a rolling 7 days (168 points) of recovery history.
- **🚀 One-Click Startups**: Included platform-specific launch scripts to boot up the frontend and backend instantly with auto-cleaning ports.

---

## 🚀 Quick Start

### 💻 Windows Setup
Just double-click or run from PowerShell:
```powershell
.\start.ps1
```

### 🐧 Linux / Ubuntu Setup
Run the unified bash script:
```bash
chmod +x start.sh
./start.sh
```

The script automatically detects missing packages, installs them, handles ports 3000 & 4000, compiles TypeScript code, and fires up both frontend and backend concurrently!

---

## 🔑 Default Administrator Login

Access the portal using the default credentials:

| Field    | Value                   |
|----------|-------------------------|
| URL      | `http://localhost:3000` |
| Email    | `admin@solarcrm.local`  |
| Password | `admin12345`            |

---

## 💾 Local Storage Info

All database tables are serialized locally inside a schema-less JSON repository for extremely easy VPS migration:
```
infrastructure/backend/data/solarcrm.local.json
```
No database setup or installation is required; the JSON store is initialized automatically on startup.

---

## 📦 Cloudflare R2 Storage & Backups

Pre-signed URLs are enabled out-of-the-box for highly performant and secure directly-to-edge uploads without clogging VPS bandwidth.
- Scheduled backups are saved under: `backups/db/YYYY-MM-DD/HH-mm.json.gz`
- The latest state is continually maintained at: `backups/db/latest.json.gz`
- Admins can manually force an immediate R2 backup snapshot at any time by calling `POST /api/backup/r2` or from the management panel.

---

## 📁 Repository Map

```
solarcrm/
├── src/                        # React Frontend Source
│   ├── pages/                  # Pages (Dashboard, Clients, Users...)
│   ├── components/             # Components (Proposal, Camera Upload...)
│   ├── sheets/                 # API client wrapper & types
│   └── ui/                     # Premium UI components
├── infrastructure/
│   ├── backend/                # Express API Server
│   │   ├── src/
│   │   │   ├── routes/         # REST API routers (auth, clients, backup...)
│   │   │   ├── db/             # Local database & R2 schedules
│   │   │   └── middleware/     # Auth checks & error handlers
│   │   └── data/               # solarcrm.local.json
├── start.sh                    # One-Click Linux/Ubuntu Script
├── start.ps1                   # One-Click Windows Script
└── README.md                   # Project Documentation
```