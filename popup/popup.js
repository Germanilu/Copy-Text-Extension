document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("cleanedText");
  const copyBtn = document.getElementById("copyBtn");
  const notification = document.getElementById("notification");
  const switchEl = document.getElementById("themeSwitch");
  const root = document.documentElement;

  
  // 1) Cargar último texto limpio
  chrome.storage.local.get("latestText", (res) => {
    textarea.value = res.latestText || "";
  });

  // 2) Cargar tema y sincronizar toggle
  chrome.storage.local.get("theme", (res) => {
    const theme = res.theme || "light";
    root.classList.toggle("dark", theme === "dark"); // aplica :root.dark variables
    if (switchEl) switchEl.checked = theme === "dark";
  });

  // 3) Toggle listener
  if (switchEl) {
    switchEl.addEventListener("change", () => {
      const newTheme = switchEl.checked ? "dark" : "light";
      root.classList.toggle("dark", newTheme === "dark");
      chrome.storage.local.set({ theme: newTheme }, () => {
      });
    });
  } else {
  }

  // 4) Copiar con boton y notificacion
  copyBtn.onclick = () => {
    // select + copy (compatible con popup)
    textarea.select();
    document.execCommand("copy");

    notification.textContent = "Texto copiado!";
    notification.classList.add("show");

    setTimeout(() => {
      notification.classList.remove("show");
    }, 1000);
  };

  // 5) Reset icon message al background
  chrome.runtime.sendMessage({ action: "resetIcon" });

});
