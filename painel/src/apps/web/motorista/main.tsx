import React from "react";
import ReactDOM from "react-dom/client";
import { carregarConfig } from "../comum/api";
import App from "./App";
import "../comum/apps.css";
import "./motorista.css";
import "./motorista-m.css";

await carregarConfig("motorista");
ReactDOM.createRoot(document.getElementById("raiz")!).render(<React.StrictMode><App /></React.StrictMode>);
