# UP Corridas: empresa 1 do painel

A marca fica em `brand.json`, e as imagens ficam em `assets/`.

## Ícone do app

O `assets/icone.png` de agora é **provisório**. Ele segue o desenho pedido: fundo preto, "UP" grande em preto com contorno branco e, embaixo, "CORRIDAS" em amarelo (#FFC400).

Para usar a arte oficial:

1. Salve o PNG quadrado como `tenants/up-corridas/assets/icone.png`. O melhor tamanho é 1024×1024.
2. Gere o app de novo:

```bash
node scripts/build-app-empresa.mjs up-corridas --apk
```

Se quiser, salve também a tela de abertura em `assets/abertura.png`.

## Falta confirmar

| Campo em `brand.json` | Valor de agora | O que é |
|---|---|---|
| `app.pacote` | `br.com.upcorridas.central` (painel). Os apps usam `br.com.upcorridas.passageiro` e `br.com.upcorridas.motorista`. | Identificador de cada app na loja. Não muda depois de publicar. |
| `app.urlPainel` | `https://painel.upcorridas.com.br` | Endereço que o app abre. Troque pelo endereço real do painel. |
| `dominios` | vazio | Domínio próprio do painel, se tiver. |
| `textos.suporteEmail` e `textos.suporteTelefone` | vazios | Contato de suporte mostrado nas telas. |

A lista completa do que depende de você está no `README.md`, na seção "O que depende de você".

Depois de confirmar, a marca também pode ser ajustada pela tela **Configurações → Marca e aparência**, sem mexer em código.
