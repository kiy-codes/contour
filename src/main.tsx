import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UnitsProvider } from "./units/UnitsContext";
import { ThemeProvider } from "./theme/ThemeContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <UnitsProvider>
        <App />
      </UnitsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
