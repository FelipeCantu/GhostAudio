const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const serve = require('electron-serve');
const services = require('./services');

let mainWindow;
let backendProcess = null;

const isDev = !app.isPackaged;
const appServe = isDev ? null : serve({ directory: path.join(__dirname, '../out') });

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For easier IPC in prototype
    },
  });

  if (isDev) {
    const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    mainWindow.loadURL(startUrl);
  } else {
    // In production, serve the app via electron-serve
    appServe(mainWindow).then(() => {
      mainWindow.loadURL('app://-');

      // Spawn Backend
      const backendExe = path.join(process.resourcesPath, 'ghost_backend.exe');
      console.log('Spawning backend from:', backendExe);

      backendProcess = spawn(backendExe, [], {
        stdio: 'ignore',
        env: {
          ...process.env,
          // Inject Production DB Connection String
          MONGODB_URI: "mongodb+srv://felipecantujr:Chevelle1984@cluster0.yixlkpe.mongodb.net/dizc?retryWrites=true&w=majority&appName=Cluster0"
        }
      });

      backendProcess.on('error', (err) => {
        console.error('Failed to start backend:', err);
      });
    });
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('get-drives', async () => {
  return { drives: await services.getDrives() };
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
    const existingUser = await User.findOne({ username });
    if (existingUser) return { error: "User already exists" };

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ username, password: hashedPassword, email });
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
