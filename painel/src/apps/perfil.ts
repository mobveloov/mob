// Contas dos apps (v2): login por telefone ou e-mail com senha, cadastro, foto, lugares do passageiro,
// dados, endereço e veículos do motorista. As regras de HTTP ficam em v2.ts; aqui só a lógica.
//
// Passageiro: o cadastro é o de Passageiros (clientes). Motorista: o de Motoristas, que nasce "Aguardando aprovação":
// entra no app e completa o cadastro, mas só fica online depois que a central aprovar.
// Senha: scrypt com sal por pessoa (nunca a senha em si). A foto fica em DADOS_DIR/empresas/<id>/apps/fotos/.

import crypto from "node:crypto";
import fs from "node:fs";
import { cadastroPorId, GENEROS } from "../comum/cadastros.ts";
import { gravarPosicao, lerPosicao } from "../comum/lugares-passageiro.ts";
import { visaoDoMotorista } from "../comum/motorista-campos.ts";
import { alterarCampos, atualizar, criar, listar, mesclar, remover, type Registro } from "../cadastros/armazem.ts";
import { listarProprias, type Ponto } from "../corridas/index.ts";
import { cidadesAtendidas } from "../enderecos/index.ts";
import { agoraBr } from "../servidor/util.ts";
import { arquivo, num, soDigitos, txt } from "./armazem.ts";
import { gerais } from "../config/gerais.ts";
import { documentosFaltando, pessoa, salvarPessoa, tiposDoApp } from "./extras.ts";
import { eu as euBase, telefoneValido, type PapelApp, type SessaoApp } from "./sessoes.ts";

export interface Lugares { casa: Ponto | null; trabalho: Ponto | null; favoritos: Array<{ id: string; nome: string; ponto: Ponto }> }
export interface Veiculo {
  id: string; marca: string; modelo: string; placa: string; cor: string; ano: number | null; cnh: string; validadeCnh: string; ativo: boolean; situacao: string;
  ufEmplacamento: string; cidadeEmplacamento: string; renavam: string; corHex: string; anoExercicio: number | null;
}

const MOT = () => cadastroPorId("motoristas")!;
const CLI = () => cadastroPorId("clientes")!;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ------------------------------------------------------------------ senha

export function hashSenha(senha: string): string {
  const sal = crypto.randomBytes(16).toString("hex");
  return `${sal}:${crypto.scryptSync(senha, sal, 32).toString("hex")}`;
}
export function senhaConfere(senha: string, guardado: string): boolean {
  const [sal, h] = String(guardado ?? "").split(":");
  if (!sal || !h) return false;
  const a = Buffer.from(h, "hex"), b = crypto.scryptSync(String(senha ?? ""), sal, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function conferirForcaDaSenha(senha: string) {
  if (typeof senha !== "string" || senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  if (senha.length > 100) throw new Error("Senha grande demais.");
}

// ------------------------------------------------------------------ achar a conta

export interface Conta { chave: string; telefone: string; email: string; nome: string; status: string }

/** Acha a conta por telefone ou e-mail. Passageiro: a chave é o telefone. Motorista: a chave é o id do cadastro. */
export function localizar(empresaId: string, papel: PapelApp, loginBruto: string): Conta | null {
  const login = String(loginBruto ?? "").trim().toLowerCase();
  if (!login || login.length > 120) return null;
  const porEmail = login.includes("@");
  const digitos = soDigitos(login);
  if (!porEmail && !telefoneValido(digitos)) return null;
  const achado = listar(empresaId, papel === "motorista" ? MOT() : CLI()).find((r) => (porEmail ? String(r.email ?? "").toLowerCase() === login : soDigitos(r.telefone) === digitos));
  if (!achado) return null;
  const telefone = soDigitos(achado.telefone);
  return { chave: papel === "motorista" ? achado.id : telefone, telefone, email: String(achado.email ?? ""), nome: String(achado.nome ?? ""), status: String(achado.status ?? "") };
}

/** "k***@gmail.com" ou "(11) *****-4321": mostra só um pedaço, para a pessoa reconhecer a conta. */
export function mascarar(c: Conta, porEmail: boolean): string {
  if (porEmail && c.email) { const [u, d] = c.email.split("@"); return `${u.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(5, u.length - 1)))}@${d}`; }
  const t = c.telefone.slice(-11);
  return `(${t.slice(0, 2)}) *****-${t.slice(-4)}`;
}

export const temSenha = (empresaId: string, papel: PapelApp, chave: string) => !!pessoa(empresaId, papel, chave).senha;

export function definirSenha(empresaId: string, papel: PapelApp, chave: string, senha: string) {
  conferirForcaDaSenha(senha);
  const p = pessoa(empresaId, papel, chave);
  p.senha = hashSenha(senha);
  salvarPessoa(empresaId, papel, chave, p);
}

// ------------------------------------------------------------------ validações

export function cpfValido(cpf: string): boolean {
  const d = soDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export const placaValida = (p: string) => /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p);

function nascimentoValido(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
  if (!m) throw new Error("Informe a data de nascimento.");
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) throw new Error("Data de nascimento inválida.");
  const hoje = agoraBr();
  let idade = hoje.getUTCFullYear() - d.getUTCFullYear();
  if (hoje.getUTCMonth() < d.getUTCMonth() || (hoje.getUTCMonth() === d.getUTCMonth() && hoje.getUTCDate() < d.getUTCDate())) idade--;
  if (idade < 18) throw new Error("O motorista precisa ter 18 anos ou mais.");
  if (idade > 100) throw new Error("Data de nascimento inválida.");
  return m[0];
}

const nomeDaCidade = (empresaId: string, cidadeId: string) => cidadesAtendidas(empresaId).find((c) => c.codigo === cidadeId)?.nome ?? "";
function cidadeValida(empresaId: string, cidadeId: unknown): string {
  const id = String(cidadeId ?? "").trim();
  if (!id) return "";
  if (!cidadesAtendidas(empresaId).some((c) => c.codigo === id)) throw new Error("Cidade inválida.");
  return id;
}

/** Telefone e e-mail não se repetem dentro do MESMO papel; a mesma pessoa pode ser passageiro e também motorista. */
function conferirContato(empresaId: string, papelDaConta: "passageiro" | "motorista", telefone: string, email: string) {
  if (!telefoneValido(telefone)) throw new Error("Informe o celular com DDD.");
  if (!EMAIL.test(email)) throw new Error("Informe um e-mail válido.");
  if (localizar(empresaId, papelDaConta, telefone) || localizar(empresaId, papelDaConta, email)) throw new Error("Este telefone ou e-mail já tem cadastro. Entre ou use \"Esqueci a senha\".");
}

// ------------------------------------------------------------------ criar conta

export function criarContaPassageiro(empresaId: string, d: Record<string, unknown>): Conta {
  const nome = txt(d.nome, 80);
  if (nome.length < 3 || !nome.includes(" ")) throw new Error("Informe o nome completo.");
  const genero = String(d.genero ?? "");
  if (!GENEROS.includes(genero)) throw new Error("Escolha o gênero.");
  const telefone = soDigitos(d.telefone), email = String(d.email ?? "").trim().toLowerCase();
  conferirContato(empresaId, "passageiro", telefone, email);
  // CPF obrigatório: Configurações › Gerais › Regras do passageiro.
  const cpf = soDigitos(d.cpf);
  let exigeCpf = false;
  try { exigeCpf = gerais(empresaId).passageiro.cpfObrigatorio; } catch { /* sem configuração */ }
  if (exigeCpf && !cpfValido(cpf)) throw new Error("Informe um CPF válido.");
  if (cpf && !cpfValido(cpf)) throw new Error("CPF inválido.");
  conferirForcaDaSenha(String(d.senha ?? ""));
  const cidadeId = cidadeValida(empresaId, d.cidadeId);
  mesclar(empresaId, CLI(), [{ nome, telefone, email, genero, ...(cpf ? { cpf } : {}), status: "Ativo", cidade: nomeDaCidade(empresaId, cidadeId) || null }], "app");
  const p = pessoa(empresaId, "passageiro", telefone);
  p.senha = hashSenha(String(d.senha)); p.email = email; p.cidadeId = cidadeId;
  salvarPessoa(empresaId, "passageiro", telefone, p);
  return { chave: telefone, telefone, email, nome, status: "Ativo" };
}

export function criarContaMotorista(empresaId: string, d: Record<string, unknown>): Conta {
  const nome = txt(d.nome, 80);
  if (nome.length < 3 || !nome.includes(" ")) throw new Error("Informe o nome completo.");
  const cpf = soDigitos(d.cpf);
  if (!cpfValido(cpf)) throw new Error("CPF inválido.");
  if (listar(empresaId, MOT()).some((m) => soDigitos(m.cpf) === cpf)) throw new Error("Este CPF já tem cadastro. Fale com a central.");
  const genero = String(d.genero ?? "");
  if (!GENEROS.includes(genero)) throw new Error("Escolha o gênero.");
  const nascimento = nascimentoValido(String(d.nascimento ?? ""));
  const chavePix = txt(d.chavePix, 80);
  if (!chavePix) throw new Error("Informe a chave Pix para receber.");
  const telefone = soDigitos(d.telefone), email = String(d.email ?? "").trim().toLowerCase();
  conferirContato(empresaId, "motorista", telefone, email);
  conferirForcaDaSenha(String(d.senha ?? ""));
  const cidadeId = cidadeValida(empresaId, d.cidadeId);
  const r = criar(empresaId, MOT(), { nome, cpf, telefone, email, nascimento, genero, chavePix, status: "Aguardando aprovação", cidade: nomeDaCidade(empresaId, cidadeId) || null }, "app");
  const p = pessoa(empresaId, "motorista", r.id);
  p.senha = hashSenha(String(d.senha)); p.email = email; p.cidadeId = cidadeId;
  salvarPessoa(empresaId, "motorista", r.id, p);
  return { chave: r.id, telefone, email, nome, status: "Aguardando aprovação" };
}

// ------------------------------------------------------------------ nota e viagens

export function estatisticas(empresaId: string, papel: PapelApp, chave: string): { nota: number | null; viagens: number } {
  let soma = 0, n = 0, viagens = 0;
  for (const c of listarProprias(empresaId)) {
    if (c.status !== "finalizada") continue;
    if (papel === "motorista" ? c.motoristaId !== chave : c.passageiro.telefone !== chave) continue;
    viagens++;
    const nota = papel === "motorista" ? c.avaliacao : c.avaliacaoPassageiro?.nota;
    if (nota != null) { soma += nota; n++; }
  }
  return { nota: n ? Math.round((soma / n) * 10) / 10 : null, viagens };
}

// ------------------------------------------------------------------ foto

const FOTOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
export const MAX_FOTO = 3 * 1024 * 1024;
const MIME_DA_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png" };
const chaveValida = (c: string) => /^[\w-]{6,64}$/.test(c);
const nomeFoto = (papel: PapelApp, chave: string, ext: string) => `${papel}-${chave}.${ext}`;

export function salvarFoto(empresaId: string, papel: PapelApp, chave: string, mime: string, bytes: Uint8Array): string {
  const ext = FOTOS[String(mime).split(";")[0].trim().toLowerCase()];
  if (!ext) throw new Error("Envie uma foto JPG ou PNG.");
  if (!bytes?.length || bytes.length > MAX_FOTO) throw new Error("Foto vazia ou maior que 3 MB.");
  const certo = ext === "jpg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff : bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!certo) throw new Error("O arquivo não é uma foto válida.");
  if (!chaveValida(chave)) throw new Error("Conta inválida.");
  fs.mkdirSync(arquivo(empresaId, "fotos"), { recursive: true });
  const p = pessoa(empresaId, papel, chave);
  const antigo = p.foto;
  const nome = nomeFoto(papel, chave, ext);
  fs.writeFileSync(arquivo(empresaId, "fotos", nome), bytes, { mode: 0o600 });
  if (antigo && antigo !== nome) fs.rmSync(arquivo(empresaId, "fotos", antigo), { force: true });
  p.foto = nome;
  salvarPessoa(empresaId, papel, chave, p);
  return nome;
}

export function arquivoDaFoto(empresaId: string, papel: PapelApp, chave: string): { caminho: string; mime: string } | null {
  if (!chaveValida(chave)) return null;
  const nome = pessoa(empresaId, papel, chave).foto;
  if (!nome) return null;
  const caminho = arquivo(empresaId, "fotos", nome);
  return fs.existsSync(caminho) ? { caminho, mime: MIME_DA_EXT[nome.split(".").pop()!] ?? "application/octet-stream" } : null;
}

export const urlDaFoto = (empresaId: string, papel: PapelApp, chave: string): string | null =>
  pessoa(empresaId, papel, chave).foto ? `/api/apps/${empresaId}/foto/${papel}/${chave}` : null;

// ------------------------------------------------------------------ lugares do passageiro

export function lugares(empresaId: string, telefone: string) {
  const p = pessoa(empresaId, "passageiro", telefone);
  const vistos = new Set<string>(), recentes: Ponto[] = [];
  for (const c of [...listarProprias(empresaId)].reverse()) {
    if (c.passageiro.telefone !== telefone || !c.destino?.texto) continue;
    const k = c.destino.texto.trim().toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k); recentes.push(c.destino);
    if (recentes.length >= 8) break;
  }
  const cli = listar(empresaId, CLI()).find((r) => soDigitos(r.telefone) === telefone);
  // Casa e trabalho são do cadastro do passageiro (o painel edita lá); o app guarda a posição no mapa junto.
  const doCadastro = (campo: string, guardado: Ponto | null): Ponto | null => {
    const texto = String(cli?.[campo] ?? "").trim();
    if (!texto) return cli ? null : guardado;
    if (guardado && guardado.texto.trim() === texto) return guardado;
    const pos = lerPosicao(cli?.[`${campo}Pos`]);
    return pos ? { texto, ...pos } : { texto };
  };
  return { casa: doCadastro("enderecoCasa", p.lugares.casa), trabalho: doCadastro("enderecoTrabalho", p.lugares.trabalho), favoritos: p.lugares.favoritos, recentes };
}

function pontoLimpo(v: unknown): Ponto {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const texto = txt(o.texto, 200);
  if (!texto) throw new Error("Informe o endereço.");
  const lat = num(o.lat), lng = num(o.lng);
  return { texto, ...(lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : {}) };
}

/** Casa, trabalho e o primeiro favorito vão para o cadastro do passageiro (o painel mostra e edita lá). */
function espelharLugarNoCadastro(empresaId: string, telefone: string, p: ReturnType<typeof pessoa>) {
  const cli = listar(empresaId, CLI()).find((r) => soDigitos(r.telefone) === telefone);
  if (!cli) return;
  alterarCampos(empresaId, CLI(), cli.id, { enderecoCasa: p.lugares.casa?.texto ?? null, enderecoTrabalho: p.lugares.trabalho?.texto ?? null, enderecoCasaPos: gravarPosicao(p.lugares.casa), enderecoTrabalhoPos: gravarPosicao(p.lugares.trabalho), ...(p.lugares.favoritos[0] ? { enderecoFavorito: p.lugares.favoritos[0].ponto.texto } : {}) }, "app do passageiro");
}

export function salvarLugar(empresaId: string, telefone: string, tipo: string, nome: string, ponto: unknown) {
  const p = pessoa(empresaId, "passageiro", telefone);
  const pt = pontoLimpo(ponto);
  if (tipo === "casa") p.lugares.casa = pt;
  else if (tipo === "trabalho") p.lugares.trabalho = pt;
  else if (tipo === "favorito") {
    const n = txt(nome, 40) || pt.texto.slice(0, 40);
    if (p.lugares.favoritos.some((f) => f.ponto.texto.toLowerCase() === pt.texto.toLowerCase())) throw new Error("Este endereço já está nos favoritos.");
    if (p.lugares.favoritos.length >= 20) throw new Error("No máximo 20 favoritos.");
    p.lugares.favoritos.push({ id: crypto.randomBytes(5).toString("hex"), nome: n, ponto: pt });
  } else throw new Error("Tipo inválido.");
  salvarPessoa(empresaId, "passageiro", telefone, p);
  espelharLugarNoCadastro(empresaId, telefone, p);
  return lugares(empresaId, telefone);
}

export function removerLugar(empresaId: string, telefone: string, id: string) {
  const p = pessoa(empresaId, "passageiro", telefone);
  if (id === "casa") p.lugares.casa = null;
  else if (id === "trabalho") p.lugares.trabalho = null;
  else p.lugares.favoritos = p.lugares.favoritos.filter((f) => f.id !== id);
  salvarPessoa(empresaId, "passageiro", telefone, p);
  espelharLugarNoCadastro(empresaId, telefone, p);
  return lugares(empresaId, telefone);
}

// ------------------------------------------------------------------ cadastro do motorista

const motoristaDoCadastro = (empresaId: string, id: string): Registro => {
  const m = listar(empresaId, MOT()).find((x) => x.id === id);
  if (!m) throw new Error("Motorista não encontrado.");
  return m;
};

const VEI = () => cadastroPorId("veiculos")!;
const str = (v: unknown) => String(v ?? "");

/** O veículo como o app vê: o mesmo registro do cadastro Veículos do painel (CNH e situação vêm do motorista). */
function veiculoDoApp(v: Registro, m: Registro): Veiculo {
  return {
    id: v.id, marca: str(v.marca), modelo: str(v.modelo), placa: str(v.placa), cor: str(v.cor), ano: v.ano == null ? null : Number(v.ano),
    cnh: str(m.cnhNumero || m.cnh), validadeCnh: str(m.validadeCnh), ativo: v.emUso === true, situacao: m.status === "Ativo" ? "Aprovado" : "Em análise",
    ufEmplacamento: str(v.ufEmplacamento), cidadeEmplacamento: str(v.cidadeEmplacamento), renavam: str(v.renavam), corHex: str(v.corHex), anoExercicio: v.anoExercicio == null ? null : Number(v.anoExercicio),
  };
}

/** Veículos guardados antes só no perfil do app passam, uma vez, para o cadastro Veículos (a única fonte). */
function migrarVeiculosAntigos(empresaId: string, motoristaId: string) {
  const p = pessoa(empresaId, "motorista", motoristaId) as unknown as { veiculos?: Array<Record<string, unknown>> };
  const antigos = p.veiculos ?? [];
  if (!antigos.length) return;
  const m = motoristaDoCadastro(empresaId, motoristaId);
  const ja = listar(empresaId, VEI()).some((v) => v.motoristaId === motoristaId);
  for (const a of ja ? [] : antigos) {
    try { criar(empresaId, VEI(), { placa: a.placa, modelo: a.modelo, cor: a.cor, ano: a.ano, motorista: m.nome, motoristaId, emUso: a.ativo === true, status: "Ativo" }, "app do motorista"); } catch { /* placa já em outro cadastro: fica de fora */ }
  }
  p.veiculos = [];
  salvarPessoa(empresaId, "motorista", motoristaId, p as never);
}

const doMotorista = (empresaId: string, motoristaId: string) => listar(empresaId, VEI()).filter((v) => v.motoristaId === motoristaId);

export function veiculos(empresaId: string, motoristaId: string): Veiculo[] {
  migrarVeiculosAntigos(empresaId, motoristaId);
  const m = motoristaDoCadastro(empresaId, motoristaId);
  return doMotorista(empresaId, motoristaId).map((v) => veiculoDoApp(v, m));
}

/** O veículo em uso vai para o cadastro do motorista (a central vê modelo, placa, ano e CNH nos dois lugares). */
function sincronizarVeiculo(empresaId: string, motoristaId: string, cnh?: { cnh: string; validadeCnh: string }) {
  const a = doMotorista(empresaId, motoristaId).find((v) => v.emUso === true);
  alterarCampos(empresaId, MOT(), motoristaId, {
    veiculo: a ? `${str(a.modelo)}${a.cor ? ` ${str(a.cor)}` : ""}` : null, placa: a?.placa ?? null, anoVeiculo: a?.ano ?? null,
    ...(a?.validadeLicenciamento ? { validadeLicenciamento: a.validadeLicenciamento } : {}),
    ...(cnh ? { cnh: cnh.cnh, cnhNumero: cnh.cnh, validadeCnh: cnh.validadeCnh } : {}),
  }, "app do motorista");
}

export function salvarVeiculo(empresaId: string, motoristaId: string, d: Record<string, unknown>, id?: string): Veiculo[] {
  migrarVeiculosAntigos(empresaId, motoristaId);
  const m = motoristaDoCadastro(empresaId, motoristaId);
  const meus = doMotorista(empresaId, motoristaId);
  const placa = String(d.placa ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!placaValida(placa)) throw new Error("Placa inválida. Use o padrão ABC1234 ou ABC1D23.");
  const modelo = txt(d.modelo, 60);
  if (!modelo) throw new Error("Informe o modelo.");
  const ano = num(d.ano);
  if (ano == null || ano < 1990 || ano > agoraBr().getUTCFullYear() + 1) throw new Error("Ano do veículo inválido.");
  const cnh = soDigitos(d.cnh ?? m.cnhNumero ?? m.cnh);
  if (cnh.length < 9 || cnh.length > 12) throw new Error("Informe o número da CNH.");
  const validadeCnh = String(d.validadeCnh ?? m.validadeCnh ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validadeCnh)) throw new Error("Informe a validade da CNH.");
  if (validadeCnh < agoraBr().toISOString().slice(0, 10)) throw new Error("A CNH está vencida.");
  if (meus.some((v) => v.placa === placa && v.id !== id)) throw new Error("Esta placa já está nos seus veículos.");
  if (listar(empresaId, VEI()).some((v) => v.placa === placa && v.motoristaId !== motoristaId)) throw new Error("Esta placa já está cadastrada em outro motorista. Fale com a central.");
  const antigo = id ? meus.find((v) => v.id === id) : undefined;
  if (id && !antigo) throw new Error("Veículo não encontrado.");
  if (!id && meus.length >= 5) throw new Error("No máximo 5 veículos.");
  const uf = txt(d.ufEmplacamento, 2).toUpperCase();
  if (uf && !/^[A-Z]{2}$/.test(uf)) throw new Error("UF de emplacamento inválida.");
  const corHex = txt(d.corHex, 7);
  if (corHex && !/^#?[0-9a-fA-F]{6}$/.test(corHex)) throw new Error("Código da cor inválido (ex.: #FFFFFF).");
  const mantem = (k: string) => (d[k] === undefined ? antigo?.[k] ?? null : d[k] === "" ? null : d[k]);
  const dados = {
    placa, modelo, marca: d.marca === undefined ? antigo?.marca ?? null : txt(d.marca, 40) || null, cor: txt(d.cor, 30), ano,
    ufEmplacamento: d.ufEmplacamento === undefined ? antigo?.ufEmplacamento ?? null : uf || null,
    cidadeEmplacamento: d.cidadeEmplacamento === undefined ? antigo?.cidadeEmplacamento ?? null : txt(d.cidadeEmplacamento, 60) || null,
    corHex: d.corHex === undefined ? antigo?.corHex ?? null : corHex || null, renavam: mantem("renavam") ? soDigitos(mantem("renavam")) : null, anoExercicio: mantem("anoExercicio"),
    motorista: m.nome, motoristaId,
  };
  if (antigo) atualizar(empresaId, VEI(), antigo.id, { ...antigo, ...dados }, "app do motorista");
  else criar(empresaId, VEI(), { ...dados, emUso: meus.length === 0, status: "Ativo" }, "app do motorista");
  sincronizarVeiculo(empresaId, motoristaId, { cnh, validadeCnh });
  return veiculos(empresaId, motoristaId);
}

export function ativarVeiculo(empresaId: string, motoristaId: string, id: string): Veiculo[] {
  migrarVeiculosAntigos(empresaId, motoristaId);
  const meus = doMotorista(empresaId, motoristaId);
  if (!meus.some((v) => v.id === id)) throw new Error("Veículo não encontrado.");
  for (const v of meus) if ((v.emUso === true) !== (v.id === id)) atualizar(empresaId, VEI(), v.id, { ...v, emUso: v.id === id }, "app do motorista");
  sincronizarVeiculo(empresaId, motoristaId);
  return veiculos(empresaId, motoristaId);
}

export function excluirVeiculo(empresaId: string, motoristaId: string, id: string): Veiculo[] {
  migrarVeiculosAntigos(empresaId, motoristaId);
  const meus = doMotorista(empresaId, motoristaId);
  const v = meus.find((x) => x.id === id);
  if (!v) throw new Error("Veículo não encontrado.");
  if (v.emUso === true && meus.length > 1) throw new Error("Deixe outro veículo ativo antes de excluir este.");
  remover(empresaId, VEI(), id);
  sincronizarVeiculo(empresaId, motoristaId);
  return veiculos(empresaId, motoristaId);
}

export function cadastroDoMotorista(empresaId: string, motoristaId: string) {
  const m = visaoDoMotorista(motoristaDoCadastro(empresaId, motoristaId));
  const s = (k: string) => String(m[k] ?? "");
  return {
    dados: { nome: s("nome"), cpf: s("cpf"), telefone: s("telefone"), email: s("email"), nascimento: s("nascimento"), genero: s("genero"), chavePix: s("chavePix") },
    endereco: { cep: s("cep"), rua: s("rua"), numero: s("numero") === "S/N" ? "" : s("numero"), semNumero: s("numero") === "S/N", complemento: s("complemento"), bairro: s("bairro"), uf: s("uf"), cidade: s("cidade") },
    foto: urlDaFoto(empresaId, "motorista", motoristaId), situacao: s("status"), pendencias: pendenciasDoMotorista(empresaId, motoristaId),
  };
}

export function salvarDadosDoMotorista(empresaId: string, motoristaId: string, d: Record<string, unknown>) {
  const m = motoristaDoCadastro(empresaId, motoristaId);
  const muda: Record<string, unknown> = {};
  if (d.nome !== undefined) { const n = txt(d.nome, 80); if (n.length < 3 || !n.includes(" ")) throw new Error("Informe o nome completo."); muda.nome = n; }
  // CPF só pode mudar enquanto o cadastro está em análise.
  if (d.cpf !== undefined && soDigitos(d.cpf) !== soDigitos(m.cpf)) {
    if (m.status === "Ativo") throw new Error("O CPF não pode ser mudado depois da aprovação. Fale com a central.");
    if (!cpfValido(String(d.cpf))) throw new Error("CPF inválido.");
    if (listar(empresaId, MOT()).some((x) => x.id !== motoristaId && soDigitos(x.cpf) === soDigitos(d.cpf))) throw new Error("Este CPF já tem cadastro.");
    muda.cpf = soDigitos(d.cpf);
  }
  if (d.email !== undefined) { const e = String(d.email).trim().toLowerCase(); if (!EMAIL.test(e)) throw new Error("Informe um e-mail válido."); if (listar(empresaId, MOT()).some((x) => x.id !== motoristaId && String(x.email ?? "").toLowerCase() === e)) throw new Error("Este e-mail já tem cadastro."); muda.email = e; }
  if (d.nascimento !== undefined) muda.nascimento = nascimentoValido(String(d.nascimento));
  if (d.genero !== undefined) { if (!GENEROS.includes(String(d.genero))) throw new Error("Escolha o gênero."); muda.genero = d.genero; }
  if (d.chavePix !== undefined) { const k = txt(d.chavePix, 80); if (!k) throw new Error("Informe a chave Pix."); muda.chavePix = k; }
  alterarCampos(empresaId, MOT(), motoristaId, muda, "app do motorista");
  return cadastroDoMotorista(empresaId, motoristaId);
}

export function salvarEnderecoDoMotorista(empresaId: string, motoristaId: string, d: Record<string, unknown>) {
  const cep = soDigitos(d.cep);
  if (cep.length !== 8) throw new Error("Informe o CEP com 8 números.");
  const rua = txt(d.rua, 120), bairro = txt(d.bairro, 80), cidade = txt(d.cidade, 80), uf = txt(d.uf, 2).toUpperCase();
  if (!rua || !bairro || !cidade) throw new Error("Preencha rua, bairro e cidade.");
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error("Informe a UF.");
  const semNumero = d.semNumero === true || String(d.semNumero) === "true";
  const numero = semNumero ? "S/N" : txt(d.numero, 10);
  if (!numero) throw new Error("Informe o número ou marque \"sem número\".");
  alterarCampos(empresaId, MOT(), motoristaId, { cep, rua, endereco: rua, numero, semNumero, complemento: txt(d.complemento, 60) || null, bairro, cidade, uf }, "app do motorista");
  return cadastroDoMotorista(empresaId, motoristaId);
}

/** Concluir o cadastro (último passo do app): só passa com todos os documentos marcados em Configurações Gerais enviados. */
export function concluirCadastroDoMotorista(empresaId: string, motoristaId: string) {
  motoristaDoCadastro(empresaId, motoristaId);
  const falta = documentosFaltando(empresaId, motoristaId);
  if (falta.length) throw new Error(`Faltam documentos obrigatórios: ${falta.join(", ")}. Envie todos para concluir o cadastro.`);
  alterarCampos(empresaId, MOT(), motoristaId, { cadastroConcluidoEm: new Date().toISOString() }, "app do motorista");
  return cadastroDoMotorista(empresaId, motoristaId);
}

/** O que ainda falta no cadastro do motorista (a central só aprova com tudo). */
export function pendenciasDoMotorista(empresaId: string, motoristaId: string): string[] {
  const m = motoristaDoCadastro(empresaId, motoristaId);
  const p = pessoa(empresaId, "motorista", motoristaId);
  const falta: string[] = [];
  if (!p.foto) falta.push("Foto do rosto");
  if (!["cpf", "nascimento", "genero", "chavePix"].every((k) => m[k])) falta.push("Dados pessoais");
  if (!["cep", "rua", "numero", "bairro", "cidade", "uf"].every((k) => visaoDoMotorista(m)[k])) falta.push("Endereço");
  if (!veiculos(empresaId, motoristaId).some((v) => v.ativo)) falta.push("Veículo");
  // Documentos exigidos no painel (Gerais do App) e as fotos das laterais do veículo. A foto do rosto é a do perfil.
  const tipos = tiposDoApp(empresaId);
  const exigidos = [...gerais(empresaId).motorista.documentos.filter((d) => d.exigir && d.id !== "foto").map((d) => d.id), "lateralEsquerda", "lateralDireita"];
  for (const tipo of exigidos) {
    const d = p.documentos[tipo];
    if (!d) falta.push(`Documento: ${tipos[tipo] ?? tipo}`);
    else if (d.situacao === "Recusado") falta.push(`Documento recusado: ${tipos[tipo] ?? tipo}${d.motivo ? ` (${d.motivo})` : ""}`);
  }
  return falta;
}

// ------------------------------------------------------------------ quem sou eu (completo)

export function euCompleto(empresaId: string, s: SessaoApp) {
  const base = euBase(empresaId, s);
  const reg = listar(empresaId, s.papel === "motorista" ? MOT() : CLI()).find((r) => (s.papel === "motorista" ? r.id === s.chave : soDigitos(r.telefone) === s.chave));
  const p = pessoa(empresaId, s.papel, s.chave);
  const est = estatisticas(empresaId, s.papel, s.chave);
  const situacao = String(reg?.status ?? "");
  return {
    ...base, email: String(reg?.email ?? p.email ?? ""), genero: String(reg?.genero ?? ""), cidadeId: p.cidadeId, situacao,
    foto: urlDaFoto(empresaId, s.papel, s.chave), temSenha: !!p.senha, nota: est.nota, viagens: est.viagens, codigo: p.codigo,
    ...(s.papel === "motorista" ? { aprovado: situacao === "Ativo", emAnalise: situacao === "Aguardando aprovação", pendencias: pendenciasDoMotorista(empresaId, s.chave) } : {}),
  };
}
