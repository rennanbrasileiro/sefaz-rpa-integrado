# Instruções permanentes para Codex

- Faça mudanças incrementais, por commit lógico.
- Preserve comportamento validado antes de refatorar.
- Não apague `public/classic.html` até a fusão funcional estar validada.
- Não versionar credenciais, `.env`, `userconfig.json`, logs, reports ou screenshots.
- Antes de finalizar qualquer alteração, rode:
  - `npm run check`
  - `python -m py_compile easymob/rpa/*.py`
- Ao alterar EasyMOB, testar pelo menos:
  - `python runner.py --test-login --headless`
  - `python runner.py --plan-only --target 13:00 --headless`
- Não transforme Service em fluxo principal de lançamento.
- Não transforme Portal RH em consulta de Service.
- Não executar modo real sem `EASYMOB_DRY_RUN=false` e `EASYMOB_CONFIRM_REAL=true`.

