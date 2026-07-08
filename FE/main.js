const { app, BrowserWindow, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Check if in development mode
function isDev() {
  // Check if running from electron executable in node_modules (dev mode)
  if (process.defaultApp || /[\\/]electron-prebuilt[\\/]/.test(process.execPath) || /[\\/]electron[\\/]/.test(process.execPath)) {
    return true;
  }
  
  // Check if app path includes node_modules (dev mode)
  try {
    const appPath = app.getPath('exe');
    if (appPath && appPath.includes('node_modules')) {
      return true;
    }
  } catch (e) {
    // Ignore errors
  }
  
  // Check environment variable
  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === '1') {
    return true;
  }
  
  // Production mode
  return false;
}

// Enable DevTools for debugging (set to false for production release)
const ENABLE_DEVTOOLS = false; // Disabled for production

let mainWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      // Allow cookies from external domain 
      partition: 'persist:main' // Use persistent partition for cookies
    },
    icon: (() => {
      const iconPaths = [
        path.join(__dirname, 'public', 'icon.png'),
        path.join(__dirname, 'icon.png'),
        path.join(app.getAppPath(), 'public', 'icon.png')
      ];
      for (const iconPath of iconPaths) {
        if (fs.existsSync(iconPath)) {
          return iconPath;
        }
      }
      return undefined; // Use default icon if none found
    })(),
    show: false, // Don't show until ready
    autoHideMenuBar: true
  });

  // Enable DevTools ONLY if explicitly enabled (not in production)
  // CRITICAL: In production builds, ENABLE_DEVTOOLS=false, so DevTools won't open
  // Even in dev mode (isDev=true), only open if ENABLE_DEVTOOLS is explicitly true
  if (ENABLE_DEVTOOLS) {
    mainWindow.webContents.openDevTools();
  }

  // Log errors to console
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('❌ [Electron] Failed to load:', {
      errorCode,
      errorDescription,
      validatedURL,
      __dirname,
      isDev: isDev()
    });
    
    // Try alternative paths in production
    if (!isDev()) {
      const alternativePaths = [
        path.join(__dirname, 'build', 'index.html'),
        path.join(__dirname, '..', 'build', 'index.html'),
        path.join(process.resourcesPath, 'app', 'build', 'index.html'),
        path.join(app.getAppPath(), 'build', 'index.html')
      ];
      
      console.log('🔍 [Electron] Trying alternative paths:', alternativePaths);
      
      for (const altPath of alternativePaths) {
        if (fs.existsSync(altPath)) {
          console.log('✅ [Electron] Found build at:', altPath);
          mainWindow.loadFile(altPath).catch(err => {
            console.error('❌ [Electron] Failed to load from alternative path:', altPath, err);
          });
          return;
        }
      }
      
      console.error('❌ [Electron] Could not find build/index.html in any location');
    }
  });

  // Log console messages
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Console ${level}]:`, message);
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Maximize window on startup
    mainWindow.maximize();
    // Hide menu bar completely (but keep DevTools accessible via menu if enabled)
    if (!ENABLE_DEVTOOLS && !isDev()) {
      mainWindow.setMenuBarVisibility(false);
    }
  });

  // Load the app
  if (isDev()) {
    // Development: Load from React dev server
    console.log('🔧 [Electron] Development mode - loading from localhost:3000');
    mainWindow.loadURL('http://localhost:3000');
    
    // Auto-reload on changes (optional)
    mainWindow.webContents.on('did-fail-load', () => {
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3000');
      }, 1000);
    });
  } else {
    // Production: Load from build folder
    // electron-builder packages files in app.asar or unpacked app directory
    // The build folder should be at the same level as main.js in the packaged app
    const buildPath = path.join(__dirname, 'build', 'index.html');
    
    console.log('📦 [Electron] Production mode');
    console.log('  - __dirname:', __dirname);
    console.log('  - app.getAppPath():', app.getAppPath());
    console.log('  - process.resourcesPath:', process.resourcesPath);
    console.log('  - buildPath:', buildPath);
    console.log('  - buildPath exists:', fs.existsSync(buildPath));
    
    // Debug: List files in __dirname to see what's available
    try {
      const dirContents = fs.readdirSync(__dirname);
      console.log('  - Files in __dirname:', dirContents);
    } catch (e) {
      console.log('  - Could not read __dirname:', e.message);
    }
    
    // Debug: Check if build folder exists
    try {
      const buildDir = path.join(__dirname, 'build');
      if (fs.existsSync(buildDir)) {
        const buildContents = fs.readdirSync(buildDir);
        console.log('  - Files in build folder:', buildContents);
      } else {
        console.log('  - Build folder does not exist at:', buildDir);
      }
    } catch (e) {
      console.log('  - Could not check build folder:', e.message);
    }
    
    if (fs.existsSync(buildPath)) {
      console.log('✅ [Electron] Loading from:', buildPath);
      mainWindow.loadFile(buildPath).catch(err => {
        console.error('❌ [Electron] Failed to load build file:', err);
        // Show error to user
        mainWindow.webContents.executeJavaScript(`
          document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial; text-align: center;"><div><h1>Error Loading Application</h1><p>Failed to load the application files.</p><p>Path: ${buildPath}</p><p>Error: ${err.message}</p></div></div>';
        `);
      });
    } else {
      // Try alternative paths as fallback
      const alternativePaths = [
        path.join(app.getAppPath(), 'build', 'index.html'),
        path.join(process.resourcesPath || '', 'app', 'build', 'index.html'),
        path.join(__dirname, '..', 'build', 'index.html')
      ].filter(Boolean);
      
      console.log('⚠️ [Electron] Primary build path not found, trying alternatives:', alternativePaths);
      
      let found = false;
      for (const altPath of alternativePaths) {
        if (fs.existsSync(altPath)) {
          console.log('✅ [Electron] Found build at:', altPath);
          mainWindow.loadFile(altPath).catch(err => {
            console.error('❌ [Electron] Failed to load from alternative path:', altPath, err);
          });
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.error('❌ [Electron] Could not find build/index.html in any location');
        // Show error message in window
        mainWindow.webContents.once('did-finish-load', () => {
          mainWindow.webContents.executeJavaScript(`
            document.body.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial; text-align: center;"><div><h1>Build Files Not Found</h1><p>The application build files could not be located.</p><p>Please rebuild the application.</p></div></div>';
          `);
        });
        // Load empty HTML to show error
        mainWindow.loadURL('data:text/html,<html><body style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial; text-align: center;"><div><h1>Build Files Not Found</h1><p>The application build files could not be located.</p><p>Please rebuild the application.</p></div></body></html>');
      }
    }
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (isDev()) {
      // In dev, allow localhost
      if (parsedUrl.origin !== 'http://localhost:3000') {
        event.preventDefault();
      }
    } else {
      // In production, prevent all external navigation
      if (parsedUrl.origin !== `file://`) {
        event.preventDefault();
      }
    }
  });

  // Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  try {
    createWindow();
  } catch (error) {
    console.error('❌ [Electron] Failed to create window:', error);
    // Show error dialog
    dialog.showErrorBox('Application Error', `Failed to create window: ${error.message}\n\nStack: ${error.stack}`);
  }

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      try {
        createWindow();
      } catch (error) {
        console.error('❌ [Electron] Failed to create window on activate:', error);
      }
    }
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ [Electron] Uncaught Exception:', error);
  dialog.showErrorBox('Uncaught Exception', `An error occurred: ${error.message}\n\nStack: ${error.stack}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [Electron] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});

// Global keyboard shortcuts for DevTools
app.on('browser-window-created', (event, window) => {
  window.webContents.on('before-input-event', (event, input) => {
    // F12 or Ctrl+Shift+I to toggle DevTools
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools();
      }
    }
  });
});
