import { useEffect, useState } from "react";
import type { DatabaseTable } from "../types/electron";

interface PermissionLoaderProps {
  onAccessGranted: () => void;
}

type LoadingState = "checking" | "granted" | "denied" | "error";

export const PermissionLoader = ({
  onAccessGranted,
}: PermissionLoaderProps) => {
  const [state, setState] = useState<LoadingState>("checking");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [dbPath, setDbPath] = useState<string>("");
  const [dbStats, setDbStats] = useState<{
    size: string;
    modified: string;
  } | null>(null);
  const [tables, setTables] = useState<DatabaseTable[]>([]);

  const checkAccess = async () => {
    setState("checking");
    setErrorMessage("");

    try {
      const result = await window.electronAPI.checkDatabaseAccess();
      setDbPath(result.path);

      if (result.hasAccess) {
        // Get additional stats
        const stats = await window.electronAPI.getDatabaseStats();
        if (stats.success && stats.fileSizeMB && stats.lastModified) {
          setDbStats({
            size: stats.fileSizeMB,
            modified: new Date(stats.lastModified).toLocaleString(),
          });
        }

        // Get database tables to verify we can query it
        const tablesResult = await window.electronAPI.getDatabaseTables();
        if (tablesResult.success) {
          setTables(tablesResult.tables);
          console.log(`✓ Found ${tablesResult.totalCount} tables in database`);
          console.log(
            "First 10 tables:",
            tablesResult.tables.map((t) => t.name).join(", ")
          );
        }

        setState("granted");

        // Transition to main app immediately without showing loading screen
        onAccessGranted();
      } else {
        setState("denied");
        setErrorMessage(result.error || "Unknown error accessing database");
      }
    } catch (error: any) {
      setState("error");
      setErrorMessage(error.message || "Failed to check database access");
    }
  };

  const openSystemSettings = async () => {
    await window.electronAPI.openSystemPreferences();
  };

  useEffect(() => {
    checkAccess();
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {(state === "checking" || state === "granted") && (
          <div style={styles.section}>
            <div style={styles.spinner}></div>
          </div>
        )}

        {state === "denied" && (
          <div style={styles.section}>
            <div style={styles.error}>⚠️</div>
            <p style={styles.message}>Database Access Required</p>
            <p style={styles.errorText}>{errorMessage}</p>

            <div style={styles.instructions}>
              <p style={styles.instructionTitle}>To grant access:</p>
              <ol style={styles.instructionList}>
                <li>Click "Open System Settings" below</li>
                <li>Navigate to Privacy & Security → Full Disk Access</li>
                <li>Enable access for "overlay" or "Electron"</li>
                <li>Click "Retry" below</li>
              </ol>
            </div>

            <div style={styles.buttons}>
              <button onClick={openSystemSettings} style={styles.primaryButton}>
                Open System Settings
              </button>
              <button onClick={checkAccess} style={styles.secondaryButton}>
                Retry
              </button>
            </div>

            <p style={styles.path}>Path: {dbPath}</p>
          </div>
        )}

        {state === "error" && (
          <div style={styles.section}>
            <div style={styles.error}>❌</div>
            <p style={styles.message}>Error</p>
            <p style={styles.errorText}>{errorMessage}</p>
            <button onClick={checkAccess} style={styles.secondaryButton}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Inline styles for simplicity - can move to CSS file later
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    backgroundColor: "white",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  content: {
    backgroundColor: "white",
    borderRadius: "12px",
    padding: "40px",
    maxWidth: "500px",
    width: "90%",
  },
  title: {
    fontSize: "32px",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: "30px",
    color: "#1d1d1f",
  },
  section: {
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "4px solid rgba(0, 0, 0, 0.1)",
    borderTop: "4px solid #007aff",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  success: {
    fontSize: "48px",
    marginBottom: "20px",
    color: "#34c759",
  },
  error: {
    fontSize: "48px",
    marginBottom: "20px",
    color: "#ff3b30",
  },
  message: {
    fontSize: "20px",
    fontWeight: "500",
    marginBottom: "10px",
    color: "#1d1d1f",
  },
  subMessage: {
    fontSize: "14px",
    color: "#86868b",
    marginTop: "10px",
  },
  errorText: {
    fontSize: "14px",
    color: "#ff3b30",
    backgroundColor: "#ffebee",
    padding: "10px",
    borderRadius: "6px",
    marginBottom: "20px",
  },
  path: {
    fontSize: "12px",
    color: "#86868b",
    fontFamily: "monospace",
    marginTop: "20px",
    wordBreak: "break-all",
  },
  stats: {
    fontSize: "14px",
    color: "#86868b",
    marginTop: "10px",
    marginBottom: "10px",
  },
  instructions: {
    textAlign: "left",
    backgroundColor: "#f5f5f7",
    padding: "20px",
    borderRadius: "8px",
    marginBottom: "20px",
  },
  instructionTitle: {
    fontWeight: "600",
    marginBottom: "10px",
    color: "#1d1d1f",
  },
  instructionList: {
    paddingLeft: "20px",
    margin: "0",
    color: "#1d1d1f",
  },
  buttons: {
    display: "flex",
    gap: "10px",
    justifyContent: "center",
    marginBottom: "20px",
  },
  primaryButton: {
    backgroundColor: "#007aff",
    color: "white",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  secondaryButton: {
    backgroundColor: "white",
    color: "#007aff",
    border: "2px solid #007aff",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  tablesContainer: {
    marginTop: "20px",
    marginBottom: "20px",
    backgroundColor: "#f5f5f7",
    padding: "15px",
    borderRadius: "8px",
    textAlign: "left",
  },
  tablesTitle: {
    fontSize: "14px",
    fontWeight: "600",
    marginBottom: "10px",
    color: "#1d1d1f",
  },
  tablesList: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  },
  tableItem: {
    fontSize: "13px",
    fontFamily: "monospace",
    color: "#1d1d1f",
    display: "flex",
    gap: "8px",
  },
  tableIndex: {
    color: "#86868b",
    minWidth: "25px",
  },
  tableName: {
    fontWeight: "500",
    flex: 1,
  },
  tableType: {
    color: "#86868b",
    fontSize: "12px",
  },
};
