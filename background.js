import { API_KEY } from "./config.js"
// -------------------------------------
// 1) CREAR MENÚS EN LA INSTALACIÓN
// -------------------------------------
chrome.runtime.onInstalled.addListener(() => {
  // --- LIMPIEZA ---
  chrome.contextMenus.create({ id: "clean_basic", title: "Limpiar →Basico", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_spaces", title: "Limpiar → Espacios múltiples", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_linebreaks", title: "Limpiar → Saltos múltiples", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_emojis", title: "Limpiar → Quitar emojis", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_urls", title: "Limpiar → Quitar URLs", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_html", title: "Limpiar → Quitar HTML", contexts: ["selection"] });

  // --- TRANSFORMAR ---
  chrome.contextMenus.create({ id: "clean_lower", title: "Transformar → minúsculas", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_upper", title: "Transformar → MAYÚSCULAS", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "clean_titlecase", title: "Transformar → Title Case", contexts: ["selection"] });

  // --- IA ---
  chrome.contextMenus.create({ id: "ai_simplify", title: "IA → Resumir", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "ai_professional", title: "IA → Reescribir profesional", contexts: ["selection"] });
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
  clean_lower: "lower",
  clean_upper: "upper",
  clean_titlecase: "titlecase",
  clean_basic: "basic",
};

const aiMap = {
  ai_professional: "Reescribe el siguiente texto con un tono profesional, claro y formal, apropiado para correos o comunicaciones corporativas. Mantén el significado original, evita frases meta o introducciones sobre el proceso.",
  ai_simplify: "Resume el siguiente texto de manera clara y fácil de leer, produce: Un resumen breve en uno o dos párrafos y Una lista de puntos esenciales con frases cortas.No agregues información extra ni incluyas frases meta o explicaciones sobre cómo realizas la tarea",
  ai_correct: "Corrige ortografía, gramática y puntuación. Mejora la claridad y fluidez sin alterar el sentido original. No agregues contenido ni incluyas frases meta o comentarios sobre el proceso.",
};

// -------------------------------------
// 3) HANDLE CLICK DEL MENÚ
// -------------------------------------
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Ejecutamos un content script para obtener la selección real con saltos de línea
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.getSelection().toString(),
  }, async (results) => {
    const selectionText = results[0].result;
    const menuItemId = info.menuItemId;

    let cleanedText;

    if (cleanMap[menuItemId]) {
  
      cleanedText = applyCleaning(cleanMap[menuItemId], selectionText);
    } else if (aiMap[menuItemId]) {
  
      const prompt = `${aiMap[menuItemId]}\n\nTexto:\n${selectionText}`;
      cleanedText = await callAI(prompt);
    }

    chrome.action.setIcon({
      path: {
        48: "assets/notif.png",
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


      //Script para modificar el texto directamente en el input/textarea (gmail etc) 
      chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: (text) => {

          const activeEl = document.activeElement;

          if (!activeEl) return;

          if (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA") {
            const start = activeEl.selectionStart;
            const end = activeEl.selectionEnd;
            activeEl.setRangeText(text, start, end, "end");
            activeEl.focus();
            return;
          }

          if (activeEl.isContentEditable) {
            const selection = window.getSelection();
            if (!selection.rangeCount) return;

            const range = selection.getRangeAt(0);
            range.deleteContents();

            // Convertir saltos de línea a <br>
            const html = text.replace(/\n/g, "<br>");

            range.insertNode(range.createContextualFragment(html));

            // Mover cursor al final
            selection.collapseToEnd();
            return;
          }
        },
        args: [cleanedText]
      });

    }
  });
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

  // 1) Normalizar saltos de línea
  text = text.replace(/\r\n/g, "\n");

  switch (type) {
    case "spaces":
      return text.replace(/[ \t]+/g, " ").trim();

    case "linebreaks":
      return text.replace(/\n{2,}/g, "\n");

    case "emojis":
      return text.replace(/[\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, "");

    case "urls":
      return text.replace(/https?:\/\/[^\s\n]+/g, "");

    case "html":
      let bodyMatch = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      text = bodyMatch ? bodyMatch[1] : text;
      text = text.replace(/<(br|br\s*\/|p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n");
      text = text.replace(/<!--[\s\S]*?-->/g, "");
      text = text.replace(/<(head|style|script|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, "");
      text = text.replace(/<(html|!doctype)[^>]*>/gi, "");
      text = text.replace(/<[^>]+>/g, "");
      text = text.replace(/\n{2,}/g, "\n");
      text = text.replace(/^[ \t]+/gm, "").replace(/[ \t]+$/gm, "");
      return text.trim();

    case "normalize":
      return text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    case "titlecase":
      return text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

    case "lower":
      return text.toLowerCase();

    case "upper":
      return text.toUpperCase();

    case "basic":
      return text.replace(/[ \t]+/g, " ")
        .replace(/\n{2,}/g, "\n")
        .replace(/\u00A0/g, " ")
        .replace(/\u200B/g, "")
        .replace(/–|—/g, "-")
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .normalize("NFKC")
        .trim();

    default:
      return text;
  }
}

// -------------------------------------
// 6) REVERTIR ICONO AL CLICK EN LA EXTENSIÓN
// -------------------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "resetIcon") {
    chrome.action.setIcon({
      path: {
        48: "assets/logo48.png",
      }
    });
  }
});