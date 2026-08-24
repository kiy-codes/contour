import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { UnitsProvider } from "./units/UnitsContext";
import { ThemeProvider } from "./theme/ThemeContext";
import { CoordinateFormatProvider } from "./geo/CoordinateFormatContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <UnitsProvider>
        <CoordinateFormatProvider>
          <App />
        </CoordinateFormatProvider>
      </UnitsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
