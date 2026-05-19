import { app, BrowserWindow, shell, dialog } from 'electron';
import * as http from 'http';
import * as path from 'path';
import type { Application } from 'express';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../package.json') as { version: string };
const CURRENT_VERSION: string = pkg.version;

let mainWindow: BrowserWindow | null = null;
let httpServer: http.Server | null = null;
let serverPort = 0;

/**
 * Start the embedded Express server on an OS-assigned port and return that port.
 */
function startServer(): Promise<number> {
  return new Promise((resolve, reject) => {
    const createApp = loadCreateApp();
    const expressApp = createApp();
    httpServer = expressApp.listen(0, '127.0.0.1', () => {
      const addr = httpServer!.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Could not determine server port'));
      }
    });
    httpServer.on('error', reject);
  });
}

function loadCreateApp(): () => Application {
  const appPath = app.getAppPath();
  const serverModulePath = path.join(appPath, 'dist', 'api', 'server.js');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const loaded = require(serverModulePath) as { createApp?: () => Application };
  if (!loaded.createApp) {
    throw new Error(`Could not load createApp from ${serverModulePath}`);
  }
  return loaded.createApp;
}

function isLocalAppUrl(url: string, port: number): boolean {
  return url.startsWith(`http://127.0.0.1:${port}`);
}

async function checkForUpdateAndNotify(): Promise<void> {
  try {
    // Load the updateChecker from the compiled dist directory at runtime,
    // consistent with how the embedded Express server is loaded.
    const checkerPath = path.join(app.getAppPath(), 'dist', 'core', 'updateChecker.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { checkForUpdate } = require(checkerPath) as {
      checkForUpdate: (version: string, timeoutMs?: number) => Promise<string | null>;
    };

    const latest = await checkForUpdate(CURRENT_VERSION, 8000);
    if (!latest) return;

    const result = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version of docx-to-md is available`,
      detail: `Current version: v${CURRENT_VERSION}\nLatest version:  v${latest}\n\nWould you like to view the release page?`,
      buttons: ['View Release', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      await shell.openExternal(
        'https://github.com/Christopher-C-Robinson/docx-to-md/releases/latest'
      );
    }
  } catch {
    // Silently ignore update check failures
  }
}

function createWindow(port: number): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'docx → md Converter',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Open external links in the system browser rather than inside Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalAppUrl(url, port)) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isLocalAppUrl(url, port)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('did-redirect-navigation', (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame && !isLocalAppUrl(url, port)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    serverPort = await startServer();
    createWindow(serverPort);
    // Check for updates in the background after the window is ready.
    checkForUpdateAndNotify();
  } catch (err) {
    console.error('Failed to start server:', err);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (httpServer) {
    httpServer.close();
  }
  // On macOS it is conventional to keep the app open until the user quits
  // explicitly, but since this app is purely window-based we quit on all platforms.
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort > 0) {
    createWindow(serverPort);
  }
});
