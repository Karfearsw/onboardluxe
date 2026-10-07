import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// Dark luxury theme is the default: tailwind is in class-based dark mode,
// so add the `dark` class to <html> at startup. (index.html also carries it
// for a flash-free first paint.)
document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
