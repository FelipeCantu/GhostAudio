const { app, BrowserWindow, ipcMain, protocol, net, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const envPath = app.isPackaged
  ? path.join(process.resourcesPath, '.env.local')
  : path.join(__dirname, '../.env.local');
require('dotenv').config({ path: envPath });
const { spawn } = require('child_process');
// const serve = require('electron-serve'); // Removed
const services = require('./services');

let mainWindow;
let backendProcess = null;

const isDev = !app.isPackaged;
// const appServe = isDev ? null : serve({ directory: path.join(__dirname, '../out') }); // Removed



// Custom Protocol Handler for Production
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
  ]);
}

// Register 'localfile' protocol for serving local audio files
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true } }
]);

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('ready', () => {
    if (!isDev) {
      protocol.handle('app', (request) => {
        const u = new URL(request.url);
        let reqPath = decodeURIComponent(u.pathname);

        // 1. Handle RSC Special Cases (Next.js App Router mismatches)
        if (reqPath.includes('__next') && reqPath.endsWith('.txt')) {
          const parts = reqPath.split('/');
          const segment = parts[1]; // e.g. 'import' from /import/...
          const potentialRSC = path.join(__dirname, '../out', `${segment}.txt`);
          if (fs.existsSync(potentialRSC)) {
            return net.fetch('file:///' + potentialRSC);
          }
        }

        // 2. Standard Static File Serving with Extension Resolution
        let filePath = path.join(__dirname, '../out', reqPath);

        // Force / to /index.html
        if (reqPath === '/' || reqPath === '') {
          filePath = path.join(__dirname, '../out', 'index.html');
        }

        // Check if exact file exists
        if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
          return net.fetch('file:///' + filePath);
        }

        // Try appending .html (e.g. /library -> /library.html)
        const htmlPath = filePath + '.html';
        if (fs.existsSync(htmlPath)) {
          return net.fetch('file:///' + htmlPath);
        }

        // Try appending /index.html
        const indexPath = path.join(filePath, 'index.html');
        if (fs.existsSync(indexPath)) {
          return net.fetch('file:///' + indexPath);
        }

        // Fallback: serve the static placeholder for dynamic routes
        // e.g. /playlists/{any-id} → out/playlists/_.html
        const segments = reqPath.split('/').filter(Boolean);
        if (segments.length >= 2) {
          const parentDir = path.join(__dirname, '../out', segments[0]);
          const placeholderHtml = path.join(parentDir, '_.html');
          if (fs.existsSync(placeholderHtml)) {
            return net.fetch('file:///' + placeholderHtml);
          }
        }

        console.error(`File not found: ${reqPath}`);
        return net.fetch('file:///' + filePath);
      });
    }

    // Local file protocol handler for audio files
    protocol.handle('localfile', (request) => {
      let filePath = decodeURIComponent(request.url.replace('localfile://', ''));
      // Fix Windows drive letter - URL parsing removes the colon
      // e.g., "c/Users/..." becomes "C:/Users/..."
      if (/^[a-zA-Z]\//.test(filePath)) {
        filePath = filePath[0].toUpperCase() + ':' + filePath.slice(1);
      }
      console.log('[localfile protocol] Serving:', filePath);

      // Get file stats for proper Content-Length header (needed for audio duration)
      try {
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        // Determine content type based on extension
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.flac': 'audio/flac',
          '.aac': 'audio/aac',
          '.m4a': 'audio/mp4',
          '.ogg': 'audio/ogg'
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // Handle Range requests for seeking
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            const stream = fs.createReadStream(filePath, { start, end });
            return new Response(stream, {
              status: 206,
              headers: {
                'Content-Type': contentType,
                'Content-Length': chunkSize.toString(),
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes'
              }
            });
          }
        }

        // Full file response
        const stream = fs.createReadStream(filePath);
        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Length': fileSize.toString(),
            'Accept-Ranges': 'bytes'
          }
        });
      } catch (err) {
        console.error('[localfile protocol] Error:', err);
        return new Response('File not found', { status: 404 });
      }
    });

    createWindow();
  });
}

function startBackend() {
  if (isDev) return;

  const backendExe = path.join(process.resourcesPath, 'ghost_backend.exe');
  console.log('Spawning backend from:', backendExe);

  if (!fs.existsSync(backendExe)) {
    console.error('Backend executable not found!');
    return;
  }

  backendProcess = spawn(backendExe, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.dirname(backendExe),
    env: {
      ...process.env,
      MONGODB_URI: process.env.MONGODB_URI,
      DJANGO_SETTINGS_MODULE: 'config.settings'
    }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log('[Backend]:', data.toString());
  });

  backendProcess.stderr.on('data', (data) => {
    console.error('[Backend Error]:', data.toString());
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend exited with code ${code} and signal ${signal}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../build/icon.ico'),
  });

  if (isDev) {
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    mainWindow.loadURL(startUrl + '/app');
  } else {
    // Load UI immediately
    mainWindow.loadURL('app://-/app.html');

    // Start backend in background
    startBackend();
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-drives', async () => {
  return { drives: await services.getDrives() };
});

ipcMain.handle('system-status', async () => {
  return await services.getSystemStatus();
});

ipcMain.handle('rip-cd', async (event, args) => {
  try {
    const drive = args.drive_path;
    if (!drive) throw new Error('No drive path provided');
    console.log('[IPC rip-cd] Starting rip for:', drive);
    const result = await services.ripCD(args, event.sender);
    console.log('[IPC rip-cd] Result:', result);
    // Return the backend response directly (it has status: 'completed')
    return result;
  } catch (err) {
    console.error("[IPC rip-cd] Error:", err);
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('get-cd-metadata', async (event, args) => {
  return await services.getCdMetadata(args);
});

ipcMain.handle('cancel-rip', async (event, args) => {
  try {
    const sessionId = args?.session_id || '__all__';
    console.log('[IPC cancel-rip] Cancelling session:', sessionId);
    return await services.cancelRip(sessionId);
  } catch (err) {
    console.error('[IPC cancel-rip] Error:', err);
    return { error: err.message };
  }
});

const dbConnect = require('./db');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// Auth IPC Handlers
ipcMain.handle('auth-login', async (event, { username, password }) => {
  try {
    await dbConnect();
    const user = await User.findOne({ username });
    if (!user) return { error: "Invalid credentials" };

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return { error: "Invalid credentials" };

    const token = jwt.sign(
      { id: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      access: token,
      user: { username: user.username, email: user.email, id: user._id }
    };
  } catch (err) {
    console.error("Login IPC error:", err);
    return { error: err.message };
  }
});

ipcMain.handle('auth-register', async (event, { username, password, email }) => {
  try {
    await dbConnect();
    // Sanitize email: if empty string, set to null so sparse index works
    const sanitizedEmail = email === "" ? null : email;

    const existingUser = await User.findOne({ username });
    if (existingUser) return { error: "User already exists" };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ username, password: hashedPassword, email: sanitizedEmail });
    return { success: true, username: user.username };
  } catch (err) {
    console.error("Register IPC error:", err);
    return { error: err.message };
  }
});

ipcMain.handle('auth-me', async (event, token) => {
  try {
    if (!token) return { error: "No token provided" };
    const decoded = jwt.verify(token, JWT_SECRET);
    return { username: decoded.username, id: decoded.id };
  } catch (err) {
    return { error: "Invalid token" };
  }
});

ipcMain.handle('dashboard-stats', async (event, args) => {
  try {
    // args can be { token, mongo_user_id } or just token string (legacy)
    const token = typeof args === 'string' ? args : args?.token;
    const mongoUserId = typeof args === 'object' ? args?.mongo_user_id : null;
    return await services.getDashboardStats(token, mongoUserId);
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    return { total_albums: 0, total_tracks: 0, recent_albums: [] };
  }
});

ipcMain.handle('library-get', async (event, args) => {
  // args can be { token, mongo_user_id } or just token string (legacy)
  const token = typeof args === 'string' ? args : args?.token;
  const mongoUserId = typeof args === 'object' ? args?.mongo_user_id : null;
  return await services.getLibrary(token, mongoUserId);
});

ipcMain.handle('library-delete', async (event, args) => {
  const { album_id, mongo_user_id } = args;
  return await services.deleteAlbum(album_id, mongo_user_id);
});

// Import local audio files
ipcMain.handle('import-local-files', async (event, args) => {
  const { mongo_user_id } = args;

  // Open file dialog
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const files = result.filePaths;
  console.log('[Import Local] Selected files:', files);

  // Get library path
  const os = require('os');
  const libraryPath = path.join(os.homedir(), 'Music', 'GhostAudio Library');

  // Prompt for album info
  // For simplicity, derive album name from folder or use "Imported Album"
  const firstFile = files[0];
  const folderName = path.basename(path.dirname(firstFile));
  const albumName = folderName !== 'Music' && folderName !== os.homedir() ? folderName : 'Imported Album';
  const artistName = 'Unknown Artist';

  // Create album folder
  const albumFolder = path.join(libraryPath, artistName, albumName);
  if (!fs.existsSync(albumFolder)) {
    fs.mkdirSync(albumFolder, { recursive: true });
  }

  // Copy files and build track list
  const tracks = [];
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i];
    const fileName = path.basename(srcFile);
    const destFile = path.join(albumFolder, fileName);

    // Copy file if not already in library
    if (srcFile !== destFile) {
      fs.copyFileSync(srcFile, destFile);
    }

    // Extract track name from filename (remove extension and leading numbers)
    let trackTitle = path.basename(fileName, path.extname(fileName));
    trackTitle = trackTitle.replace(/^\d+[\s\-_.]*/, ''); // Remove leading track numbers

    // Upload to R2 if backend supports it; fall back to local path
    let audioUrl = destFile;
    try {
      const fileBuffer = fs.readFileSync(destFile);
      const formData = new FormData();
      formData.append('user_id', mongo_user_id);
      formData.append('album_title', albumName);
      formData.append('artist', artistName);
      formData.append('file', new Blob([fileBuffer]), path.basename(destFile));
      const uploadRes = await fetch('http://127.0.0.1:8000/api/mongo/upload-audio/', {
        method: 'POST',
        body: formData
      });
      if (uploadRes.ok) {
        const { url } = await uploadRes.json();
        if (url) audioUrl = url;
      }
    } catch (uploadErr) {
      console.warn('[Import Local] R2 upload failed, using local path:', uploadErr.message);
    }

    tracks.push({
      title: trackTitle || `Track ${i + 1}`,
      trackNumber: i + 1,
      audioFile: audioUrl,
      duration: '00:00'
    });
  }

  // Save to MongoDB via backend
  try {
    const response = await fetch('http://127.0.0.1:8000/api/mongo/import-local/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: mongo_user_id,
        title: albumName,
        artist: artistName,
        tracks: tracks
      })
    });

    if (!response.ok) {
      throw new Error('Failed to save album');
    }

    const data = await response.json();
    console.log('[Import Local] Album saved:', data);
    return { success: true, album: data };
  } catch (err) {
    console.error('[Import Local] Error saving album:', err);
    return { success: false, error: err.message };
  }
});

// Playlist IPC Handlers
ipcMain.handle('playlist-get-all', async (event, args) => {
  return await services.Playlists.getAll(args.mongo_user_id);
});

ipcMain.handle('playlist-get-one', async (event, args) => {
  return await services.Playlists.getOne(args.playlist_id, args.mongo_user_id);
});

ipcMain.handle('playlist-create', async (event, args) => {
  return await services.Playlists.create(args);
});

ipcMain.handle('playlist-update', async (event, args) => {
  const { playlist_id, ...data } = args;
  return await services.Playlists.update(playlist_id, data);
});

ipcMain.handle('playlist-delete', async (event, args) => {
  return await services.Playlists.delete(args.playlist_id, args.mongo_user_id);
});

ipcMain.handle('playlist-add-items', async (event, args) => {
  const { playlist_id, ...data } = args;
  return await services.Playlists.addItems(playlist_id, data);
});

ipcMain.handle('playlist-remove-item', async (event, args) => {
  return await services.Playlists.removeItem(args.playlist_id, args.item_index, args.mongo_user_id);
});

ipcMain.handle('playlist-refresh', async (event, args) => {
  const { playlist_id, ...data } = args;
  return await services.Playlists.refresh(playlist_id, data);
});

// Library add removed - handled by Rip CD process




app.on('window-all-closed', async function () {
  if (process.platform !== 'darwin') {
    // Best-effort cancel all active rip sessions before shutdown
    try {
      await services.cancelRip('__all__');
    } catch (e) {
      console.warn('[Shutdown] Failed to cancel active rips:', e);
    }
    // Kill backend
    if (backendProcess) {
      backendProcess.kill();
    }
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});
