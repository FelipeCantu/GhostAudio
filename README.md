# DiZC - High Fidelity Digital Music Library

**DiZC** is a standalone, high-fidelity music experience designed for audiophiles who want to own their music. It bridges the gap between physical media (CDs) and the modern digital cloud.

![DiZC UI]([https://placehold.co/800x400?text=DiZC+App](https://ghost-audio.vercel.app/logo.png))

## Key Features

### 💿 High-Fidelity Import Engine
Connects directly to your optical drive to rip CDs in lossless quality. The custom Python backend (Django) handles the hardware communication, ensuring bit-perfect extraction.

### ☁️ Cloud Sync (MongoDB Atlas)
Your library follows you. By leveraging **MongoDB Atlas**, your metadata, album art, and user account are synchronized across all your devices.
- **Web View**: Browse your collection from any browser.
- **App View**: manage and play your music from the dedicated desktop app.

### 🔐 Secure Authentication
Built-in user management ensures your library is yours. Each album you import is tagged with your unique User ID, keeping your collection private and personalized.

### 🚀 "Click & Run" Architecture
Built as a dual-architecture system:
- **Frontend**: Next.js (React) + Electron for a beautiful, responsive UI.
- **Backend**: A bundled Django executable (`ghost_backend.exe`) that launches automatically.
- **Result**: Zero configuration required. Just install and play.

## Tech Stack

- **Electron**: Desktop unification.
- **Next.js**: Reactive, modern UI.
- **Django**: Powerful backend for hardware interfacing.
- **MongoDB**: Flexible, cloud-native database.
- **Tailwind CSS**: Premium, custom styling.

## Installation

1.  Download the latest installer (`DiZC Setup 0.1.0.exe`).
2.  Run the installer.
3.  Login or Register.
4.  Start importing your CDs!

---
*Created by Felipe Cantu*
