# GhostAudio

**GhostAudio** is a personal high-fidelity music manager application designed to catalogue and play your music collection with a premium "Ghost" aesthetic. It features a modern desktop interface and powerful backend capabilities for media management, including CD ripping.

## 🏗 Architecture

This project uses a unified Electron architecture:

- **Frontend**: Next.js (React) app providing the UI.
- **Desktop Shell**: Electron, which handles native hardware interactions (CD ripping, filesystem) directly.
- **No External Backend**: The previous Python dependency has been fully integrated into the main application.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **FFmpeg** (Recommended for CD ripping)

### Installation

1.  **Clone the repository** (if you haven't already):
    ```bash
    git clone https://github.com/FelipeCantu/GhostAudio.git
    cd GhostAudio
    ```

2.  **Setup App**:
    ```bash
    cd music-app
    npm install
    ```

## 🖥 Running the App

To run the application in development mode:

```bash
cd music-app
npm run electron-dev
```

This command will:
1.  Start the Next.js dev server on port 3000.
2.  Launch Electron.

## ✨ Features

- **CD Drive Scanning**: Automatically detect available optical drives.
- **Native Importer**: Rip music from CDs using bundled or system FFmpeg.
- **Dark Mode**: Fully supported premium dark interface.

## 🛠 Project Structure

- `/music-app` - Next.js + Electron application.
    - `/src` - React source code.
    - `/electron` - Electron main process and native services.
    - `/resources` - Bundled binaries (e.g., ffmpeg.exe).
