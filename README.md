# GhostAudio

**GhostAudio** is a personal high-fidelity music manager application designed to catalogue and play your music collection with a premium "Ghost" aesthetic. It features a modern desktop interface and powerful backend capabilities for media management, including CD ripping.

## 🏗 Architecture

This project uses a hybrid architecture:

- **Frontend**: Next.js (React) app providing the UI.
- **Desktop Shell**: Electron, which wraps the Next.js app and manages the backend process.
- **Backend**: Python Django, running as a local server to handle hardware interactions (CD drives) and file management.

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18+)
- **Python** (v3.10+)

### Installation

1.  **Clone the repository** (if you haven't already):
    ```bash
    git clone https://github.com/FelipeCantu/GhostAudio.git
    cd GhostAudio
    ```

2.  **Setup Backend**:
    ```bash
    cd backend
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # Install dependencies
    pip install -r requirements.txt
    ```

3.  **Setup Frontend**:
    ```bash
    cd ../music-app
    npm install
    ```

## 🖥 Running the App

To run the application in development mode (which starts Frontend, Electron, and Backend simultaneously):

```bash
cd music-app
npm run electron-dev
```

This command will:
1.  Start the Next.js dev server on port 3000.
2.  Launch Electron.
3.  Automatically spin up the Django backend (managed by Electron).

## ✨ Features

- **CD Drive Scanning**: Automatically detect available optical drives.
- **Importer**: Interface to rip music from CDs (Simulation mode active).
- **Dark Mode**: Fully supported premium dark interface.

## 🛠 Project Structure

- `/backend` - Django project for system-level operations.
- `/music-app` - Next.js + Electron application.
    - `/src` - React source code.
    - `/electron` - Electron main process scripts.
