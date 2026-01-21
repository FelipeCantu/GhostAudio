const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const serve = require('electron-serve');

let mainWindow;
let pythonProcess;

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
      // DEBUGGING: Open DevTools to see why it's white
      mainWindow.webContents.openDevTools();
    });
  }

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startPythonBackend() {
  const backendPath = isDev
    ? path.join(__dirname, '../../backend')
    : path.join(process.resourcesPath);

  let pythonCmd, args;

  if (isDev) {
    pythonCmd = path.join(backendPath, 'venv/Scripts/python.exe');
    const managePy = path.join(backendPath, 'manage.py');
    args = [managePy, 'runserver', '8000'];
  } else {
    pythonCmd = path.join(backendPath, 'backend.exe');
    args = ['runserver', '8000', '--noreload'];
  }

  console.log(`[Electron] Starting backend with: ${pythonCmd} ${args.join(' ')}`);

  // Check if executable exists
  const fs = require('fs');
  if (!fs.existsSync(pythonCmd)) {
    console.error(`[Electron] Backend executable not found at: ${pythonCmd}`);
    return;
  }

  pythonProcess = spawn(pythonCmd, args, {
    cwd: isDev ? backendPath : undefined,
    stdio: 'pipe', // Explicitly pipe stdio
    detached: false,
    shell: false
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    // Django sometimes logs info to stderr
    console.log(`[Backend LOG] ${data.toString().trim()}`);
  });

  pythonProcess.on('error', (err) => {
    console.error('[Electron] Failed to start backend process:', err);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[Electron] Backend process exited with code ${code}`);
    pythonProcess = null;
  });
}

app.on('ready', () => {
  startPythonBackend();
  // Wait a bit for the backend to spin up
  setTimeout(createWindow, isDev ? 3000 : 1000);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
