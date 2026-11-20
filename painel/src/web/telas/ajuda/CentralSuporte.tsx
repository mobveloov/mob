// Ajuda › Central de suporte: contatos de suporte da plataforma e atalhos para a Central de Ajuda. Servidor: /api/gestao/suporte.
// Os contatos são do dono da plataforma (só ele muda); sem contato informado a tela avisa, nada é inventado.

import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Clock, Globe, Mail, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { useCarregar } from "../../componentes/ui";
import { Cabecalho, Campo, chamar, mascaraTel, useAviso } from "../cadastro/base";

interface Contatos { whatsapp: string; email: string; telefone: string; site: string; horario: string }
interface Resposta { plataforma: Contatos; matriz: { nome: string; whatsapp: string; email: string }; tutoriais: number; duvidas: number; editavel: boolean }

export default function CentralSuporte() {
  const l = useCarregar(() => chamar<Resposta>("GET", "/suporte"), []);
  const { aviso, tentar } = useAviso();
  const [form, setForm] = useState<Contatos | null>(null);
  const d = l.dados;
  const p = d?.plataforma;
  const sem = !!p && !p.whatsapp && !p.email && !p.telefone && !p.site;
  const zap = p?.whatsapp ? `https://wa.me/${p.whatsapp.replace(/\D/g, "")}` : "";
  return (
    <div className="cg-pagina-solta">
      {aviso}
      <Cabecalho titulo="Central de suporte" sub="Fale com a plataforma" />
      {l.erro && <div className="cg-aviso erro">{l.erro}</div>}
      {d && p && (
        <>
          <h2 className="cg-secao">Contatos do suporte</h2>
          {sem ? <div className="cg-tabela-caixa" style={{ padding: 18 }}>O contato de suporte da plataforma ainda não foi informado.{d.editavel ? " Preencha abaixo." : " Peça ao responsável pela plataforma para cadastrá-lo."}</div> : (
            <div className="cg-autos">
              {p.whatsapp && <div className="cg-auto"><strong><MessageCircle size={15} /> WhatsApp</strong><span>{mascaraTel(p.whatsapp.replace(/^\+?55/, ""))}</span><a className="cg-botao" href={zap} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a></div>}
              {p.email && <div className="cg-auto"><strong><Mail size={15} /> E-mail</strong><span>{p.email}</span><a className="cg-botao" href={`mailto:${p.email}`}>Enviar e-mail</a></div>}
              {p.telefone && <div className="cg-auto"><strong><Phone size={15} /> Telefone</strong><span>{mascaraTel(p.telefone.replace(/^\+?55/, ""))}</span><a className="cg-botao" href={`tel:${p.telefone}`}>Ligar</a></div>}
              {p.site && /^https?:\/\//i.test(p.site) && <div className="cg-auto"><strong><Globe size={15} /> Site</strong><span>{p.site}</span><a className="cg-botao" href={p.site} target="_blank" rel="noopener noreferrer">Abrir</a></div>}
              {p.horario && <div className="cg-auto"><strong><Clock size={15} /> Horário de atendimento</strong><span>{p.horario}</span></div>}
            </div>
          )}
          {d.editavel && (
            <div style={{ margin: "12px 0" }}>
              {!form ? <button className="cg-botao" onClick={() => setForm({ ...p })}>Editar contatos</button> : (
                <section className="cg-tabela-caixa" style={{ padding: 16 }}>
                  <div className="cg-grade">
                    <Campo rotulo="WhatsApp"><input value={form.whatsapp} placeholder="5511999999999" onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></Campo>
                    <Campo rotulo="E-mail"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Campo>
                    <Campo rotulo="Telefone"><input value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} /></Campo>
                    <Campo rotulo="Site"><input value={form.site} placeholder="https://" onChange={(e) => setForm({ ...form, site: e.target.value })} /></Campo>
                    <Campo rotulo="Horário de atendimento"><input value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })} /></Campo>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="cg-botao" onClick={() => setForm(null)}>Cancelar</button>
                    <button className="cg-botao primario" onClick={() => void tentar(async () => { await chamar("PUT", "/suporte", form); setForm(null); l.recarregar(); }, "Contatos salvos.")}>Salvar</button>
                  </div>
                </section>
              )}
            </div>
          )}
          <h2 className="cg-secao">Atalhos</h2>
          <div className="cg-autos">
            <Link className="cg-auto" to="/central-ajuda" style={{ textDecoration: "none", color: "inherit" }}><strong><BookOpen size={15} /> Central de Ajuda</strong><span>{d.tutoriais} {d.tutoriais === 1 ? "tutorial" : "tutoriais"} e {d.duvidas} {d.duvidas === 1 ? "dúvida frequente" : "dúvidas frequentes"}.</span></Link>
            <Link className="cg-auto" to="/ouvidoria" style={{ textDecoration: "none", color: "inherit" }}><strong><MessageCircle size={15} /> Ouvidoria</strong><span>Registre uma reclamação, sugestão ou elogio e acompanhe pelo protocolo.</span></Link>
            <Link className="cg-auto" to="/ajuda-termos" style={{ textDecoration: "none", color: "inherit" }}><strong><ShieldCheck size={15} /> Termos de uso</strong><span>Regras de uso do painel.</span></Link>
          </div>
          {(d.matriz.whatsapp || d.matriz.email) && (
            <>
              <h2 className="cg-secao">Contato da sua central (Central de Ajuda › Falar com Matriz)</h2>
              <div className="cg-tabela-caixa" style={{ padding: 16 }}>{d.matriz.nome && <strong>{d.matriz.nome}</strong>} {d.matriz.whatsapp && <span>· {d.matriz.whatsapp}</span>} {d.matriz.email && <span>· {d.matriz.email}</span>}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
