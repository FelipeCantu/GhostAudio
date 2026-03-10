<div align="center">
  <img src="music-app/public/logo.png" alt="DiZC Logo" width="180" />
  <br/><br/>
  <img src="https://img.shields.io/badge/Version-0.2.0--beta-orange" alt="Version" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Web%20%7C%20Mobile-blue" alt="Platform" />
  <img src="https://img.shields.io/badge/Status-Beta-yellow" alt="Status" />
  <br/><br/>
  <strong>Your music. Uncompromised.</strong>
  <br/>
  DiZC is a high-fidelity digital music library for audiophiles who own their collection.
  Bit-perfect playback, one-click CD ripping, cloud sync, and a stunning interface — across desktop, web, and mobile.
</div>

---

## Download

| Platform | Link |
|---|---|
| Windows Desktop | [DiZC-Setup-0.2.0-beta.exe](https://github.com/FelipeCantu/GhostAudio/releases/download/v0.2.0-beta/DiZC-Setup-0.2.0-beta.exe) |
| Web Player | [dizc.vercel.app](https://dizc.vercel.app) |
| Mobile (PWA) | Visit the web player on your phone → Add to Home Screen |

> **Note:** Windows may show a SmartScreen warning on first launch. Click **More info → Run anyway**. The app is not yet code-signed.

---

## Features

### CD Ripping
Insert a disc, click Rip. DiZC fetches metadata automatically from MusicBrainz (title, artist, track names, cover art), then rips sector-by-sector using ffmpeg's `libcdio` driver. Per-track progress streams live to the UI. The whole process takes 3–8 minutes per disc.

### Local File Import
Drag and drop or select MP3, FLAC, WAV, AAC, AIFF, and ALAC files. Metadata and cover art are read automatically. Files upload to your Cloudflare R2 bucket so they're available on every device.

### Cloud Audio Streaming
All tracks — ripped or imported — upload to Cloudflare R2 object storage and stream to any device via the web player. No local files needed on the streaming device. R2 is optional; the app falls back gracefully to local paths if not configured.

### Web Player + Mobile PWA
The full DiZC experience runs in any browser. On mobile, install it as a PWA (Add to Home Screen) and it opens fullscreen like a native app — no App Store required.

### Customizable Dashboard
Drag sections of your home screen into any order you want, just like Apple Music. Your layout is saved and persists across sessions.

### Full-Featured Player
- Play/pause, skip, seek
- Shuffle and repeat (off / all / one)
- Sleep timer (15 / 30 / 45 / 60 min)
- Queue viewer
- Full-screen expanded player on mobile with rotating album art
- Mini player with live progress indicator

### Playlists
- **Manual playlists** — add any track, drag to reorder
- **Smart playlists** — auto-populate by rule:
  - `by_artist` — all tracks by a given artist
  - `recently_added` — tracks from your 10 most recent imports
  - `random` — up to 50 shuffled tracks
- Refresh smart playlists anytime to pick up new imports

### Library Browsing
Grid and list views, search, and sort by recently added, A–Z, Z–A, or by artist. Artist view groups albums under each artist with horizontal scroll rows.

### Global Search
Keyboard shortcut (`Ctrl+K` / `Cmd+K`) opens a full search overlay across your entire library from any page.

### Unified Account
One account works on desktop and web. Auth is backed by MongoDB — same user ID, library, and playlists everywhere.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40 |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Animations | Framer Motion |
| Drag & drop | @dnd-kit/core + @dnd-kit/sortable |
| Backend | Django 5, Django REST Framework |
| WSGI server | Waitress (desktop) · Gunicorn (Railway) |
| Desktop bundling | PyInstaller + Electron Builder |
| Database | MongoDB Atlas |
| Auth | Custom JWT (pyjwt + bcrypt), shared desktop ↔ web |
| Audio storage | Cloudflare R2 (S3-compatible, via boto3) |
| CD ripping | ffmpeg (`libcdio` input driver) |
| Metadata | MusicBrainz API + Cover Art Archive |
| Deployment | Vercel (frontend) · Railway (backend API) |

---

## Architecture

```
GhostRepo/
├── backend/                    # Django REST API
│   ├── config/                 # Settings, URLs, WSGI
│   ├── importer/               # All API logic
│   │   ├── views.py            # Endpoints + SSE streaming
│   │   ├── services.py         # CDRipper (ffmpeg wrapper)
│   │   └── cd_metadata.py      # MusicBrainz TOC lookup
│   ├── bin/                    # Bundled ffmpeg.exe
│   ├── ghost_backend.spec      # PyInstaller spec
│   ├── requirements.txt
│   ├── Procfile                # Railway → Gunicorn
│   └── runtime.txt             # python-3.12
└── music-app/                  # Next.js + Electron
    ├── electron/
    │   ├── main.js             # Main process + IPC handlers
    │   ├── preload.js          # Context bridge
    │   └── services.js         # API wrappers (fetch + SSE)
    ├── public/
    │   ├── manifest.json       # PWA manifest
    │   └── sw.js               # Service worker
    └── src/
        ├── app/
        │   ├── app/            # Dashboard (home)
        │   ├── library/        # Album grid
        │   ├── import/         # File + CD import
        │   ├── playlists/      # Playlist views
        │   ├── settings/
        │   ├── login/
        │   └── register/
        ├── components/
        │   ├── PlayerBar.tsx         # Persistent player + expanded mobile view
        │   ├── DashboardLayout.tsx   # Shell: sidebar, mobile nav, search
        │   ├── Sidebar.tsx
        │   ├── CDImporter.tsx        # CD rip UI with per-track progress
        │   ├── AlbumCard.tsx
        │   ├── AlbumDetailView.tsx
        │   ├── PlaylistView.tsx
        │   ├── GlobalSearch.tsx      # Cmd+K search overlay
        │   ├── KeyboardShortcutsModal.tsx
        │   └── PWARegister.tsx
        ├── context/
        │   ├── AuthContext.tsx
        │   ├── PlayerContext.tsx
        │   ├── ImportContext.tsx     # Import state (localStorage-persisted)
        │   └── PlaylistContext.tsx
        └── services/
            └── api.ts               # IPC → fetch fallback for all API calls
```

---

## API Reference

All endpoints prefixed with `/api/`.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `mongo/auth/register/` | Create account |
| POST | `mongo/auth/login/` | Login, returns JWT |
| GET | `mongo/auth/me/` | Verify token, return user |

### Library
| Method | Path | Description |
|---|---|---|
| GET | `mongo/library/` | List albums |
| DELETE | `mongo/library/<id>/` | Delete album |
| GET | `mongo/dashboard-stats/` | Album + track counts + recent albums |

### Import
| Method | Path | Description |
|---|---|---|
| POST | `mongo/upload-audio/` | Upload file to R2, returns public URL |

### CD Ripping
| Method | Path | Description |
|---|---|---|
| POST | `metadata/` | Fetch disc metadata from MusicBrainz |
| POST | `rip/stream/` | SSE stream — rip with live per-track progress |
| POST | `rip/cancel/` | Cancel active rip session |

### Playlists
| Method | Path | Description |
|---|---|---|
| GET/POST | `mongo/playlists/` | List / create |
| GET/PATCH/DELETE | `mongo/playlists/<id>/` | Detail / update / delete |
| POST | `mongo/playlists/<id>/items/` | Add tracks |
| DELETE | `mongo/playlists/<id>/items/<index>/` | Remove track |
| POST | `mongo/playlists/<id>/refresh/` | Re-run smart rule |

### System
| Method | Path | Description |
|---|---|---|
| GET | `system/check/` | Health check (backend + ffmpeg status) |

---

## Local Development

### Prerequisites
- Python 3.12
- Node.js 20+
- MongoDB Atlas cluster
- Cloudflare R2 bucket *(optional — falls back to local paths)*

### 1. Backend

```bash
cd backend
python -m venv venv
venv/Scripts/pip install -r requirements.txt
venv/Scripts/python manage.py runserver
```

API runs at `http://127.0.0.1:8000`.

### 2. Frontend (web)

```bash
cd music-app
npm install
npm run dev
```

Open `http://localhost:3000`.

### 3. Desktop (Electron)

Start the Django backend first, then:

```bash
cd music-app
npx electron .
```

Or run both together:

```bash
cd music-app
npm run electron-dev
```

### Environment Variables

Create `music-app/.env.local`:

```env
# MongoDB
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/<db>

# Auth
JWT_SECRET=<random-secret>

# Cloudflare R2 (optional)
R2_ACCOUNT_ID=<cloudflare-account-id>
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=dizc-audio
R2_PUBLIC_URL=https://pub-<hash>.r2.dev

# Backend (use Railway URL in production)
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

> `R2_ACCOUNT_ID` must be your Cloudflare **Account ID** (found bottom-right on dash.cloudflare.com) — not the access key ID.

---

## Deployment

### Backend → Railway
1. Connect the repo to Railway, set root to `backend/`
2. Add env vars: `MONGODB_URI`, `JWT_SECRET`, `R2_*`
3. Railway picks up `Procfile` and runs Gunicorn automatically

### Frontend → Vercel
1. Connect `music-app/` to a Vercel project
2. Set `NEXT_PUBLIC_API_URL` to your Railway URL
3. Push to deploy — PWA support is included automatically

### Desktop Installer

**Step 1 — Build the backend exe**
```bash
cd backend
venv/Scripts/python -m PyInstaller ghost_backend.spec --clean
```
Outputs `backend/dist/ghost_backend.exe`.

**Step 2 — Build and package**
```bash
cd music-app
npm run dist
```
Outputs `music-app/dist/DiZC Setup 0.2.0-beta.exe`. Upload to a GitHub Release for distribution.

---

## Known Limitations (Beta)

- **Windows only** — macOS and Linux desktop builds are not yet available
- **No code signing** — SmartScreen warning appears on first launch
- **CD ripping** — requires the desktop app (not available in web/PWA)
- **Local file import** — upload to R2 happens via the desktop app; web import is planned
- **Offline PWA** — app shell caches for offline load, but audio requires network

---

*Created by Felipe Cantu · DiZC v0.2.0-beta*
