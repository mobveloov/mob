# Voz do servidor (parcial)

Tarefa: voz real (mp3) gerada no servidor para os apps, com cache, limite por IP e configuração na Personalização de cada app.

| item | arquivos | teste |
|---|---|---|
| Rota pública GET/POST `/api/apps/<empresa>/voz` (mp3, ETag, 204/400/413/429/503) | `painel/src/apps/voz.ts`, `painel/src/apps/rotas.ts` | `painel/test/voz-servidor.test.ts` |
| Motores: Gemini TTS (chave das Integrações, WAV -> mp3) e Edge neural pt-BR, motor falso injetável | `painel/src/apps/voz.ts` | idem |
| Cache em disco por hash(texto+voz+velocidade+motor), limites por IP e empresa, texto até 200 | `painel/src/apps/voz.ts` | idem |
| Config por app (ligada, motor, voz, velocidade) dentro da personalização e do JSON público | `painel/src/config/voz-app.ts`, `personalizacao.ts`, `personalizacao-motorista.ts` | idem |
| Tela "Voz dos avisos" no mesmo "Salvar alterações" | `painel/src/web/telas/grupoc/AberturaPremium.tsx`, `Personalizacao.tsx`, `PersonalizacaoMotorista.tsx` | por leitura + tsc |
| `preGerarFrases` ao salvar e rota de gestor `POST /api/config/voz/pre-gerar` | `painel/src/apps/voz.ts`, `painel/src/config/rotas.ts` | idem |
| Dependências novas (JS puro): `msedge-tts`, `@breezystack/lamejs` | `painel/package.json` | Edge testado de verdade (mp3 em ~1,4 s) |

Pendente: nada além de validar no Docker de produção (não rodei aqui) e do app passar a tocar o mp3 (sessão dos apps). Detalhes em `docs/VOZ_SERVIDOR.md`.
