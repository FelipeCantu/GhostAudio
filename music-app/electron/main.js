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
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

function _getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function _uploadTrackToR2(localPath, objectKey) {
  if (!process.env.R2_ACCOUNT_ID) return null;
  const fileStream = fs.createReadStream(localPath);
  const ext = path.extname(localPath).toLowerCase().slice(1);
  const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' }[ext] || 'application/octet-stream';
  await _getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: objectKey,
    Body: fileStream,
    ContentType: mime,
  }));
  return `${process.env.R2_PUBLIC_URL}/${objectKey}`;
}

let mainWindow;
let backendProcess = null;

const isDev = !app.isPackaged;
// const appServe = isDev ? null : serve({ directory: path.join(__dirname, '../out') }); // Removed



// Custom Protocol Handler for Production
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
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
    const metadata = args.metadata || {};
    const artist = metadata.artist || 'Unknown Artist';
    const album = metadata.album || 'Unknown Album';
    const mongoUserId = args.mongo_user_id;

    // Normalize: old backend sends tracks as a count (number), new sends the array of paths.
    let trackPaths = Array.isArray(result.tracks) ? result.tracks : [];

    // Fallback: if backend didn't send file paths, scan the ripped album folder directly.
    if (trackPaths.length === 0 && result.albumId) {
      const os = require('os');
      const sanitize = (s) => `${s}`.split('').filter(c => /[a-zA-Z0-9 ._-]/.test(c)).join('').trim();
      const libraryBase = path.join(os.homedir(), 'Music', 'GhostAudio Library');
      const albumFolder = path.join(libraryBase, sanitize(artist), sanitize(album));
      if (fs.existsSync(albumFolder)) {
        const audioExts = new Set(['.wav', '.flac', '.mp3', '.m4a', '.aac', '.ogg']);
        trackPaths = fs.readdirSync(albumFolder)
          .filter(f => audioExts.has(path.extname(f).toLowerCase()))
          .sort()
          .map(f => path.join(albumFolder, f));
        console.log('[IPC rip-cd] Fallback folder scan:', trackPaths.length, 'tracks in', albumFolder);
      }
    }

    console.log('[IPC rip-cd] Rip done, albumId:', result.albumId, 'trackPaths:', trackPaths.length);

    // Upload tracks to R2 from Electron (Node.js TLS works; frozen Python TLS does not)
    if (result.albumId && trackPaths.length > 0 && process.env.R2_ACCOUNT_ID) {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('rip-progress', { type: 'progress', message: 'Uploading to cloud...' });
      }

      const updatedTracks = [];
      for (const localPath of trackPaths) {
        const filename = path.basename(localPath);
        const objectKey = `audio/${mongoUserId}/${artist}/${album}/${filename}`;
        try {
          const r2Url = await _uploadTrackToR2(localPath, objectKey);
          const trackNumMatch = filename.match(/^(\d+)/);
          const trackNumber = trackNumMatch ? parseInt(trackNumMatch[1]) : 0;
          if (r2Url) updatedTracks.push({ track_number: trackNumber, audio_file: r2Url });
          console.log('[IPC rip-cd] Uploaded:', filename, '->', r2Url);
        } catch (uploadErr) {
          console.error('[IPC rip-cd] R2 upload failed for', filename, uploadErr.message);
        }
      }

      if (updatedTracks.length > 0) {
        try {
          await fetch('http://127.0.0.1:8000/api/mongo/update-track-urls/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Include mongo_user_id so the backend can verify album ownership.
            body: JSON.stringify({ album_id: result.albumId, tracks: updatedTracks, mongo_user_id: mongoUserId }),
          });
          console.log('[IPC rip-cd] MongoDB track URLs updated with R2 paths');
        } catch (patchErr) {
          console.error('[IPC rip-cd] Failed to update track URLs in MongoDB:', patchErr.message);
        }
      }
    }

    return result;
  } catch (err) {
    console.error("[IPC rip-cd] Error:", err);
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('get-cd-metadata', async (event, args) => {
  return await services.getCdMetadata(args);
});

// Retroactively upload local-path tracks to R2 and patch MongoDB.
// Called from Settings page so users can fix albums imported before R2 was working.
ipcMain.handle('migrate-local-to-r2', async (event, { mongoUserId }) => {
  if (!process.env.R2_ACCOUNT_ID) return { error: 'R2 not configured' };
  try {
    const libRes = await fetch(`http://127.0.0.1:8000/api/mongo/library/?user_id=${mongoUserId}`);
    const libData = await libRes.json();
    // The /api/mongo/library/ endpoint returns a plain array, not { albums: [] }.
    const albums = Array.isArray(libData) ? libData : (libData.albums || []);
    let totalPatched = 0;
    for (const album of albums) {
      const updatedTracks = [];
      let needsPatch = false;
      for (const track of album.tracks || []) {
        const audioFile = track.audioFile || '';
        if (audioFile && !audioFile.startsWith('http')) {
          // Local path — upload to R2
          if (fs.existsSync(audioFile)) {
            const filename = path.basename(audioFile);
            // MongoDB documents use album.title (not album.album) for the album name.
            const objectKey = `audio/${mongoUserId}/${album.artist || 'Unknown'}/${album.title || 'Unknown'}/${filename}`;
            try {
              const r2Url = await _uploadTrackToR2(audioFile, objectKey);
              if (r2Url) {
                updatedTracks.push({ track_number: track.trackNumber || 0, audio_file: r2Url });
                needsPatch = true;
              }
            } catch (e) {
              console.error('[migrate-local-to-r2] Upload failed:', filename, e.message);
            }
          }
        }
      }
      if (needsPatch && updatedTracks.length > 0) {
        await fetch('http://127.0.0.1:8000/api/mongo/update-track-urls/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Include mongo_user_id so the backend can verify album ownership.
          body: JSON.stringify({ album_id: album._id, tracks: updatedTracks, mongo_user_id: mongoUserId }),
        });
        totalPatched += updatedTracks.length;
        console.log('[migrate-local-to-r2] Patched album:', album.album, updatedTracks.length, 'tracks');
      }
    }
    return { ok: true, patched: totalPatched };
  } catch (err) {
    console.error('[migrate-local-to-r2] Error:', err);
    return { error: err.message };
  }
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
      user: { username: user.username, email: user.email, id: user._id.toString() }
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
