# SEFAZ RPA Integrado 1.1.0

Base estável/codex-ready para evoluir o fluxo EasyMOB → Service → Portal RH → Channel sem continuar gerando versões soltas.

## Objetivo

Automatizar e auditar a rotina de ponto/apontamento com módulos separados, mas integrados por estado, journal e contratos claros.

Fluxo real:

1. **EasyMOB**: origem diária do ponto. Consulta marcações, calcula próxima ação e registra somente quando a regra permitir.
2. **Service Datainfo**: consulta do realizado. Lançamento é exceção.
3. **Portal RH**: frequência, espelho, saldo e acerto de ponto.
4. **Channel/JExperts**: fechamento semanal/rateio por projeto, preservando o fluxo funcional antigo.

## O que entrou na 1.1.0

- Aplicado patch EasyMOB 1.0.1 sobre a base 1.0.0.
- Corrigida a falha real de 15/06/2026: modal `#ModalConsultasMarcacoes` bloqueava o clique em `#btnRegistrar`.
- Adicionado fechamento seguro de modal/backdrop antes de registrar ponto.
- Adicionada reconsulta após registro para confirmar se houve nova marcação.
- Adicionado `data/journal.jsonl` para histórico auditável de execução.
- Adicionado modo `--watchdog` no EasyMOB.
- Adicionados scripts PowerShell para instalar/remover o watchdog no Agendador de Tarefas.
- Adicionados documentos para Codex: arquitetura, contratos, critérios de aceite e prompt de evolução.

## Instalação local

```powershell
cd "C:\Users\rennan.cordeiro\OneDrive - sefaz.pe.gov.br\Área de Trabalho\Projetos\sefaz_rpa_integrado_1.1.0"
Copy-Item -Recurse "C:\Users\rennan.cordeiro\OneDrive - sefaz.pe.gov.br\Área de Trabalho\Projetos\Channel Front\sefaz-final\node_modules" ".\node_modules"
npm start
```

Se houver internet fora da rede corporativa:

```powershell
npm install
npm run install-browsers
npm start
```

## Checks

```powershell
.\scripts\check.ps1
```

ou:

```bash
npm run check:all
```

## EasyMOB watchdog

O watchdog é o formato correto para ponto diário. Ele roda de forma recorrente, consulta o EasyMOB, calcula o estado do dia e só executa se a regra permitir.

Instalar no Windows:

```powershell
.\scripts\install_easymob_watchdog.ps1
```

Remover:

```powershell
.\scripts\uninstall_easymob_watchdog.ps1
```

Executar um ciclo manual de watchdog:

```powershell
$env:EASYMOB_WATCHDOG_ENABLED="true"
$env:EASYMOB_DRY_RUN="true"
cd .\easymob\rpa
python runner.py --watchdog --headless
```

Para modo real, exige as duas confirmações:

```powershell
$env:EASYMOB_DRY_RUN="false"
$env:EASYMOB_CONFIRM_REAL="true"
```

## Segurança

Não versionar:

- `.env`
- `userconfig.json`
- `node_modules/`
- logs reais
- screenshots
- reports com dados sensíveis

## Evolução por Codex

Leia nesta ordem:

1. `.codex/instructions.md`
2. `CODEX.md`
3. `docs/01_ARQUITETURA.md`
4. `docs/02_FLUXO_OPERACIONAL.md`
5. `docs/03_EASYMOB_WATCHDOG.md`
6. `docs/04_CONTRATOS_MODULOS.md`
7. `docs/05_CRITERIOS_ACEITE.md`


## Operação diária EasyMOB e Windows

1. Abra `http://localhost:3131` e confira **EasyMOB > Status de hoje**. Se o estado for de outro dia, o painel oculta o plano antigo e pede uma nova consulta.
2. Deixe **Modo padrão = TESTE / NÃO GRAVA** para validar. TESTE nunca registra ponto.
3. Para REAL, use **Aprovação REAL diária > Autorizar REAL hoje**. A autorização expira às 23:59 e pode ser revogada pelo painel.
4. Clique **Ativar rotina**. Os horários configurados são apenas conferências; o plano calculado pelas marcações reais decide o horário de ação.
5. Para iniciar o servidor com o Windows, use `scripts\install_server_startup.ps1`. Se PowerShell for bloqueado, use `scripts\run_server.bat` no Inicializar do Windows.
6. Para watchdog no Agendador de Tarefas, use `scripts\install_easymob_watchdog.ps1`; para ambiente restrito, use `scripts\run_easymob_watchdog.bat`.

Comandos úteis:

```powershell
# servidor ao logar no Windows
.\scripts\install_server_startup.ps1

# watchdog recorrente no Agendador de Tarefas
.\scripts\install_easymob_watchdog.ps1

# testar manualmente sem PowerShell
.\scripts\run_server.bat
.\scripts\run_easymob_watchdog.bat
```

O painel **Orquestrador > Windows** mostra o caminho dos scripts, status do agendador quando estiver em Windows e botões de verificar/instalar/testar/remover a tarefa do watchdog.

Endpoints de agendamento expostos pelo painel:

- `GET /api/automation/windows/status`
- `POST /api/automation/windows/install`
- `POST /api/automation/windows/test`
- `POST /api/automation/windows/uninstall`

Os endpoints antigos `/api/automation/scheduler/*` continuam existindo por compatibilidade.
