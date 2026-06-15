# EasyMOB — módulo isolado

Este módulo roda em Python/Playwright e é disparado pelo painel Node.

## Configuração via variáveis

```env
EASYMOB_MODE=real
EASYMOB_SITE_LOGIN=https://easymob.metadados.com.br/Account/LoginColaborador
EASYMOB_ACCESS_KEY=
EASYMOB_USERNAME=
EASYMOB_PASSWORD=
```

## Rodar direto

```bash
cd easymob
python rpa/runner.py --test-login --headless
python rpa/runner.py --single-run --headless
```

Para execução única, crie `run_single.flag` com o horário desejado, por exemplo `08:00`.

## Simulador

Os arquivos `simulado/login.html`, `simulado/registro.html` e `simulado/app.js` foram mantidos apenas como referência/teste local.
