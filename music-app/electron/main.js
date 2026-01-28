const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
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
    // Load the App Dashboard
    mainWindow.loadURL('app://-/app.html');

    // Spawn Backend
    const backendExe = path.join(process.resourcesPath, 'ghost_backend.exe');
    console.log('Spawning backend from:', backendExe);

    backendProcess = spawn(backendExe, [], {
      stdio: 'ignore',
      env: {
        ...process.env,
        MONGODB_URI: process.env.MONGODB_URI
      }
    });

    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err);
    });
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Custom Protocol Handler for Production
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true } }
  ]);
}

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

      console.error(`File not found: ${reqPath}`);
      return net.fetch('file:///' + filePath);
    });
  }
  createWindow();
});

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
    const tracks = await services.ripCD(args, event.sender);
    return { status: 'started', drive: drive, tracks: tracks };
    ripInBackground(args, event.sender);
    return { status: 'started' };
  } catch (err) {
    console.error("IPC Error:", err);
    return { status: 'error', message: err.message };
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

ipcMain.handle('dashboard-stats', async (event, token) => {
  try {
    // For now, return stats from the Mock Library to unblock UI
    // TODO: Connect to real backend if possible or implement full local DB logic here
    const totalAlbums = MOCK_LIBRARY.length;
    const totalTracks = MOCK_LIBRARY.reduce((acc, alb) => acc + (alb.tracks ? alb.tracks.length : 0), 0);
    const recentAlbums = MOCK_LIBRARY.slice(0, 5);

    return {
      total_albums: totalAlbums,
      total_tracks: totalTracks,
      recent_albums: recentAlbums
    };
  } catch (err) {
    console.error("Dashboard Stats Error:", err);
    return { total_albums: 0, total_tracks: 0, recent_albums: [] };
  }
});

// Library IPC Handlers
// Simple in-memory store for demo purposes (matching previous API behavior)
const MOCK_LIBRARY = [
  {
    id: 1,
    title: "Simulation Theory",
    artist: "Muse",
    created_at: new Date().toISOString(),
    cover_art: "https://coverartarchive.org/release/8e0467fb-2374-4299-b9d2-32aa878c772e/front",
    tracks: [
      { id: 1, track_number: 1, title: "Algorithm", audio_file: "", duration: "4:05" },
      { id: 2, track_number: 2, title: "The Dark Side", audio_file: "", duration: "3:47" }
    ]
  }
];

ipcMain.handle('library-get', async (event, token) => {
  try {
    if (!token) throw new Error("Unauthorized");
    // Verify token if needed, but for now just return mock
    return MOCK_LIBRARY;
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('library-add', async (event, { token, album }) => {
  try {
    if (!token) throw new Error("Unauthorized");
    const newAlbum = {
      id: MOCK_LIBRARY.length + 1,
      title: album.title || "Unknown Album",
      artist: album.artist || "Unknown Artist",
      created_at: new Date().toISOString(),
      cover_art: album.cover_art,
      tracks: album.tracks || []
    };
    MOCK_LIBRARY.push(newAlbum);
    return newAlbum;
  } catch (err) {
    return { error: err.message };
  }
});

app.on('ready', () => {
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
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
