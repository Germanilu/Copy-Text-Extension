# CleanWrite · Guía para Claude Code (v2)

## Qué es
Extensión de Chrome (Manifest V3) para actuar sobre el texto seleccionado sin salir de la página.
**Objetivo:** evitar el copia-pega a ChatGPT/Gemini/Claude para pedir acciones concretas sobre un texto.
**Mensaje:** gratis, sin cuenta, sin clave, y tu texto no sale del ordenador.

Estado de partida (v1.0.0, nov. 2025): submenú contextual con 12 opciones planas (6 Clean, 3 Transform, 3 AI).

## Material de diseño
Todo está en `brand/cleanwrite-design/`. **Lee `brand/cleanwrite-design/DESIGN.md` antes de tocar la interfaz**: tokens, especificación del panel, iconos finales, maquetas HTML de referencia y el script que exporta las imágenes de la tienda.
- Popup: **440px** de ancho (decisión del usuario, sustituye a los 340px de `DESIGN.md`). Nunca usar `vw` en su ancho: Chrome dimensiona el popup según el contenido.
- Los tokens y componentes ya están implementados en `ui/tokens.css` y `ui/components.css`: úsalos en el popup, el panel y las opciones (no dupliques colores).

## Principios
1. **Todo en el mismo lugar:** un único panel junto a la selección. Nada de submenús largos ni pestañas nuevas.
2. **Cero configuración:** funciona recién instalada. Los ajustes son opcionales.
3. **Ninguna clave del desarrollador en el paquete.** Nunca. Ni backend propio.
4. **IA solo para tareas sencillas** sobre un fragmento de texto (un párrafo, un email), no documentos enteros.
   - Límites (decisión del usuario, 17/11/2026): Summarize, Translate y Fix aceptan hasta 30.000 caracteres troceando el texto (`ai/chunk.js`; resumen de resúmenes para Summarize). Rewrite e instrucción libre: 4000, porque necesitan el texto entero para ser coherentes.
5. **Privacidad por defecto:** sin analítica, sin servidores propios.

## Clave antigua (resuelto)
- La v1.0.0 publicada llevaba una clave de Groq en `config.js`. **Revocada por el usuario el 17/11/2026** y `config.js` borrado. Nunca estuvo en el historial de git. La IA de la v1.0.0 publicada ya no funciona: publicar la 2.0 cuanto antes.

## Proveedores de IA (por orden)
Crear una capa `ai/provider` con una interfaz única (`run(action, text, options) → string`) y dos implementaciones:

1. **`builtin` (por defecto): IA integrada de Chrome (Gemini Nano, en el dispositivo).**
   - Resumir → Summarizer API. Traducir → Translator API + Language Detector API. Corregir, reescribir e instrucción libre → Prompt API (disponible en extensiones desde Chrome 138).
   - Comprobar disponibilidad antes de mostrar las acciones (`availability()`), gestionar el estado "descargando modelo" con progreso y el estado "no disponible".
   - **Verifica los nombres y la forma exacta de las API en https://developer.chrome.com/docs/ai/built-in-apis antes de programar**: han cambiado varias veces. No uses Rewriter/Writer/Proofreader mientras sigan en pruebas.
   - Pendiente de comprobar: requisitos de hardware (disco, RAM/GPU, solo escritorio) y en qué idiomas responde bien el modelo.
2. **`byok` (opcional): clave gratuita del usuario.**
   - Primer proveedor: Gemini (clave de Google AI Studio). Diseñar la interfaz para poder añadir otros (Groq, OpenAI).
   - La clave se guarda en `chrome.storage.local`, nunca en `sync`, nunca se registra en consola.
   - Llamada directa del navegador al proveedor. Gestionar el error 429 (cupo agotado) con un mensaje claro.
   - Pedir el permiso de host del proveedor como **opcional** (`optional_host_permissions`), solo cuando el usuario añade una clave.

Si no hay ningún proveedor disponible: las acciones de IA se muestran desactivadas con un enlace "Activar IA" que explica las dos opciones. "Clean" funciona siempre.

## Interfaz v2

### Panel (pieza central)
- Se abre con: clic derecho → **CleanWrite ▸** Fix · Rewrite ▸ (tonos) · Summarize · Translate · Clean ▸ (Clean up, lowercase, UPPERCASE, Title Case) · More actions…, y con un atajo (`commands`, Alt+W, configurable). Las acciones del menú abren el panel directamente en el resultado. (Decisión del usuario, 17/11/2026: sustituye a "una sola entrada".)
- Implementación: `panel/content.js` (host en Shadow DOM, posición y Replace) carga `panel/panel.html` en un iframe (`web_accessible_resources`, `allow="language-model; summarizer; translator; language-detector; clipboard-write"`); la IA se ejecuta en el iframe. Comunicación por `MessageChannel`.
- Se inyecta con `activeTab` + `scripting` dentro de un **Shadow DOM** (para que el CSS de la web no lo rompa), anclado bajo la selección; si no cabe, encima.
- Estado 1 · Acciones: `Fix` · `Rewrite` · `Summarize` · `Translate` · `Clean` + fila "My actions" (botones guardados) + campo "Or tell it what to do…".
- Estado 2 · Cargando: indicador breve; cancelable con Esc.
- Estado 3 · Resultado: texto resultante + `Replace` (solo si la selección es editable) · `Copy` · `Try again`. Etiqueta "On your device" o el nombre del proveedor.
- `Rewrite` abre una segunda fila de tonos: Professional · Friendly · Shorter · Simpler.
- `Translate` usa el idioma del navegador como destino por defecto; selector de idioma en el resultado.
- Teclado: Esc cierra, Enter ejecuta la instrucción, foco visible, botones reales (`<button>`).
- CSS siempre adaptable (anchos fluidos, `flex-wrap`, sin medidas fijas que rompan en ventanas estrechas).

### Acciones propias
- "Save as action" guarda la instrucción escrita como botón (nombre + prompt) en `chrome.storage.sync`.
- Gestión (renombrar, borrar, reordenar) en la página de opciones.

### Clean (sin IA, instantáneo)
Un solo botón "Clean" aplica el conjunto elegido en opciones. Reglas (funciones puras, con tests en Vitest):
- espacios múltiples, saltos de línea múltiples, espacios al final de línea
- caracteres invisibles (zero-width U+200B/C/D, BOM U+FEFF, espacio fino U+202F, no-break U+00A0 → espacio normal)
- rayas y comillas tipográficas → guion y comillas rectas (opcional, desactivado por defecto)
- restos de Markdown (`**`, `__`, `#`, viñetas `*` → `-`)
- etiquetas HTML, URLs, emojis (opcionales)
- Mantener de la v1: lowercase / UPPERCASE / Title Case como submenú de "Clean" en el panel, no en el menú contextual.

### Reemplazar texto
- `<input>`/`<textarea>`: `setRangeText` + eventos `input`/`change`.
- `contenteditable` (Gmail, LinkedIn, Notion, WhatsApp Web): `document.execCommand('insertText')` o `beforeinput`/`InputEvent` para que el editor y el deshacer (Ctrl+Z) funcionen. Probar en esos cuatro sitios.
- Texto no editable: solo `Copy`.

### Opciones y popup
- Popup del icono: mínimo. Estado de la IA, atajo, enlace a opciones. Opcional: área para pegar texto y usar las mismas acciones.
- Opciones: reglas de Clean, acciones propias, proveedor de IA y clave, idioma de traducción por defecto.

## Permisos (mínimos)
`contextMenus`, `activeTab`, `scripting`, `storage`. Sin `<all_urls>` ni content scripts permanentes. Host del proveedor BYOK como opcional.

## Idiomas
`_locales` para en, es, it, pt (interfaz y ficha). `default_locale: en`.

## Orden de trabajo
1. Auditar el código actual: quitar clave/backend, listar permisos.
2. Reglas de Clean como funciones puras + tests.
3. Capa `ai/provider` con `builtin`; pantalla de disponibilidad.
4. Panel en Shadow DOM con los tres estados y los tokens de `DESIGN.md`; una entrada de menú contextual + atajo.
5. Reemplazo en campos y `contenteditable`; pruebas en Gmail, LinkedIn, Notion, WhatsApp Web.
6. Instrucción libre + acciones guardadas.
7. Proveedor `byok` (Gemini) + opciones.
8. `_locales`, versión 2.0.0. (Iconos nuevos ya copiados a `icons/`.)
9. Imágenes de la tienda: actualizar las maquetas con el panel real y ejecutar `brand/cleanwrite-design/scripts/export-store-images.mjs`.

## Fuera de alcance por ahora
Barra lateral de chat, historial, cuentas, plan de pago, documentos largos/PDF, botón flotante automático al seleccionar (molesta; solo menú y atajo).

## Criterio de calidad
- Probar cada acción con textos en inglés, español e italiano: si el modelo integrado no da un resultado fiable en un idioma, decirlo en la interfaz en lugar de prometerlo.
- La ficha de la tienda solo puede afirmar lo que la versión subida hace de verdad.
- No incluir `brand/` ni `store/` en el zip que se sube a la tienda.

## IA integrada: hechos verificados (docs de developer.chrome.com, 16/11/2026)
- Estables (web y extensiones, Chrome 138+): Summarizer, Translator, LanguageDetector, Prompt API (`LanguageModel`). Writer/Rewriter/Proofreader: en pruebas → no usar.
- Prompt API y Summarizer: solo **en, es, ja, de, fr**. Italiano y portugués NO → la UI lo dice (`language_unsupported`). Translator sí cubre it/pt.
- No disponibles en Web Workers; la doc no aclara el service worker de la extensión → la IA se ejecuta en un contexto con ventana (página de la extensión).
- Si el modelo está `downloadable`/`downloading`, `create()` exige activación del usuario (clic) → la descarga se lanza desde un botón ("Enable AI").
- Prompt API en extensiones: `temperature` y `topK` juntos o ninguno (ahora: ninguno).
- Requisitos: escritorio (Win 10/11, macOS 13+, Linux, Chromebook Plus), 22 GB libres, GPU > 4 GB VRAM o 16 GB RAM + 4 núcleos.

## Desarrollo
- Capa de IA: `ai/provider.js` (interfaz común), `ai/builtin.js` (Chrome), `ai/errors.js` (códigos `AIError`), `ai/prompts.js`.
- Tests: `npm test` (Vitest). Las reglas de Clean viven en `clean/rules.js`.
- Paquete para la Web Store: `powershell -ExecutionPolicy Bypass -File scripts/build.ps1` → `dist/`. Solo incluye los archivos listados en el script (nunca `.git`, `node_modules`, tests ni `config.js`).
