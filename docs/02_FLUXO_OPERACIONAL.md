# Fluxo operacional real

## EasyMOB

Origem diária do ponto. Deve:

1. consultar marcações do dia;
2. ignorar histórico de outros dias para decisão;
3. calcular a próxima ação;
4. aguardar ou registrar conforme regra;
5. reconsultar após ação;
6. gerar journal.

## Service

Consulta do realizado. Deve:

- abrir período padrão do mês atual;
- consultar realizado;
- comparar com EasyMOB;
- gerar divergências/pendências.

Lançamento no Service existe apenas como exceção.

## Portal RH

Frequência, espelho, saldo e acerto. Deve:

- consultar espelho;
- extrair saldo, falta, sobra, banco anterior/atual;
- permitir acerto de ponto quando necessário;
- alimentar a calculadora mensal.

## Channel

Fechamento semanal por projeto. Deve preservar:

- projetos;
- atividades;
- comentários;
- período;
- preview;
- rateio exato;
- dry-run;
- execução real controlada.

