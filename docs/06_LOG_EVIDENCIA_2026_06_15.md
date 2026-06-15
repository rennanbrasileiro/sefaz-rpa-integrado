# Evidência EasyMOB 15/06/2026

Resumo do teste real:

- Entrada encontrada: 08:05:56.
- Saída almoço encontrada: 12:02:38.
- Retorno mínimo calculado: 13:02.
- O robô aguardou 709s antes de reconsultar.
- Plano após espera: `READY`, ação `retorno_almoco`, `allowed=true`.
- Falha: modal `#ModalConsultasMarcacoes` interceptou o clique no `#btnRegistrar`.

Conclusão:

- A regra de decisão estava correta.
- A execução falhou por bloqueio visual/modal.
- Correção 1.1.0: fechar modal/backdrop antes de registrar e reconsultar depois.

