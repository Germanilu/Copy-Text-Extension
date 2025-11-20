document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("cleanedText");
  const copyBtn = document.getElementById("copyBtn");
  const notification = document.getElementById("notification");


  // obtener último texto limpio
  chrome.storage.local.get("latestText", (res) => {
    textarea.value = res.latestText || "";
  });


  copyBtn.onclick = () => {
    textarea.select();
    document.execCommand("copy");
    
    // mostrar notificación
    notification.textContent = "Texto copiado!";
    notification.classList.add("show");
    
    // ocultar después de 2 segundos
    setTimeout(() => {
      notification.classList.remove("show");
    }, 1000);
  };
  

  chrome.runtime.sendMessage({ action: "resetIcon" });
});


