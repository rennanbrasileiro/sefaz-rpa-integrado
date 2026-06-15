# Contratos de módulos

## EasyMOB

Entrada:

- credenciais em config/env;
- horários de referência;
- meta diária;
- intervalo de almoço;
- modo: diagnóstico/teste/real.

Saída:

- plano do dia;
- journal;
- report JSON;
- pendências.

## Service

Entrada:

- período inicial/final;
- credenciais Service.

Saída:

- realizado por dia;
- totais;
- divergências com EasyMOB.

## Portal RH

Entrada:

- período/mês de referência;
- credenciais Portal RH.

Saída:

- espelho;
- saldos;
- pendências de acerto.

## Channel

Entrada:

- período semanal;
- projetos;
- atividades;
- agenda/rateio.

Saída:

- preview;
- `schedule.csv`;
- logs de execução.

