# CleanWrite · Diseño (material para Claude Code)

Todo lo necesario para construir la interfaz v2 y las imágenes de la tienda. Léelo junto con `CLAUDE.md`.

## Qué hay en esta carpeta
| Ruta | Qué es |
|---|---|
| `icons/` | Iconos finales: `icon16/32/48/128.png` + `icon.svg` (48 px y mayores) e `icon-small.svg` (16 y 32 px). Copiar a `icons/` de la extensión y referenciar en `manifest.json` (`icons` y `action.default_icon`). |
| `design/screenshot-*.html` | Las 5 capturas de la tienda (1280×800). Las 1 a 3 contienen la **maqueta del panel v2**: son la referencia visual exacta (medidas, colores y radios en los estilos en línea). |
| `design/promo-440x280.html` | Imagen promocional pequeña de la tienda. |
| `design/icon-sheet.html` | Hoja del icono y la paleta. |
| `scripts/export-store-images.mjs` | Exporta `design/*.html` a `store/*.png` con Playwright, al tamaño exacto. |

## Idea de marca
El producto actúa sobre el **texto seleccionado**: una línea resaltada en lima y un destello (la acción).

## Tokens
```css
:host, :root {
  --cw-ink: #111827;        /* texto, botón primario, fondos oscuros */
  --cw-lime: #BEF264;       /* acento: Replace, enviar, resaltado. Siempre con texto ink */
  --cw-lime-soft: #ECFCCB;  /* chips y acciones propias */
  --cw-lime-border: #A3E635;
  --cw-lime-text: #1A2E05;  /* texto sobre lime-soft */
  --cw-selection: #D9F99D;  /* texto seleccionado en las maquetas */
  --cw-moss: #3F6212;       /* texto verde sobre claro */
  --cw-slate: #475569;      /* texto secundario sobre claro */
  --cw-border: #CBD5E1;
  --cw-divider: #E2E8F0;
  --cw-paper: #F8FAFC;
  --cw-white: #FFFFFF;
  --cw-ink-2: #1F2937;      /* tarjetas sobre ink */
  --cw-on-ink-muted: #CBD5E1;
  --cw-radius-panel: 16px;
  --cw-radius-control: 12px;
  --cw-radius-pill: 22px;
  --cw-shadow-panel: 0 16px 40px rgba(17, 24, 39, 0.16);
  --cw-font: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
  --cw-font-display: "Space Grotesk", var(--cw-font);
}
```
- Tipografía: Inter 400/600 para interfaz; Space Grotesk 700 solo en titulares de la tienda. Dentro de la extensión, usar la pila del sistema o empaquetar Inter (no cargar Google Fonts en tiempo de ejecución).

## Panel (componente principal)
Referencia: `design/screenshot-1-hero.html` (acciones), `screenshot-2-result.html` (resultado), `screenshot-3-my-actions.html` (acciones propias).
- Contenedor: fondo blanco, borde 1px `--cw-border`, radio 16px, sombra `--cw-shadow-panel`, padding 16 a 18px, separación 14px.
- Ancho: `min(440px, calc(100vw - 24px))`. Debe adaptarse a ventanas estrechas: los botones hacen `flex-wrap`, nada de anchos fijos.
- Botones de acción: píldoras de 44px de alto, padding horizontal 18px, borde `--cw-border`, texto ink 600 de 15px. Hover: fondo `--cw-paper`. La acción activa: fondo ink, texto blanco.
- Campo de instrucción: 44px de alto, radio 12px, fondo `--cw-paper`; con foco, borde 2px ink. Botón de enviar 44×44, fondo lime, icono de flecha ink.
- Resultado: etiqueta de la acción (texto moss sobre lime-soft, radio 8px) + origen a la derecha ("On your device"); texto 16px/1.55; botones `Replace` (lime), `Copy` y `Try again` (borde).
- Acciones propias: píldoras con fondo lime-soft, borde lime-border, texto lime-text. "Save as action": borde discontinuo.
- Accesibilidad: `<button>` reales, foco visible (outline 2px ink con offset 2px), Esc cierra, contraste mínimo 4.5:1, objetivos táctiles de 44px.
- Modo oscuro (`prefers-color-scheme: dark`): fondo `--cw-ink-2`, borde #374151, texto blanco, secundario `--cw-on-ink-muted`; lime igual.
- Todo dentro de Shadow DOM, con `all: initial` en el host para aislarlo del CSS de la página.

## Popup y opciones
Mismos tokens. Popup de 340px de ancho: cabecera con icono 28px + "CleanWrite", estado de la IA, atajo y enlace a opciones. Página de opciones: una columna de máx. 720px, adaptable a móvil.

## Imágenes de la tienda
1. Construir el panel real.
2. En `design/screenshot-1..3.html`, sustituir la maqueta del panel por una captura real (o ajustar la maqueta para que coincida exactamente con el panel real).
3. Ejecutar `node scripts/export-store-images.mjs` → `store/*.png`.
4. Subir a la tienda: icono 128, promo 440×280 y las 5 capturas 1280×800.

Reglas: sin marcas de terceros en las imágenes; solo afirmar lo que la versión hace; texto de las capturas en inglés.
