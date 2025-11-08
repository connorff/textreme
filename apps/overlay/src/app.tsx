import { createRoot } from "react-dom/client";
import { useState } from "react";
import { PermissionLoader } from "./components/PermissionLoader";
import { ConversationView } from "./components/ConversationView";

const MainApp = () => {
  return (
    <div className="h-screen overflow-hidden">
      <ConversationView pollInterval={2000} />
    </div>
  );
};

const App = () => {
  const [hasAccess, setHasAccess] = useState(false);

  if (!hasAccess) {
    return <PermissionLoader onAccessGranted={() => setHasAccess(true)} />;
  }

  return <MainApp />;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const root = createRoot(rootElement);
root.render(<App />);
