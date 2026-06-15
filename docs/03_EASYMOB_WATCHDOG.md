# EasyMOB watchdog

## Por que watchdog

Execução única é frágil. Se o clique falha, perde o horário. O watchdog roda em ciclos e reconsulta o estado antes de agir.

## Regra de marcações

- 0 marcações: entrada.
- 1 marcação: saída almoço.
- 2 marcações: retorno almoço, respeitando intervalo mínimo.
- 3 marcações: saída final, calculada pela meta diária.
- 4 ou mais: dia completo ou inconsistência.

## Janela

O Agendador de Tarefas chama o watchdog a cada 2 minutos. O Python só age quando estiver dentro da janela configurada.

## Modo real

Modo real exige:

- `EASYMOB_DRY_RUN=false`
- `EASYMOB_CONFIRM_REAL=true`
- `EASYMOB_WATCHDOG_ENABLED=true`

## Modal do EasyMOB

A modal `#ModalConsultasMarcacoes` precisa ser fechada após a consulta, antes do clique em `#btnRegistrar`.

