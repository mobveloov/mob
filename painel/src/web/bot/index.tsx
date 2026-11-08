// Telas do bot de WhatsApp. A Base liga em App.tsx: <Route path="/bot" element={<BotWhatsApp />} />
import { useState } from "react";
import { useSessao } from "../App";
import { Titulo } from "../componentes/ui";
import { BotConexao } from "./Conexao";
import { BotConversas } from "./Conversas";
import { BotTestar } from "./Testar";
import "./bot.css";

export { BotConexao, BotConversas, BotTestar };

type Aba = "conversas" | "conexao" | "testar";
const ABAS: Array<{ id: Aba; nome: string }> = [
  { id: "conversas", nome: "Conversas" }, { id: "conexao", nome: "Conexão do número" }, { id: "testar", nome: "Testar conversa" },
];

export default function BotWhatsApp() {
  const { sessao } = useSessao();
  const [aba, setAba] = useState<Aba>("conversas");
  return (
    <>
      <Titulo titulo="Bot de WhatsApp" sub={`Pedidos de corrida pelo WhatsApp da ${sessao.empresa.nome}, com ${sessao.marca.assistente.nome} atendendo.`} />
      <div className="abas bot-abas">
        {ABAS.map((a) => <button key={a.id} className={a.id === aba ? "ativo" : ""} onClick={() => setAba(a.id)}>{a.nome}</button>)}
      </div>
      {aba === "conversas" && <BotConversas />}
      {aba === "conexao" && <BotConexao />}
      {aba === "testar" && <BotTestar />}
    </>
  );
}

export { BotWhatsApp };

/** Tela "Conversas" do menu (Comunicação): as conversas do WhatsApp, com título próprio. */
export function ConversasWhatsApp() {
  return (
    <>
      <Titulo titulo="Conversas" sub="Conversas do WhatsApp com os passageiros. Responda por aqui quando o bot passar para a central." />
      <BotConversas />
    </>
  );
}
