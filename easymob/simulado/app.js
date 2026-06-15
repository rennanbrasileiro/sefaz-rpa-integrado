(function () {
  const KEY = "marcacoes";
  const listaEl = document.getElementById("listaMarcacoes");
  const ultimaEl = document.getElementById("ultimaMarcacao");
  const badgeEl = document.getElementById("statusBadge");
  const usuario = sessionStorage.getItem("usuario") || "usuario_teste";
  const local = sessionStorage.getItem("local") || "Datainfo";

  const lblUsuario = document.getElementById("lblUsuario");
  const lblLocal = document.getElementById("lblLocal");
  if (lblUsuario) lblUsuario.textContent = usuario;
  if (lblLocal) lblLocal.textContent = local;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
    catch { return []; }
  }
  function save(arr) { localStorage.setItem(KEY, JSON.stringify(arr)); }

  function setBadge(ok) {
    if (!badgeEl) return;
    if (ok) {
      badgeEl.className = "badge ok";
      badgeEl.textContent = "✅ Marcado";
    } else {
      badgeEl.className = "badge warn";
      badgeEl.textContent = "⏳ Sem marcação";
    }
  }

  function render() {
    const arr = load();
    listaEl.innerHTML = "";
    arr.forEach(m => {
      const li = document.createElement("li");
      li.textContent = m;
      listaEl.appendChild(li);
    });
    if (arr.length) {
      ultimaEl.textContent = "Última marcação: " + arr[arr.length - 1];
      setBadge(true);
    } else {
      ultimaEl.textContent = "Nenhuma marcação ainda";
      setBadge(false);
    }
  }

  document.getElementById("btnRegistrar").addEventListener("click", () => {
    const now = new Date();
    const detalhe = (document.getElementById("txtDetalhamento")?.value || "").trim();
    const ts = now.toLocaleString("pt-BR");
    const arr = load();
    arr.push(`${ts}${detalhe ? " — " + detalhe : ""}`);
    save(arr);
    render();
  });

  document.getElementById("btnConsultar").addEventListener("click", () => render());

  if (sessionStorage.getItem("loggedIn") !== "1") {
    window.location.href = "login.html";
    return;
  }
  render();
})();