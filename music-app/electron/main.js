const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let pythonProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For easier IPC in prototype
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startPythonBackend() {
  const backendPath = path.join(__dirname, '../../backend');
  const pythonCmd = path.join(backendPath, 'venv/Scripts/python.exe');
  const managePy = path.join(backendPath, 'manage.py');

  pythonProcess = spawn(pythonCmd, [managePy, 'runserver', '8000'], {
    cwd: backendPath,
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`Backend stdout: ${data}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`Backend stderr: ${data}`);
  });
}

app.on('ready', () => {
    startPythonBackend();
    setTimeout(createWindow, 3000); // Wait for Next.js/Django? Better to wait-on
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
