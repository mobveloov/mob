# Marca e white-label

O painel é vendido para várias empresas. Cada uma usa a **própria marca** sem mexer em código.

## O que cada empresa troca

Tela **Configurações > Marca e aparência** (só admin), com pré-visualização ao vivo:

| Item | Onde aparece |
|---|---|
| Nome do produto e nome da empresa | Topo, aba do navegador, tela de login, relatório, plano de ação, textos da IA |
| Nome e tom do assistente de IA | Menu, botão de exportar, caixa de perguntas, relatório, prompts da IA |
| Logo claro e logo escuro | Menu (troca com o tema) e cabeçalho do relatório |
| Favicon | Aba do navegador |
| Ícone do app e tela de abertura | PWA (manifest) e APK |
| Cores (primária, secundária, fundo, texto) | Todo o painel (variáveis CSS) e o relatório |
| Fonte (lista do Google Fonts) | Todo o painel e o relatório |
| Tema padrão (claro, escuro, seguir o aparelho) | Painel (cada usuário ainda pode trocar) |
| Saudação, e-mail e telefone de suporte, rodapé do relatório | Topo, login, relatório |
| Domínios próprios | Login e manifest já abrem com a marca certa pelo endereço |
| Mostrar etiqueta de origem | Consultar corridas, acompanhamento, planilha |
| App: nome, identificador do pacote, endereço do painel | APK/AAB |

Tudo é guardado nos dados da empresa (`dados/empresas/<id>/marca.json` + `arquivos/`), nunca no código.

## O que nunca aparece

- Nenhum nome de empresa fixo nas telas, no relatório, no CSV exportado ou nos textos da IA.
- Os sistemas de origem aparecem só como "Sistema A" e "Sistema B". A etiqueta de origem usa o nome que a empresa escolher.
- Nenhum logo, ícone, imagem ou texto de marca dos painéis de referência foi copiado.
- Os testes conferem que o relatório e os prompts não citam marcas de terceiros.

## Como uma empresa nova entra

**Pelo painel (o normal):**
1. O dono da plataforma entra e vai em **Usuários > Nova empresa** (nome + administrador).
2. O administrador da empresa entra com o e-mail dele.
3. Em **Marca e aparência**: nome, logo, cores, fonte, textos. Salvar.
4. Em **Integrações**: liga o Sistema A e/ou o Sistema B (credenciais), ou importa uma planilha CSV; põe as chaves de IA (ou usa as da plataforma).
5. Em **Usuários**: cria os operadores.
6. Domínio próprio: aponte o DNS para o servidor e cadastre o domínio na marca.

**Por arquivo (para preparar antes):**
```bash
cd painel
ADMIN_SENHA='senha-forte' npm run empresa:importar -- ../tenants/exemplo --admin admin@empresa.com.br --nome "Fulana"
```
Lê `tenants/<empresa>/brand.json` + `assets/` e cria a empresa com a marca pronta. A senha vem da variável `ADMIN_SENHA`, nunca da linha de comando.

## Arquivo da marca (`tenants/<empresa>/brand.json`)

Mesmo formato da marca salva. Baixe pronto em **Marca e aparência > brand.json**. Exemplo completo, com marca fictícia: `tenants/exemplo/`.

```
tenants/exemplo/
  brand.json
  assets/logo-claro.svg  logo-escuro.svg  icone.svg  icone.png  abertura.png
```

## App do celular (PWA e APK)

- **PWA:** cada empresa já tem `manifest.webmanifest` com nome, cores e ícone dela (pelo domínio ou `?empresa=<id>`). No celular, "Adicionar à tela inicial" já instala com a marca.
- **APK/AAB:** `scripts/build-app-empresa.mjs` gera um app "casco" (Capacitor) que abre o painel da empresa com nome, ícone, tela de abertura e cores dela.

```bash
cd scripts && npm install
```
```bash
node scripts/build-app-empresa.mjs exemplo
```
```bash
node scripts/build-app-empresa.mjs exemplo --apk
```
```bash
node scripts/build-app-empresa.mjs exemplo --aab
```

- Sem opção: só prepara o projeto em `build/apps/<empresa>/` (manifest, ícones, Capacitor).
- `--apk`: APK de teste (assinado com chave de depuração), em `build/apps/<empresa>/<empresa>-teste.apk`.
- `--aab`: pacote assinado para a Play Store. A assinatura vem **só** de variáveis de ambiente: `APP_KEYSTORE` (caminho do .jks), `APP_KEYSTORE_SENHA`, `APP_KEY_ALIAS`, `APP_KEY_SENHA`. As senhas vão ao Gradle pelo ambiente, não pela linha de comando. `*.jks`, `*.keystore`, `tenants/*/assinatura/` e `build/` estão no `.gitignore`.
- Precisa: Node 20+, **JDK 21** (`JAVA_HOME`) e Android SDK (`ANDROID_HOME`). O Java 25 que vem no Android Studio é novo demais para o Gradle do Capacitor 8.
- O identificador do pacote (`app.pacote`) não pode mudar depois de publicar na loja.
