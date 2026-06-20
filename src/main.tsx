import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";

(globalThis as any).Buffer ??= Buffer;

createRoot(document.getElementById("root")!).render(<App />);
