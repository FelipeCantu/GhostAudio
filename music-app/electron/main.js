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
  // Electron uses BoringSSL which fails the TLS handshake with Cloudflare R2.
  // Disable TLS cert validation for R2 uploads only (same workaround as Python's verify=False).
  const https = require('https');
  const { NodeHttpHandler } = require('@smithy/node-http-handler');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    }),
  });
}

async function _uploadTrackToR2(localPath, objectKey) {
  if (!process.env.R2_ACCOUNT_ID) return null;
  const fileSize = fs.statSync(localPath).size;
  const fileStream = fs.createReadStream(localPath);
  const ext = path.extname(localPath).toLowerCase().slice(1);
  const mime = { mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' }[ext] || 'application/octet-stream';
  await _getR2Client().send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: objectKey,
    Body: fileStream,
    ContentType: mime,
    ContentLength: fileSize,
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

    // Recovery: ERR_NETWORK_IO_SUSPENDED severed the SSE stream before Django sent the
    // 'saved' event. Wait for Django to finish, check MongoDB, and create the album if needed.
    if (result.status === 'suspended' && !result.albumId && mongoUserId) {
      const os = require('os');
      const logPath = path.join(os.homedir(), 'ghost_app_debug.log');
      const recLog = (msg) => {
        const line = `[${new Date().toISOString()}] [rip-cd recovery] ${msg}\n`;
        console.log(line.trimEnd());
        try { fs.appendFileSync(logPath, line); } catch (_) {}
      };
      recLog('Stream suspended — waiting 5s for Django to finish saving...');
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('rip-progress', {
          type: 'progress', stage: 'uploading', message: 'Finalizing import...'
        });
      }
      await new Promise(r => setTimeout(r, 5000));

      // Scan disk for ripped audio files
      const sanitize = (s) => `${s}`.split('').filter(c => /[a-zA-Z0-9 ._-]/.test(c)).join('').trim();
      const libraryBase = path.join(os.homedir(), 'Music', 'GhostAudio Library');
      const albumFolder = path.join(libraryBase, sanitize(artist), sanitize(album));
      const audioExts = new Set(['.wav', '.flac', '.mp3', '.m4a', '.aac', '.ogg']);
      let diskTrackFiles = [];
      if (fs.existsSync(albumFolder)) {
        diskTrackFiles = fs.readdirSync(albumFolder)
          .filter(f => audioExts.has(path.extname(f).toLowerCase()))
          .sort()
          .map(f => path.join(albumFolder, f));
      }
      recLog(`Disk scan: ${diskTrackFiles.length} audio file(s) in ${albumFolder}`);

      if (diskTrackFiles.length === 0) {
        recLog('No audio files on disk — rip did not complete');
        return { status: 'error', message: 'Import was interrupted and no audio files were found on disk.' };
      }

      try {
        // Check if Django saved the album to MongoDB while we waited
        const libRes = await fetch(`http://127.0.0.1:8000/api/mongo/library/?user_id=${mongoUserId}`);
        const libData = await libRes.json();
        const allAlbums = Array.isArray(libData) ? libData : [];
        const djangoAlbum = allAlbums.find(a => a.title === album && a.artist === artist);

        if (djangoAlbum) {
          recLog(`Album found in MongoDB (Django saved it): ${djangoAlbum._id}`);
          result.albumId = djangoAlbum._id;
          result.status = 'completed';
        } else {
          // Django didn't save — create the album from disk scan + CD metadata
          recLog('Album not in MongoDB — creating from disk scan');
          const metaTracks = ((args.metadata || {}).tracks || []).sort((a, b) =>
            parseInt(a.track_number) - parseInt(b.track_number)
          );
          const tracks = diskTrackFiles.map((filePath, idx) => {
            const meta = metaTracks[idx] || {};
            return {
              title: meta.title || path.basename(filePath, path.extname(filePath)),
              trackNumber: parseInt(meta.track_number) || (idx + 1),
              audioFile: filePath,
              duration: meta.duration_ms ? String(Math.round(parseInt(meta.duration_ms) / 1000)) : '0'
            };
          });
          const saveRes = await fetch('http://127.0.0.1:8000/api/mongo/import-local/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: mongoUserId,
              title: album,
              artist: artist,
              year: (args.metadata || {}).year || '',
              tracks: tracks
            })
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            recLog(`Album created in MongoDB: ${saveData.album_id}`);
            result.albumId = saveData.album_id;
            result.status = 'completed';
          } else {
            recLog(`Failed to save album to MongoDB: HTTP ${saveRes.status}`);
          }
        }
      } catch (recErr) {
        recLog(`Recovery error: ${recErr.message}`);
      }
    }

    // Auto-sync to R2: fetch album from MongoDB, upload any local-path tracks to R2,
    // then patch MongoDB so the web browser can play them immediately.
    // Mirrors migrate-local-to-r2 (which is proven to work) but targets this specific album.
    if (result.albumId && mongoUserId && process.env.R2_ACCOUNT_ID) {
      const os = require('os');
      const logPath = path.join(os.homedir(), 'ghost_app_debug.log');
      const ripLog = (msg) => {
        const line = `[${new Date().toISOString()}] [rip-cd auto-sync] ${msg}\n`;
        console.log(line.trimEnd());
        try { fs.appendFileSync(logPath, line); } catch (_) {}
      };

      try {
        ripLog(`Starting auto-sync for album ${result.albumId}`);

        // Fetch fresh album data so we see the actual audioFile URLs saved by Python
        const libRes = await fetch(`http://127.0.0.1:8000/api/mongo/library/?user_id=${mongoUserId}`);
        const libData = await libRes.json();
        const albums = Array.isArray(libData) ? libData : [];
        const savedAlbum = albums.find(a => a._id === result.albumId);

        if (!savedAlbum) {
          ripLog(`Album ${result.albumId} not found in library — skipping auto-sync`);
        } else {
          const tracksToUpload = (savedAlbum.tracks || []).filter(t => {
            const url = t.audioFile || '';
            return url && !url.startsWith('http');
          });

          ripLog(`${tracksToUpload.length} track(s) need R2 upload (have local paths)`);

          const updatedTracks = [];
          for (let i = 0; i < tracksToUpload.length; i++) {
            const track = tracksToUpload[i];
            const localPath = track.audioFile;
            const filename = path.basename(localPath);
            const objectKey = `audio/${mongoUserId}/${savedAlbum.artist || 'Unknown'}/${savedAlbum.title || 'Unknown'}/${filename}`;

            if (event.sender && !event.sender.isDestroyed()) {
              event.sender.send('rip-progress', {
                type: 'progress',
                stage: 'uploading',
                message: `Uploading to cloud: ${i + 1} / ${tracksToUpload.length}`,
                current: i + 1,
                total: tracksToUpload.length,
              });
            }

            ripLog(`Uploading track ${track.trackNumber}: ${filename}`);
            try {
              const r2Url = await _uploadTrackToR2(localPath, objectKey);
              if (r2Url) {
                updatedTracks.push({ track_number: track.trackNumber, audio_file: r2Url });
                ripLog(`Uploaded: ${filename} -> ${r2Url.slice(0, 60)}`);
              } else {
                ripLog(`Upload returned null for ${filename} (R2 may not be configured)`);
              }
            } catch (uploadErr) {
              ripLog(`Upload FAILED for ${filename}: ${uploadErr.message}`);
            }
          }

          if (updatedTracks.length > 0) {
            const patchRes = await fetch('http://127.0.0.1:8000/api/mongo/update-track-urls/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ album_id: result.albumId, tracks: updatedTracks, mongo_user_id: mongoUserId }),
            });
            ripLog(`MongoDB patch: HTTP ${patchRes.status} — ${updatedTracks.length} track(s) updated`);
          } else if (tracksToUpload.length > 0) {
            ripLog('No tracks successfully uploaded — MongoDB not patched');
          } else {
            ripLog('All tracks already have R2 URLs — no patch needed');
          }
        }
      } catch (syncErr) {
        console.error('[IPC rip-cd] Auto-sync error:', syncErr.message);
        try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] [rip-cd auto-sync] ERROR: ${syncErr.message}\n`); } catch (_) {}
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
  const os = require('os');
  const logPath = path.join(os.homedir(), 'ghost_app_debug.log');

  /** Append a timestamped line to ghost_app_debug.log. */
  function migLog(msg) {
    const line = `[${new Date().toISOString()}] [migrate-local-to-r2] ${msg}\n`;
    console.log(line.trimEnd());
    try { fs.appendFileSync(logPath, line); } catch (_) {}
  }

  if (!process.env.R2_ACCOUNT_ID) {
    migLog('R2 not configured — R2_ACCOUNT_ID is missing. Aborting.');
    return { error: 'R2 not configured' };
  }

  migLog(`Starting migration for user: ${mongoUserId}`);
  migLog(`R2 bucket: ${process.env.R2_BUCKET_NAME}  endpoint: ${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);

  try {
    const libRes = await fetch(`http://127.0.0.1:8000/api/mongo/library/?user_id=${mongoUserId}`);
    const libData = await libRes.json();
    // The /api/mongo/library/ endpoint returns a plain array, not { albums: [] }.
    const albums = Array.isArray(libData) ? libData : (libData.albums || []);
    migLog(`Library fetched — ${albums.length} album(s) found`);

    let totalPatched = 0;
    for (const album of albums) {
      const albumLabel = `"${album.title || album.album || album._id}"`;
      const trackCount = (album.tracks || []).length;
      migLog(`Album ${albumLabel}: ${trackCount} track(s)`);

      const updatedTracks = [];
      let needsPatch = false;
      for (const track of album.tracks || []) {
        const audioFile = track.audioFile || '';
        migLog(`  Track ${track.trackNumber || '?'} audioFile="${audioFile}"`);

        if (!audioFile) {
          migLog(`  -> Skipped: audioFile is empty`);
          continue;
        }
        if (audioFile.startsWith('http')) {
          migLog(`  -> Skipped: already an HTTP URL`);
          continue;
        }

        // Local path — check file exists before attempting upload
        const exists = fs.existsSync(audioFile);
        migLog(`  -> Local path, fs.existsSync=${exists}`);
        if (!exists) {
          migLog(`  -> Skipped: file not found on disk`);
          continue;
        }

        const filename = path.basename(audioFile);
        // MongoDB documents use album.title (not album.album) for the album name.
        const objectKey = `audio/${mongoUserId}/${album.artist || 'Unknown'}/${album.title || 'Unknown'}/${filename}`;
        migLog(`  -> Uploading to R2 key: ${objectKey}`);
        try {
          const r2Url = await _uploadTrackToR2(audioFile, objectKey);
          if (r2Url) {
            migLog(`  -> Upload SUCCESS: ${r2Url}`);
            updatedTracks.push({ track_number: track.trackNumber || 0, audio_file: r2Url });
            needsPatch = true;
          } else {
            migLog(`  -> Upload returned null URL (R2_ACCOUNT_ID may be unset)`);
          }
        } catch (e) {
          migLog(`  -> Upload FAILED: ${e.message}`);
        }
      }

      if (needsPatch && updatedTracks.length > 0) {
        migLog(`Patching MongoDB for album ${albumLabel} — ${updatedTracks.length} track URL(s) to update`);
        try {
          const patchRes = await fetch('http://127.0.0.1:8000/api/mongo/update-track-urls/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Include mongo_user_id so the backend can verify album ownership.
            body: JSON.stringify({ album_id: album._id, tracks: updatedTracks, mongo_user_id: mongoUserId }),
          });
          const patchBody = await patchRes.json().catch(() => ({}));
          migLog(`MongoDB patch response HTTP ${patchRes.status}: ${JSON.stringify(patchBody)}`);
          totalPatched += updatedTracks.length;
        } catch (patchErr) {
          migLog(`MongoDB patch FAILED for album ${albumLabel}: ${patchErr.message}`);
        }
      } else {
        migLog(`Album ${albumLabel}: nothing to patch`);
      }
    }

    migLog(`Migration complete — ${totalPatched} track(s) patched across all albums`);
    return { ok: true, patched: totalPatched };
  } catch (err) {
    migLog(`Unhandled error: ${err.message}\n${err.stack}`);
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

  // Derive album name from the shared parent folder, fall back to 'Imported Album'
  const firstFile = files[0];
  const folderName = path.basename(path.dirname(firstFile));
  const albumName = folderName !== 'Music' && folderName !== os.homedir() ? folderName : 'Imported Album';
  const artistName = 'Unknown Artist';

  // Create album folder in the local library
  const albumFolder = path.join(libraryPath, artistName, albumName);
  if (!fs.existsSync(albumFolder)) {
    fs.mkdirSync(albumFolder, { recursive: true });
  }

  // Helper: upload a single track to R2 with up to maxRetries attempts.
  // Returns the R2 URL on success, or null if R2 is not configured.
  // Throws if all retries are exhausted — caller decides how to handle.
  const uploadWithRetry = async (localPath, objectKey, maxRetries = 3) => {
    if (!process.env.R2_ACCOUNT_ID) return null;
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const url = await _uploadTrackToR2(localPath, objectKey);
        if (url) return url;
      } catch (err) {
        lastErr = err;
        console.warn(`[Import Local] R2 upload attempt ${attempt}/${maxRetries} failed:`, err.message);
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * attempt));
      }
    }
    throw lastErr || new Error('R2 upload returned no URL');
  };

  // Step 1: Copy all files to the local library folder first.
  const fileInfos = [];
  for (let i = 0; i < files.length; i++) {
    const srcFile = files[i];
    const fileName = path.basename(srcFile);
    const destFile = path.join(albumFolder, fileName);
    if (srcFile !== destFile) fs.copyFileSync(srcFile, destFile);

    let trackTitle = path.basename(fileName, path.extname(fileName));
    trackTitle = trackTitle.replace(/^\d+[\s\-_.]*/, '').trim() || `Track ${i + 1}`;
    fileInfos.push({ destFile, fileName, trackTitle, trackNumber: i + 1 });
  }

  // Step 2: Upload all tracks to R2 before touching MongoDB.
  // If R2 is configured, every track must have an R2 URL — no local paths allowed
  // in MongoDB because the web browser cannot play them.
  const tracks = [];
  const r2Configured = !!process.env.R2_ACCOUNT_ID;

  for (let i = 0; i < fileInfos.length; i++) {
    const { destFile, fileName, trackTitle, trackNumber } = fileInfos[i];

    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('rip-progress', {
        type: 'progress',
        message: `Uploading to cloud: ${i + 1} / ${fileInfos.length}`
      });
    }

    let audioUrl = destFile; // fallback for when R2 is not configured
    if (r2Configured) {
      const objectKey = `audio/${mongo_user_id}/${artistName}/${albumName}/${fileName}`;
      try {
        audioUrl = await uploadWithRetry(destFile, objectKey, 3);
        console.log('[Import Local] Uploaded to R2:', fileName, '->', audioUrl);
      } catch (uploadErr) {
        // All 3 attempts failed — abort the entire import so the user gets a clear
        // error rather than silently saving a local path that won't play in the browser.
        console.error('[Import Local] R2 upload failed after retries:', uploadErr.message);
        return { success: false, error: `Cloud upload failed for "${fileName}": ${uploadErr.message}. Please check your internet connection and try again.` };
      }
    }

    tracks.push({ title: trackTitle, trackNumber, audioFile: audioUrl, duration: '0' });
  }

  // Step 3: All uploads succeeded — now save to MongoDB.
  // At this point every track.audioFile is either an R2 https:// URL or a local path
  // (only when R2 is not configured, i.e. desktop-only mode).
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

    if (!response.ok) throw new Error(`Backend returned ${response.status}`);

    const data = await response.json();
    console.log('[Import Local] Album saved to MongoDB with', tracks.length, 'track(s), all with R2 URLs:', data);
    return { success: true, album: data };
  } catch (err) {
    console.error('[Import Local] Error saving album to MongoDB:', err);
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
