# Critérios de aceite

## Base

- `npm run check` passa.
- `python -m py_compile easymob/rpa/*.py` passa.
- Aplicação sobe em `localhost:3131`.
- Sem credenciais versionadas.

## EasyMOB

- Login visual funciona.
- Consulta marcações.
- Filtra somente hoje.
- Ignora histórico antigo na decisão do dia.
- Fecha modal de consulta antes de registrar.
- Em teste, nunca registra.
- Em real, registra somente com confirmação explícita.
- Reconsulta após registro.
- Gera journal.
- Watchdog reexecuta enquanto estiver dentro da janela.

## Service

- Consulta mês atual por padrão.
- Não trata lançamento como fluxo principal.

## Portal RH

- Consulta espelho/saldo.
- Acerto de ponto é exceção explícita.

## Channel

- Mantém fluxo funcional antigo.
- Rateio exato preservado.
- CSV antigo com datas repetidas preservado.

