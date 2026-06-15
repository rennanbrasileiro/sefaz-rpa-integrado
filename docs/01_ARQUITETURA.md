# Arquitetura alvo 1.1.x

## Princípio

O projeto deve ser modular por manutenção e integrado por fluxo.

Separado para evoluir:

- `easymob/rpa/*`
- `routes/easymob.js`
- `routes/service.js`
- `rpa/portalrh.js`
- `rpa/channel.js`
- `public/*`

Integrado por dados:

- `userconfig.json`
- `data/automation.json`
- `data/journal.jsonl`
- `data/pending-actions.json`
- reports de cada módulo

## Fluxo

EasyMOB → Service → Portal RH → Channel.

## Estado central

O projeto precisa evoluir para um `stateStore` único com:

- dia atual;
- semana atual;
- mês atual;
- pendências;
- último plano;
- última execução;
- divergências entre módulos.

