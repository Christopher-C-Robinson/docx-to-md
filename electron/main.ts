import { app, BrowserWindow, shell } from 'electron';
import * as http from 'http';
import * as path from 'path';
import type { Application } from 'express';

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
