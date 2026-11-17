# CleanWrite 2.0.0 · Qué hace exactamente (fuente de verdad)

> Documento para preparar la **política de privacidad**, la **ficha de la Chrome Web Store** y las **imágenes**.
> Describe la versión **2.0.0** tal como está en el código (commit de este documento).
> **Regla:** nada de lo que se publique puede afirmar algo que no esté en la sección 2. Lo de la sección 7 **todavía no existe**.

---

## 1. En una frase
CleanWrite es una extensión de Chrome que corrige, reescribe, resume, traduce y limpia el texto que seleccionas en cualquier web, usando la **IA integrada en Chrome (Gemini Nano), que se ejecuta en tu ordenador**. Gratis, sin cuenta, sin clave de API, y el texto no se envía a ningún servidor.

**Propósito único (para la tienda):** actuar sobre el texto seleccionado por el usuario en la página (corregir, reescribir, resumir, traducir o limpiar) sin salir de ella.

---

## 2. Funcionalidades (lo que SÍ hace la 2.0.0)

### 2.1 Cómo se usa
- **Clic derecho** sobre un texto seleccionado → **CleanWrite ▸**:
  - **Fix**: corrige ortografía, gramática y puntuación sin cambiar el estilo.
  - **Rewrite ▸** Professional · Friendly · Shorter · Simpler.
  - **Summarize**: resumen breve del texto.
  - **Translate**: traduce al idioma del navegador; en el resultado se puede elegir otro idioma.
  - **Clean ▸** Clean up text · lowercase · UPPERCASE · Title Case.
  - **More actions…**: abre el panel con todas las acciones.
- **Atajo de teclado Alt+W** (configurable en `chrome://extensions/shortcuts`): abre el panel sobre el texto seleccionado.
- **Popup** (icono de la barra): muestra el estado de la IA, permite pegar un texto y aplicarle las mismas acciones, y copiar el resultado. Enlace a la política de privacidad.

### 2.2 El panel
- Aparece **junto al texto seleccionado** (debajo; si no cabe, encima), dentro de la propia página.
- Estados: **acciones** → **cargando** (se puede cancelar con Esc) → **resultado**.
- En el resultado: etiqueta de la acción, la indicación **"On your device"**, el texto resultante y los botones:
  - **Replace**: sustituye el texto seleccionado por el resultado. Solo aparece si el texto está en un campo editable (cajas de texto, editores como Gmail, LinkedIn, Notion, WhatsApp Web). Se puede deshacer con Ctrl+Z.
  - **Copy**: copia el resultado al portapapeles (solo cuando el usuario pulsa el botón).
  - **Try again**: repite la acción.
- **Campo libre "Or tell it what to do…"**: el usuario escribe una instrucción propia (p. ej. "make it a bullet list") y se aplica al texto.
- Esc o clic fuera cierra el panel.
- Modo claro/oscuro automático según el sistema.

### 2.3 Clean (sin IA, instantáneo, funciona siempre)
Limpia el texto con reglas locales: espacios múltiples, saltos de línea de más, espacios al final de línea, caracteres invisibles (zero-width, BOM, espacios no separables) y restos de Markdown (`**`, `__`, `#`, viñetas `*` → `-`). Además: lowercase, UPPERCASE y Title Case (respeta acentos).
*(El código tiene también reglas opcionales para quitar HTML, URLs, emojis y comillas tipográficas, pero en la 2.0.0 no hay forma de activarlas desde la interfaz: no anunciarlas.)*

### 2.4 IA en el dispositivo
- Usa las APIs integradas de Chrome: **Prompt API** (Fix, Rewrite, instrucción libre), **Summarizer API** (Summarize), **Translator API + Language Detector API** (Translate).
- **La primera vez**, Chrome tiene que descargar su modelo de IA (varios GB). El usuario lo inicia con el botón **"Enable AI"** del popup o del panel; se muestra el progreso. La descarga la hace **Chrome** desde los servidores de Google, no CleanWrite.
- Después, **todo se procesa en el ordenador**. CleanWrite no hace ninguna petición de red.
- **Requisitos** (de Google, no nuestros): Chrome 138 o superior en ordenador (Windows 10/11, macOS 13+, Linux o Chromebook Plus), al menos 22 GB libres, y GPU con más de 4 GB de VRAM o 16 GB de RAM y 4 núcleos. **No funciona en móvil.** Si el equipo no cumple, la extensión lo dice y **Clean sigue funcionando**.
- **Idiomas:**
  - Fix, Rewrite, Summarize e instrucción libre: **inglés, español, francés, alemán y japonés**. Con otros idiomas (p. ej. italiano o portugués) la extensión **avisa** de que no puede hacerlo bien en vez de dar un mal resultado.
  - Translate: muchos más idiomas (incluidos italiano y portugués).
- **Longitud:** Summarize, Translate y Fix aceptan hasta **30.000 caracteres** (los procesa por partes). Rewrite e instrucción libre: hasta **4.000 caracteres**.
- Gratis, **sin límite diario impuesto por CleanWrite**, sin cuenta, sin clave de API.

---

## 3. Datos y privacidad (para la política)

### 3.1 Qué datos toca y dónde quedan
| Dato | Para qué | Dónde se guarda | ¿Sale del ordenador? |
|---|---|---|---|
| Texto seleccionado por el usuario | Aplicar la acción que el usuario elige | Solo en memoria mientras el panel está abierto | **No** |
| Texto escrito/pegado en el popup (`latestText`) | Que no se pierda al cerrar el popup | `chrome.storage.local` (en el navegador) | **No** |
| Último mensaje de error (`lastError`) | Mostrarlo en el popup | `chrome.storage.local` | **No** |
| Preferencias (`cleanRules`, `aiProvider`) | Reservado para ajustes; en la 2.0.0 se leen pero no hay interfaz para cambiarlas | `chrome.storage.sync` / `local` | Solo si el usuario tiene activada la sincronización de Chrome (la gestiona Google); no contienen texto del usuario |

- **No** hay servidores propios, **no** hay analítica, **no** hay cookies, **no** hay seguimiento, **no** hay anuncios, **no** se venden ni comparten datos.
- **No** se lee nada de la página salvo el texto que el usuario ha seleccionado y sobre el que pide una acción.
- **No** se copia nada al portapapeles sin que el usuario pulse **Copy**.
- **No** se modifica la página salvo cuando el usuario pulsa **Replace** (y solo el texto seleccionado).
- Desinstalar la extensión borra todos sus datos locales.
- **Terceros:** ninguno en la 2.0.0. El modelo de IA lo proporciona y descarga Chrome (Google); su uso se rige por las condiciones de Google/Chrome.
- **Menores:** no está dirigida a niños.

### 3.2 Declaraciones de la Chrome Web Store ("Privacy practices")
- Uso de datos: el desarrollador **no recoge ni transmite** datos de los usuarios. El texto seleccionado (contenido del sitio web) se procesa **solo localmente** para la función visible.
- Certificaciones: no se venden datos a terceros; no se usan ni transfieren para fines ajenos al propósito único; no se usan para solvencia ni préstamos.
- **Código remoto:** no. Todo el código va dentro del paquete.

### 3.3 Permisos y su justificación (textos para la tienda)
| Permiso | Justificación |
|---|---|
| `contextMenus` | Mostrar las acciones de CleanWrite en el menú del clic derecho sobre el texto seleccionado. |
| `activeTab` | Acceder a la pestaña actual **solo** cuando el usuario elige una acción del menú o pulsa el atajo, para leer el texto seleccionado y mostrar el panel. |
| `scripting` | Insertar el panel de CleanWrite en esa pestaña en ese momento y, si el usuario pulsa Replace, sustituir el texto seleccionado. |
| `storage` | Guardar en el navegador el texto del popup y preferencias. |
| `web_accessible_resources` (`panel/panel.html`) | El panel se muestra dentro de la página como un marco aislado de la extensión. No da acceso a ningún sitio. |

- **No** pide permisos de acceso a sitios web (sin `host_permissions`, sin `<all_urls>`), **no** tiene scripts que se ejecuten en todas las páginas.
- No funciona en páginas donde Chrome no permite extensiones (`chrome://`, Chrome Web Store, visor de PDF): allí el icono muestra "!" y el texto queda disponible en el popup.

---

## 4. Diferencias con la v1.0.0 (por si hace falta explicarlo)
- La v1 enviaba el texto a **Groq** (servidor externo) para las funciones de IA, con una clave del desarrollador. **La 2.0.0 ya no usa Groq ni ningún servidor**: la IA es la de Chrome, en el dispositivo. (La clave antigua está revocada.)
- La v1 pedía acceso a todas las webs (`http://*/*`, `https://*/*`); la 2.0.0 **no**.
- La v1 copiaba automáticamente al portapapeles y sustituía el texto sin preguntar; la 2.0.0 muestra el resultado y el usuario decide (**Replace** / **Copy**).
- Interfaz nueva (panel junto al texto, diseño nuevo, modo oscuro automático, iconos nuevos).

---

## 5. Datos de la ficha
- **Nombre:** CleanWrite
- **Versión:** 2.0.0
- **Descripción corta (manifest, 116 caracteres):** "Fix, rewrite, summarize, translate and clean selected text with Chrome's built-in AI. Free, private, on your device."
- **Web:** https://cleanwrite.eu/ · **Política de privacidad (URL que enlaza la extensión):** https://cleanwrite.eu/privacy-policy/
- **Categoría sugerida:** Productividad (Productivity) / Herramientas.
- **Idioma de la interfaz:** solo inglés en la 2.0.0.
- **Iconos y material gráfico:** `brand/cleanwrite-design/` (iconos finales en `icons/`).

---

## 6. Imágenes de la tienda: qué maquetas valen para la 2.0.0
Las maquetas están en `brand/cleanwrite-design/design/`.
| Maqueta | ¿Vale para la 2.0.0? |
|---|---|
| `screenshot-1-hero` (seleccionar y elegir acción) | **Sí.** El panel real coincide (acciones Fix · Rewrite · Summarize · Translate · Clean + "Or tell it what to do…"). |
| `screenshot-2-result` (resultado con Replace/Copy) | **Sí.** Coincide con el panel real. |
| `screenshot-3-my-actions` ("My actions", "Save as action") | **No.** Las acciones guardadas **no existen** en la 2.0.0. Quitar o sustituir (p. ej. por el menú del clic derecho o la instrucción libre). |
| `screenshot-4-free-private` | **Casi.** Las tarjetas 1 y 2 son ciertas. La tarjeta 3 **"Your own key, optional"** **no existe** en la 2.0.0: cambiarla (p. ej. "Works in your language: English, Spanish, French, German, Japanese" o "Clean works on any device"). |
| `screenshot-5-clean` (antes/después de Clean) | **Revisar el ejemplo.** "Before" incluye `<b>room</b>` y comillas tipográficas convertidas a rectas; en la 2.0.0 Clean **no** quita HTML ni cambia comillas por defecto. Usar un ejemplo solo con espacios, saltos de línea, Markdown e invisibles. |
| `promo-440x280` | Revisar que no prometa nada de la sección 7. |

Reglas: textos en inglés, sin marcas de terceros (no mostrar logos de Gmail, ChatGPT, etc.), solo afirmar lo de la sección 2.

---

## 7. Lo que NO hay en la 2.0.0 (no anunciarlo todavía)
- Acciones guardadas / "My actions" / "Save as action".
- Usar una clave propia (Gemini u otro proveedor) / IA en la nube.
- Página de opciones (activar reglas opcionales de Clean, idioma de traducción por defecto…).
- Interfaz traducida (español, italiano, portugués): la 2.0.0 está solo en inglés.
- Funcionamiento en móvil.
- Historial, cuentas, planes de pago.

Si en una versión futura se añade la clave propia (BYOK), **la política de privacidad tendrá que cambiar**: en ese caso el texto sí se enviaría al proveedor elegido por el usuario.
