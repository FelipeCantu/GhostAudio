# DiZC - Beta 0.2.0 Release

**"High Fidelity, Zero Config."**

This beta release represents a major step forward in stability and ease of use. We've completely overhauled the import engine to ensure a "just works" experience for every user.

## 🌟 Highlights

### 💿 Integrated High-Fidelity Ripping
The CD Ripping Engine is now **fully bundled**.
- **No Manual Setup**: We now include the audio processing tools (FFmpeg) directly in the app. You don't need to download or configure anything extra.
- **Bit-Perfect Extraction**: Reliable audio ripping that preserves the quality of your physical media.
- **Offline Ready**: The engine works locally on your machine, with no robust internet dependencies for the core ripping process.

### 🛠️ System Diagnostics
- **Smart Hardware Detection**: The app instantly detects available optical drives.
- **Readiness Checks**: A new diagnostic system proactively checks your environment to ensure the audio engine is loaded and ready before you start an import.

### ⚡ Unified Architecture
- **Single Executable**: The backend and frontend are now seamlessly packaged together.
- **Enhanced Stability**: Fixed issues where the background service could disconnect or fail to communicate with the UI.

## 🐛 Bug Fixes
- Resolved `path` errors during build process.
- Fixed dependency issues where Python libraries like `musicbrainzngs` were missing in the packaged app.
- Improved persistence logic to ensure ripped tracks appear immediately in your library.


### 🎧 New Player & Dashboard Experience
- **Live Dashboard**: Your dashboard now reflects your actual library stats and most recent rips in real-time.
- **Persistent Player**: Enjoy continuous playback as you navigate between the Library, Import, and Settings screens.
- **Web vs. App**: The Desktop App now launches directly into your music application, while the website serves our new marketing experience.
