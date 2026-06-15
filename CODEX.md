# Prompt base para Codex

Você está trabalhando no projeto **SEFAZ RPA Integrado 1.1.0**.

## Diretriz central

Não reescreva tudo. Evolua por módulo, sem regressão.

Módulos:

- EasyMOB: origem diária do ponto.
- Service Datainfo: consulta do realizado.
- Portal RH: espelho, saldo e acerto.
- Channel/JExperts: fechamento semanal/rateio por projeto.

## Regras obrigatórias

1. Não remover funcionalidade existente do Channel.
2. Não colocar credenciais em código.
3. Dry-run/teste deve ser padrão em qualquer fluxo destrutivo.
4. Modo real exige confirmação explícita.
5. Qualquer ação real precisa gerar journal em `data/journal.jsonl`.
6. O EasyMOB não pode depender de execução única; deve funcionar por watchdog recorrente.
7. Service é consulta, lançamento é exceção.
8. Portal RH é espelho/saldo/acerto, não deve ser confundido com Service.
9. Front-end deve ser padronizado por módulo: período, modo, navegador, velocidade, ações, status, logs.
10. Alterações devem ser pequenas e testáveis.

## Contexto técnico validado

Em 15/06/2026, o EasyMOB conseguiu:

- abrir login real;
- preencher `#chave`, `#usuario`, `#senha`;
- clicar `#btnLogin`;
- reconhecer tela de ponto;
- clicar `#btnConsultar`;
- ler histórico de marcações;
- filtrar somente marcações do dia;
- calcular retorno do almoço corretamente para 13:02.

A falha real foi: a modal `#ModalConsultasMarcacoes` ficou aberta e interceptou o clique no botão `#btnRegistrar`. A correção base 1.1.0 adicionou fechamento seguro da modal antes de registrar.

## Primeiro objetivo do Codex

Estabilizar a base 1.1.0 com:

- front único padronizado;
- watchdog EasyMOB confiável;
- journal e pendências;
- Service consulta;
- Portal RH espelho/acerto;
- Channel preservado.

