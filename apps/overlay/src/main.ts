import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { exec } from "child_process";
import { promisify } from "util";
import started from "electron-squirrel-startup";

const execAsync = promisify(exec);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// ============================================================================
// Database Access Handlers - Register BEFORE app ready
// ============================================================================

const CHAT_DB_PATH = path.join(os.homedir(), "Library", "Messages", "chat.db");

/**
 * Check if we have read access to the iMessage database
 * Returns: { hasAccess: boolean, path: string, error?: string }
 */
ipcMain.handle("check-database-access", async () => {
  try {
    // Try to access the file
    await fs.promises.access(CHAT_DB_PATH, fs.constants.R_OK);

    // Get file stats to verify it's a real file
    const stats = await fs.promises.stat(CHAT_DB_PATH);

    return {
      hasAccess: true,
      path: CHAT_DB_PATH,
      fileSize: stats.size,
      lastModified: stats.mtime,
    };
  } catch (error: any) {
    return {
      hasAccess: false,
      path: CHAT_DB_PATH,
      error:
        error.code === "EACCES"
          ? "Permission denied. Please grant Full Disk Access in System Settings."
          : error.code === "ENOENT"
            ? "Database file not found. Is iMessage set up on this Mac?"
            : error.message,
    };
  }
});

/**
 * Get basic statistics about the database
 * This will also trigger the permission prompt if not already granted
 */
ipcMain.handle("get-database-stats", async () => {
  try {
    const stats = await fs.promises.stat(CHAT_DB_PATH);
    return {
      success: true,
      fileSize: stats.size,
      fileSizeMB: (stats.size / (1024 * 1024)).toFixed(2),
      lastModified: stats.mtime.toISOString(),
      path: CHAT_DB_PATH,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
});

/**
 * Get list of tables in the database
 * This verifies we can actually query the database
 */
ipcMain.handle("get-database-tables", async () => {
  let db: DatabaseSync | null = null;
  try {
    // Open database in read-only mode using Node's built-in SQLite
    db = new DatabaseSync(CHAT_DB_PATH, { readOnly: true });

    // Query for all tables
    const stmt = db.prepare(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type IN ('table', 'view')
      ORDER BY name
    `);

    const tables = stmt.all() as Array<{ name: string; type: string }>;

    // Get first 10 tables
    const firstTenTables = tables.slice(0, 10);

    // Log to console for verification
    console.log("\n=== iMessage Database Tables (first 10) ===");
    firstTenTables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.name} (${table.type})`);
    });
    console.log(`Total tables/views: ${tables.length}\n`);

    return {
      success: true,
      tables: firstTenTables,
      totalCount: tables.length,
    };
  } catch (error: any) {
    console.error("Error querying database tables:", error);
    return {
      success: false,
      error: error.message,
      tables: [],
      totalCount: 0,
    };
  } finally {
    // Always close the database connection
    if (db) {
      db.close();
    }
  }
});

/**
 * Open System Preferences to Security & Privacy > Full Disk Access
 */
ipcMain.handle("open-system-preferences", async () => {
  try {
    // Open the Security & Privacy pane
    // On macOS Ventura+, this opens System Settings
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
    );
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Helper function to escape AppleScript strings
function escapeAppleScriptString(str: string): string {
  // Replace backslashes first, then quotes
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// AppleScript execution handler
ipcMain.handle(
  "send-imessage",
  async (_event, recipient: string, messageText: string) => {
    try {
      // Escape strings for AppleScript
      const escapedRecipient = escapeAppleScriptString(recipient);
      const escapedMessage = escapeAppleScriptString(messageText);

      // Build AppleScript with proper escaping
      // Use AppleScript's quoted form for safer string handling

      const appleScript = `
set recipient to "${escapedRecipient}"
set messageText to "${escapedMessage}"

set h to ""

-- Try to find contact by name first
try
  tell application "Contacts"
    set p to first person whose name is recipient
    if (count of phones of p) > 0 then
      set h to value of first phone of p
    else if (count of emails of p) > 0 then
      set h to value of first email of p
    end if
  end tell
on error
  -- If not found as contact name, assume recipient is already phone/email
  set h to recipient
end try

if h is "" then
  error "Recipient has no phone or email in Contacts."
end if

-- Open the Messages thread via URL scheme
do shell script "open " & quoted form of ("imessage://" & h)

-- Type and send message automatically
delay 1
tell application "System Events"
  tell process "Messages"
    keystroke messageText
    delay 0.2
    key code 36 -- press Return (sends the message)
  end tell
end tell
`.trim();

      // Execute using osascript via stdin using echo and pipe
      // This avoids heredoc quoting issues
      const command = `echo ${JSON.stringify(appleScript)} | osascript`;

      const { stderr } = await execAsync(command);

      if (
        stderr &&
        !stderr.includes("Messages") &&
        !stderr.includes("execution error")
      ) {
        throw new Error(stderr);
      }

      return {
        success: true,
        message: "Message sent successfully!",
      };
    } catch (error) {
      console.error("AppleScript error:", error);
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
);
