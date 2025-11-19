import { API_KEY } from "./config.js"
// -------------------------------------
// 1) CREAR MENÚS EN LA INSTALACIÓN
// -------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  
  // --- LIMPIEZA ---
  chrome.contextMenus.create({ id: "clean_spaces", title: "Limpiar → Espacios múltiples", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_linebreaks", title: "Limpiar → Saltos múltiples", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_emojis", title: "Limpiar → Quitar emojis", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_urls", title: "Limpiar → Quitar URLs", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_html", title: "Limpiar → Quitar HTML", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_normalize", title: "Normalizar → Comillas", contexts: ["selection"] });

  // --- TRANSFORMAR ---
  chrome.contextMenus.create({ id: "clean_lower", title: "Transformar → minúsculas", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_upper", title: "Transformar → MAYÚSCULAS", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_titlecase", title: "Transformar → Title Case", contexts: ["selection"] });

  // --- IA ---
  chrome.contextMenus.create({ id: "ai_professional", title: "IA → Reescribir profesional", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "ai_simplify", title: "IA → Simplificar", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "ai_correct", title: "IA → Corregir ortografía y claridad", contexts: ["selection"] });
});

// -------------------------------------
// 2) MAPAS DE OPERACIONES
// -------------------------------------
const cleanMap = {
  clean_spaces: "spaces",
  clean_linebreaks: "linebreaks",
  clean_emojis: "emojis",
  clean_urls: "urls",
  clean_html: "html",
  clean_normalize: "normalize",
  clean_lower: "lower",
  clean_upper: "upper",
  clean_titlecase: "titlecase",
};

const aiMap = {
  ai_professional: "Reescribe este texto con un tono profesional y claro:",
  ai_simplify: "Simplifica este texto, hazlo más fácil sin perder el significado:",
  ai_correct: "Corrige ortografía y mejora claridad sin cambiar el sentido:",
};

// -------------------------------------
// 3) HANDLE CLICK DEL MENÚ
// -------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const { menuItemId, selectionText } = info;

  let cleanedText;

  if (cleanMap[menuItemId]) {
    cleanedText = applyCleaning(cleanMap[menuItemId], selectionText);
  } else if (aiMap[menuItemId]) {
    const prompt = `${aiMap[menuItemId]}\n\nTexto:\n${selectionText}`;
    cleanedText = await callAI(prompt);
  }
  chrome.action.setIcon({
  path: {
    48: "assets/CleanWriteNotif.png",
  }
});

  if (cleanedText) {
    // Guardamos en storage para mostrar en popup
    chrome.storage.local.set({ latestText: cleanedText });

    // Copia script en portapapeles
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => navigator.clipboard.writeText(text),
      args: [cleanedText]
    });
  }
});

// -------------------------------------
// 4) FUNCIÓN DE IA 
// -------------------------------------
async function callAI(prompt) {

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

// -------------------------------------
// 5) FUNCIONES DE LIMPIEZA LOCAL (simple ejemplo)
// -------------------------------------
function applyCleaning(type, text) {
  switch (type) {
    case "spaces": return text.replace(/\s+/g, " ").trim();
    case "linebreaks": return text.replace(/\n{2,}/g, "\n");
    case "emojis": return text.replace(/[\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, "");
    case "urls": return text.replace(/https?:\/\/\S+/g, "");
    case "html": return text.replace(/<[^>]+>/g, "");
    case "normalize": return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
    case "titlecase": return text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case "lower": return text.toLowerCase();
    case "upper": return text.toUpperCase();
    default: return text;
  }
}

// -------------------------------------
// 6) REVERTIR ICONO AL CLICK EN LA EXTENSIÓN
// -------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "resetIcon") {
    chrome.action.setIcon({
      path: {
        48: "assets/CleanWriteLogo.png",
      }
    });
  }
});