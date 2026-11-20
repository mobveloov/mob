import React from "react";
import ReactDOM from "react-dom/client";
import { carregarConfig } from "../comum/api";
import App from "./App";
import { aplicarTemaApp } from "../comum/tema";
import "../comum/apps.css";

aplicarTemaApp();
await carregarConfig("passageiro");
ReactDOM.createRoot(document.getElementById("raiz")!).render(<React.StrictMode><App /></React.StrictMode>);
