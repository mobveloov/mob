import React from "react";
import ReactDOM from "react-dom/client";
import { carregarConfig } from "../comum/api";
import App from "./App";
import "../comum/apps.css";

await carregarConfig("passageiro");
ReactDOM.createRoot(document.getElementById("raiz")!).render(<React.StrictMode><App /></React.StrictMode>);
