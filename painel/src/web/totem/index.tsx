// Telas do totem (fase 5). A sessão Base liga as rotas:
//   main.tsx: /totem/:empresa/:local -> <Totem /> (fora do App: sem login e sem o menu do painel)
//   App.tsx:  "solicitar" -> <SolicitarCorrida />, "totem" -> <LocaisTotem />
export { default as Totem } from "./Totem";
export { default as SolicitarCorrida } from "./SolicitarCorrida";
export { default as LocaisTotem } from "./LocaisTotem";
