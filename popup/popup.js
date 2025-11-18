document.addEventListener("DOMContentLoaded", () => {
  const textarea = document.getElementById("cleanedText");
  const copyBtn = document.getElementById("copyBtn");

  // obtener último texto limpio
  chrome.storage.local.get("latestText", (res) => {
    textarea.value = res.latestText || "";
  });

  copyBtn.onclick = () => {
    textarea.select();
    document.execCommand("copy");
    alert("Texto copiado!");
  };
  

  chrome.runtime.sendMessage({ action: "resetIcon" });
});


