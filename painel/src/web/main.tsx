import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import App from "./App";
import "./estilo.css";

const Totem = lazy(() => import("./totem/Totem"));
const Premios = lazy(() => import("./totem/Premios"));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/totem/:empresa/:local" element={<Suspense fallback={null}><Totem /></Suspense>} />
        <Route path="/p/:empresa/:token" element={<Suspense fallback={null}><Premios /></Suspense>} />
        <Route path="/premios/:empresa/:jogo" element={<Suspense fallback={null}><Premios /></Suspense>} />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
