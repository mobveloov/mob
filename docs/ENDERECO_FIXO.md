# Endereço fixo dos apps (sem gerar APK a cada troca de túnel)

O túnel rápido do ambiente de teste muda de endereço toda vez que reinicia. Há dois caminhos; use o primeiro sempre que possível.

## 1. Domínio fixo (recomendado)

1. O dono cria um **túnel nomeado** no Cloudflare e liga um subdomínio dele (ex.: `api.seudominio.com.br`) ao serviço `http://painel:8787`.
2. Com o **token do túnel** na variável `CLOUDFLARE_TUNEL_TOKEN` (no PowerShell ou num arquivo `.env` na raiz do repositório, nunca no git), sobe o túnel fixo no lugar do rápido:

   ```powershell
   docker compose -f docker-compose.apps-teste.yml -p mob-apps-teste stop tunel
   docker compose -f docker-compose.apps-teste.yml -p mob-apps-teste --profile fixo up -d tunel-fixo
   ```
3. Gera os APKs **uma vez** com `APP_URL_API=https://api.seudominio.com.br`. O endereço não muda mais.

**O que o dono precisa entregar:** o token do túnel nomeado do Cloudflare e o subdomínio que ele escolheu para a API.

## 2. Descoberta (enquanto usa o túnel rápido)

O APK pode nascer com `APP_URL_DESCOBERTA=https://...` (https, endereço fixo). Esse endereço devolve um JSON com onde o servidor está agora:

```json
{ "api": "https://exemplo.trycloudflare.com" }
```

Ao abrir, o app confere (`/api/saude`) o servidor que conhece; se não responde, consulta a descoberta, guarda o endereço novo e segue. Trocar o túnel passa a ser só atualizar esse JSON, sem APK novo. Qualquer hospedagem estática serve (arquivo no domínio do dono, Cloudflare Pages etc.). Também dá para pôr `app.urlDescoberta` no `brand.json`.

- No APK de teste, o endereço digitado à mão na tela "Servidor de teste" continua mandando (e "Voltar ao padrão" limpa o endereço descoberto).
- Em produção use o caminho 1; a descoberta é só para teste.
