# Apps: telas e fluxo (iguais aos apps de referência, com a marca da empresa)

Esta especificação saiu dos prints dos apps de referência. Ela descreve **layout e fluxo**. Não copia logo, imagens, textos de marca nem os dados pessoais que aparecem nos prints. A cor principal, o logo e o nome vêm da marca da empresa (`tenants/<empresa>/brand.json`).

## Padrões visuais (os dois apps)

- **Mapa:** em tela cheia, com Leaflet e OpenStreetMap. Tem estilo **claro** (passageiro) e **escuro** (motorista), e o tema segue o do aparelho.
- **Folha de baixo (bottom sheet):** arrastável, com puxador, cantos arredondados e conteúdo em cartões.
- **Botões:** principal largo, em caixa alta e com a cor da marca. O secundário é contornado. "Cancelar" fica em vermelho, como texto.
- **Placa:** no estilo Mercosul (faixa azul "BRASIL" em cima da placa).
- **Avisos de confirmação:** em janela central, com ícone redondo no topo, título, texto e dois botões ("Cancelar" | ação).
- **Telas vazias:** ícone grande e cinza, título e uma frase (por exemplo, "Nenhuma viagem por aqui").
- **Formulários:** campo com ícone à esquerda, rótulo acima e asterisco nos obrigatórios.

## App do passageiro

1. **Login:**
   - topo na cor da marca, com o logo e o botão "Ajuda";
   - cartão "Login" com o campo "Telefone ou e-mail" e CONTINUAR;
   - depois, "Sua senha", com o olho para mostrar, "Esqueci a senha" (que manda um código pelo WhatsApp) e ENTRAR;
   - rodapé: "Ao continuar, você concorda com os Termos de Uso e a Privacidade".
2. **Cidade:**
   - lista de cidades da empresa, com busca e um botão de escolha em cada uma;
   - depois, a folha "Cidade selecionada: X. Está correto?", com "Sim, avançar!" e "Trocar cidade".
3. **Crie sua conta:**
   - foto de perfil, obrigatória, tirada pela câmera ou escolhida na galeria;
   - Dados pessoais: nome completo e gênero;
   - Contato: celular com DDD e e-mail;
   - Segurança: senha (mínimo de 6) e confirmar senha;
   - botão CRIAR CONTA e o link "Problemas no cadastro? Fale conosco", que abre o WhatsApp da central.
4. **Início:**
   - topo na cor da marca, com a foto, "Boa noite/Bom dia/Boa tarde" e o nome com 👋, e um ícone de presente que leva ao Indique e ganhe;
   - campo "Para onde você vai?" com o botão IR;
   - três atalhos: Casa, Trabalho e Recentes;
   - mapa embaixo, com o ponto da posição atual;
   - menu de baixo: Início, Histórico, Carteira e Conta.
5. **Para onde vamos?:**
   - Partida: texto da posição atual, com uma ☆ para salvar como favorito e o botão ⇅ para inverter;
   - Destino: campo com "+" para adicionar parada, até 3;
   - abaixo: "Meus favoritos", "Escolher no mapa", "Não informar destino" e as sugestões da busca (rua e número em cima, bairro, cidade e UF embaixo).
6. **Opções da corrida:**
   - abas "Agora" e "Agendar" no topo, com o botão voltar;
   - mapa com a rota e os marcadores de embarque, paradas e destino;
   - folha "Opções para você", com o botão "Opcionais" (filtros: porta-malas grande, encomenda, carro adaptado, motorista à disposição);
   - cartões de categoria: ícone do carro ou da moto, nome, lugares e descrição curta, e **preço com − e +**, porque o passageiro pode mudar o valor oferecido;
   - em Agendar: "Selecionar horário do agendamento", com calendário e relógio, e depois a linha "seg., 09 de nov. às 00:09";
   - rodapé: forma de pagamento (com seletor), "Clique para descontos" (cupom), o valor grande e o botão SOLICITAR (com a categoria embaixo) ou AGENDAR.
7. **Procurando motorista:**
   - folha com "Procurando", "Aguardando motoristas…" e um cronômetro;
   - "Sua oferta atual", com − e +, que aumenta a oferta enquanto procura;
   - os motoristas podem mandar **contra-ofertas**. Cada uma aparece num cartão com o valor, a nota do motorista, embarque e destino, categoria e pagamento, e o botão "ACEITAR R$ X". O passageiro aceita ou recusa;
   - botão "Cancelar" no topo.
8. **Acompanhar viagem:**
   - topo "Acompanhar viagem", com o botão do tema (lua) e o de centralizar;
   - mapa com o carro andando;
   - etiqueta "Motorista a caminho · X min · Y km";
   - cartão do motorista: foto, nota, número de viagens, nome, botões Ligar e Chat (com o número de mensagens novas), veículo, cor e placa Mercosul;
   - faixa "Seu motorista está chegando!" quando ele está a menos de 500 m, e um aviso push também;
   - na folha: Embarque e Destino (e paradas), "Editar rota", Pagamento, Valor total, COMPARTILHAR VIAGEM e "Cancelar corrida";
   - ao cancelar, "Motivo do cancelamento", com uma lista de motivos da empresa e CONFIRMAR.
9. **Chat:** topo com a foto e o nome do motorista e o botão de ligar; balões com data e hora; áudio com player (play e barra); campo "Digite sua mensagem" com o microfone.
10. **Fim da corrida:** nota de 1 a 5 estrelas, **etiquetas** de elogio ou problema (definidas pela empresa) e um comentário. Depois: favoritar ou bloquear, esqueci um objeto e reclamar.
11. **Suas viagens:** abas Todas, Finalizadas, Canceladas, Em andamento e "Filtrar data". Cada cartão mostra a data, a OS, o valor, o embarque e o destino.
12. **Carteira:**
    - cartão escuro "Saldo disponível" com o valor, o botão "+ Adicionar saldo" e o QR do Pix;
    - "Histórico de movimentações".
    - Adicionar saldo mostra como recarregar. O Pix automático só funciona com um serviço de pagamento.
13. **Conta:**
    - topo com a foto, o nome, o telefone e "Editar perfil";
    - cartão da carteira com "Ver extrato";
    - Financeiro: Meus cartões, Indique e ganhe e Meus cupons;
    - Minhas atividades: Histórico de corridas, Agendamentos e Motoristas favoritos;
    - Conta: Central de ajuda e Sair da conta.
14. **Editar perfil:** foto (com câmera), nome completo, e-mail, telefone, gênero, "Alterar senha de acesso" e SALVAR ALTERAÇÕES.

## App do motorista

1. **Login:**
   - topo na cor da marca, com o logo, "PARCEIRO" e "MOTORISTA";
   - cartão "Acesse sua conta" com o e-mail e CONTINUAR →;
   - depois, "Bem-vindo!", com o e-mail em uma etiqueta, "Sua senha", "Esqueceu a senha?" e ACESSAR CONTA;
   - rodapé: "Ainda não dirige com a gente?", com o botão FAZER CADASTRO.
2. **Cadastro em 5 passos** (contador "n/5" no topo):
   1. Dados pessoais: nome, CPF, telefone, e-mail, nascimento, gênero e chave Pix.
   2. Foto do rosto: "Escolha uma foto clara e de frente", com a câmera.
   3. Endereço: CEP, rua, número ou "sem número", complemento, bairro, UF e cidade.
   4. Veículo: CNH e validade, placa, modelo, ano e cor.
   5. Documentos: CNH frente e verso, comprovante de residência, CRLV e fotos da lateral esquerda e da direita do veículo.

   Depois disso, fica "Em análise" até a central aprovar.
3. **Início:**
   - mapa escuro em tela cheia;
   - no topo: o botão de menu (grade) à esquerda, a pílula "👁 R$ 0,00 ›" no meio (ganhos de hoje; o olho esconde o valor e o toque abre o histórico) e o sino à direita;
   - botão redondo grande: **INICIAR**, na cor da marca, com brilho, quando está offline; **PARAR**, em vermelho e pulsando, quando está online;
   - confirmações "Ficar Online" ("Deseja se conectar e começar a receber solicitações de viagens agora?", com Cancelar | Iniciar) e "Ficar Offline" (Cancelar | Desligar);
   - botões no mapa: "✋ Maçaneta" (corrida de rua), filtros (preferências) e centralizar;
   - barra de baixo: Mapa | situação ("Você está offline" / "Procurando…", com a barra de progresso) | Corridas.
4. **Corridas:** abas "Disp. (n)" (corridas abertas que ele pode pegar), "Pend. (n)" (aceitas que ainda não começaram) e "Prog. (n)" (agendadas). Quando vazio: "Nenhuma corrida no momento…".
5. **Chamada (oferta do passageiro):**
   - **Topo:** "Oferta do passageiro" e um contador redondo de segundos.
   - **Valor:** o **LÍQUIDO** (o que o motorista recebe) fica GRANDE no centro, com − e + para a contra-oferta. Logo abaixo, menor, vem o **bruto** e a taxa da central ("Bruto R$ 14,00 · taxa R$ 2,10"). O líquido é o bruto menos a comissão da central daquela categoria.
   - **Ganho por km:** a etiqueta "Ganhe R$ x/km" é calculada pelo líquido.
   - **Três números em colunas:** o tempo até o passageiro ("1 min até você"), a nota do passageiro e o número de viagens dele.
   - **Observação do passageiro:** numa faixa amarela, quando houver.
   - **Endereços:** embarque e destino (e as paradas), com a distância da viagem.
   - **Pagamento:** a forma de pagamento e a categoria.
   - **Botões:** **RECUSAR** (contornado, vermelho) e **ACEITAR R$ <líquido>** (cheio, na cor da marca).
   - **Alertas:** som e vibração, com aviso insistente a cada 5 s.
6. **Em corrida:**
   - faixa de navegação no topo, com a seta e "23 m · Dirija na direção…" (vem do serviço de rotas, se houver) e o botão de mudo;
   - cartão do passageiro: foto, nota, número de corridas, Chat e Ligar, e "Ver perfil";
   - Local de embarque, com o botão de navegar;
   - "Ver rota completa" e "Editar rota";
   - Pagamento, Valor total, Categoria, OS e "Solicitado em";
   - **botão de deslizar**, que muda de acordo com a etapa: "Cheguei ao local", "Iniciar viagem", "Saí da parada" e "Finalizar".
7. **Maçaneta** (corrida de rua): "Corrida maçaneta · Embarque direto · Sem agendamento". Modo de cobrança: **Taxímetro livre** (sem destino, valor pela distância e pelo tempo reais) ou **Com destino** (calcula a rota e o valor). Embarque pela posição atual ("GPS ativo") e o botão "Iniciar corrida no taxímetro".
8. **Histórico de viagens:**
   - mês com seletor e filtro "Visualizar por: Semanal | Mensal";
   - cartão "Ganhos do mês", com o valor e o gráfico de barras;
   - viagens, tempo online e tempo em trânsito;
   - "Formas de pagamento e bônus", com o valor de cada uma;
   - "Viagens realizadas", agrupadas por dia: OS, hora, valor, passageiro, pagamento, embarque e destino.
9. **Preferências:** formas de pagamento que aceita (dinheiro, cartão de crédito, cartão de débito, Pix, cartão no app); filtros e exigências (porta-malas grande, aceita encomendas, adaptado para cadeirante, ficar à disposição do passageiro); botão SALVAR PREFERÊNCIAS.
10. **Menu lateral:**
    - topo com a foto, o nome, o selo de aprovado, o modelo e a placa;
    - Operação: Abrir corrida (Maçaneta), Histórico de ganhos e Indique e ganhe (selo Bônus);
    - Conta e veículo: Meus veículos, Dados cadastrais e Alterar senha;
    - Suporte e sistema: Diagnóstico do app, Chat com suporte, Fale conosco, Configurações, Termos de uso e Política de privacidade;
    - "Sair da conta" e a versão.
11. **Meu cadastro:** Dados pessoais, Foto do rosto, Endereço, Veículo e Documentos (cada documento com a situação: aprovado, em análise ou recusado com motivo). Em Financeiro: "Recebimento por cartão", que fica desligado até haver serviço de pagamento. E "Excluir minha conta".
12. **Meus veículos:** cartões com o modelo, a placa Mercosul, a cor e o ano, a situação (ativo, aprovado) e os botões Editar e Excluir. O botão "+" adiciona um veículo, e tocar num cartão o deixa ativo.
13. **Configurações:**
    - Interface e tema: tema do app (sistema, claro, escuro) e navegador padrão (Google Maps ou Waze);
    - Mensagens prioritárias;
    - Alertas: vibrar no chamado e aviso insistente;
    - Áudio: assistente de voz (co-piloto, que avisa ao chegar perto) e volume automático.
14. **Diagnóstico:** cartão "Tudo pronto" ou "Falta algo" e a lista de verificações, cada uma com a situação: conta e cadastro, GPS, alerta de corridas na tela, canal de chamadas (conexão do tempo real), notificações, segundo plano e versão.
15. **Chat com suporte:** conversa com a central, com respostas rápidas, áudio e o botão de ouvir.
16. **Fale conosco:** "Suporte via WhatsApp", "Abrir chamado (site)" e "Ligar para a central". Os contatos vêm da marca da empresa.

## Fora do alcance sem serviço externo

- **Cartão salvo, Pix gerado no app e recebimento por cartão:** precisam de conta num serviço de pagamento da empresa. As telas existem, mas ficam desligadas.
- **Navegação passo a passo dentro do app:** precisa de um servidor de rotas (OSRM) com as instruções. Sem ele, a navegação abre o Google Maps ou o Waze.
- **Chamada por cima de outros apps:** precisa de um recurso nativo do Android.
