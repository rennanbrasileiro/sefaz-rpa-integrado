$ErrorActionPreference = "Stop"
node --check server.js
node --check routes/api.js
node --check routes/service.js
node --check routes/easymob.js
node --check routes/automation.js
node --check rpa/channel.js
node --check rpa/portalrh.js
python -m py_compile easymob/rpa/*.py
Write-Host "Checks sintáticos concluídos."
