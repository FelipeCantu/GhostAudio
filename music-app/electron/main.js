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
  if (isDev) {
    const backendPath = path.join(__dirname, '../../backend');
    const pythonCmd = path.join(backendPath, 'venv/Scripts/python.exe');
    const managePy = path.join(backendPath, 'manage.py');

    pythonProcess = spawn(pythonCmd, [managePy, 'runserver', '8000'], {
      cwd: backendPath,
    });
  } else {
    // In production, the backend executable is likely placed in extraResources
    const backendExe = path.join(process.resourcesPath, 'backend.exe');
    console.log('Starting packaged backend from:', backendExe);

    // Run the packaged backend
    pythonProcess = spawn(backendExe, ['runserver', '8000', '--noreload']);
  }

  if (pythonProcess) {
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Backend stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      console.error(`Backend stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });
  }
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
