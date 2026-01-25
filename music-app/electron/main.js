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

    // We can send progress updates back to the renderer if we want
    const tracks = await services.ripCD(args, event.sender);
    return { status: 'started', drive: drive, tracks: tracks };
    // Note: The original returned "started" immediately and simulated async.
    // JS is async by default, but IPC handlers await the result.
    // For long operations, better to just return "started" and send events,
    // OR await it all if it's fast enough. 
    // Given the UI waits for "completed", we can just await it here but maybe the UI expects immediate return?
    // The original UI polling logic was: status=started, then wait 5s.
    // Let's stick to the await behavior but return compatible object.
    // ACTUALLY: The UI code does `const data = await res.json(); if (data.status === "started")`.
    // If we await the whole rip here, the UI will hang for the duration of the rip.
    // For a better UX, we should probably run the rip in background.

    // HOWEVER, to keep it simple and robust for this "Removing Backend" task:
    // We can return "started" immediately, and then do the work?
    // But main process shouldn't block.
    // Let's do the work asynchronously and send a "rip-complete" event, 
    // OR just return the result if it's fast (simulation).
    // Since we are simulating mostly or doing real ffmpeg which takes time,
    // let's return { status: 'started' } and let the UI's existing 5s timeout handle the "fake complete"
    // for now, adjusting the UI to listen for real completion would be better but larger scope.
    // Wait... the UI says "Importing tracks..." then `setTimeout` 5s.
    // So the UI assumes it's async and fire-and-forget from the API perspective.

    // Let's match that: Start the process, return valid response.
    ripInBackground(args, event.sender);
    return { status: 'started' };

  } catch (err) {
    console.error("IPC Error:", err);
    return { status: 'error', message: err.message };
  }
});

async function ripInBackground(args, sender) {
  try {
    await services.ripCD(args, sender);
    // Could send an event here if we updated UI to listen
    // sender.send('rip-complete'); 
  } catch (e) {
    console.error("Background rip failed", e);
  }
}

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
