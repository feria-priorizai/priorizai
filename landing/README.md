# PriorizAI — Landing

Landing page de **PriorizAI**, software de priorización médica.
Hereda el sistema visual de la aplicación (`frontend/app/globals.css`): mismos tokens,
misma tipografía y los mismos componentes, para que la portada y el producto se vean
como una sola cosa.

Stack: **HTML estático** + **Bootstrap 5.3.3** (vendorizado, sin build) + CSS propio +
un archivo JS sin dependencias. No hay proceso de compilación ni scripts de ningún
lenguaje: lo que está en el repositorio es lo que se publica.

---

## Estructura

```
landing/
├── index.html                  Página completa (una sola)
└── assets/
    ├── css/priorizai.css       Sistema visual: tokens, componentes, animaciones
    ├── js/priorizai.js         Navbar, revelado al scroll, contadores, formulario
    ├── vendor/                 Bootstrap 5.3.3 (CSS + bundle JS con Popper)
    └── img/
        ├── imagotipo-color.svg           Lockup horizontal a color (navbar)
        ├── imagotipo-blanco.svg          Lockup horizontal en blanco (footer)
        ├── imagotipo-color-vertical.svg  Lockup apilado (manifiesto)
        ├── isotipo-color.svg             Solo el isotipo (favicon)
        ├── app-dashboard.png             Captura: dashboard
        └── app-detalle.png               Captura: detalle de interconsulta
```

Los cuatro SVG vienen del kit de marca. El original de cada uno es un lienzo de
600 × 600 con el dibujo centrado y mucho aire alrededor; puesto en un `<img>` con la
altura fija, el logo quedaba diminuto. El `viewBox` está recortado a la caja real del
trazo, así que `height: 34px; width: auto` da el tamaño que se espera.

## Cómo verla

Es HTML estático, pero conviene servirla por HTTP para que las rutas relativas
funcionen igual que en producción:

```bash
cd landing
npx serve .
```

Para publicarla basta subir la carpeta completa a cualquier hosting estático
(Netlify, Vercel, GitHub Pages, S3, un `/var/www` cualquiera).

---

## Sistema visual

Los tokens viven en `:root` dentro de `assets/css/priorizai.css` y son una copia de los
de la aplicación. **Si cambian allá, cambian aquí.**

| Token | Valor | Uso |
|---|---|---|
| `--pz-canvas` | `#C6D7F0` | El lienzo. Es azul, no blanco: contra él una tarjeta blanca se lee como un objeto y no como un hueco |
| `--pz-paper` | `#FFFFFF` | Superficie de tarjetas y paneles |
| `--pz-ink` / `--pz-ink-2` / `--pz-ink-3` | `#071426` / `#2E3F58` / `#55688A` | Rampa de texto |
| `--pz-line` / `--pz-line-2` | `#C8D6EA` / `#A7BEDC` | Bordes y reglas |
| `--pz-green-ink` | `#04704F` | Acciones que confirman |
| `--pz-blue-deep` | `#003D96` | Ancla institucional, etiquetas, enlaces, navegación |
| `--pz-purple-ink` | `#472A8C` | Bloques de énfasis: manifiesto, consecuencias |
| `--pz-alta` / `--pz-media` | `#B01D1D` / `#8A5200` | Triage. Saturados a propósito: son lo único que debe leerse desde lejos |
| `--pz-zona-alta` / `--pz-zona-media` / `--pz-zona-baja` | `#F7DADA` / `#FAE8CA` / `#CFF1E4` | Fondo del bloque de cada prioridad |
| `--pz-night` / `--pz-night-2` | `#061225` / `#0C2143` | Degradado de la sección de producto y del footer |

La regla que ordena el color es la de la aplicación: **el color saturado significa una
sola cosa, urgencia clínica.** Fuera del panel del héroe, del riel de cifras y de las
capturas, la página se sostiene con azul institucional y tinta.

**Tipografías** (Google Fonts, las mismas tres que carga la aplicación):

- **Archivo** (variable, eje `wdth`) — titulares y cifras, comprimidos entre 84 y 94.
- **Instrument Sans** — texto corrido.
- **IBM Plex Mono** — etiquetas, cifras y metadatos en versalitas espaciadas.

**Piezas compartidas con la aplicación**: `.pz-eyebrow` (etiqueta mono con regla
previa), `.pz-panel`, `.pz-chip`, `.pz-btn` con sus roles de color, `.pz-rail__item`
(la tarjeta de indicador del dashboard, con filete de acento) y `.pz-blueprint` (la
retícula de 32 px apenas insinuada sobre el lienzo). Las sombras son difusas y los
radios son 6 / 10 / 14 px, igual que allá.

## Componentes de Bootstrap usados

`navbar` + `collapse` + `scrollspy` · `container/row/col` · `nav-pills` + `tab-pane`
(las dos pantallas del producto) · `accordion` (preguntas) · `progress` (comparación
Chile/OCDE) · `form-control`, `form-select`, `form-check` + validación
(`needs-validation`, `was-validated`) · utilidades de espaciado y flex.

## Animación

- Revelado al entrar en pantalla vía `IntersectionObserver` (`.pz-reveal`, con
  `--d` para escalonar).
- El panel del héroe reordena las interconsultas en bucle: la de prioridad **Alta**
  sube al primer lugar y las demás bajan una posición, arrastrando su bloque de color.
  El recorrido depende de la altura real de cada fila (un diagnóstico largo ocupa dos
  líneas en anchos angostos), así que `priorizai.js` lo mide en cada vuelta.

  Las cuatro filas se animan con la **Web Animations API**, con el mismo `startTime`
  asignado a mano y la misma duración, para que sea un solo gesto. Se llegó ahí
  descartando dos enfoques: `@keyframes` con `var()` (el soporte de custom properties
  dentro de keyframes es irregular y en algunos navegadores el desplazamiento hacia
  abajo no se aplicaba) y transiciones CSS (funcionan, pero el navegador decide cuándo
  arranca cada una y se desincronizaban). Queda una transición CSS como respaldo para
  navegadores sin `element.animate`.

  El reordenamiento es el **único** movimiento del panel, y el bucle se detiene cuando
  el panel sale de pantalla.
- Contadores del riel de cifras con red de seguridad: si `requestAnimationFrame`
  se detiene, a los 1,6 s se fuerza el valor real del HTML, así una cifra citada
  nunca queda a medias.
- Todo respeta `prefers-reduced-motion: reduce`.

---

## Capturas del producto

`app-dashboard.png` y `app-detalle.png` son capturas reales de la aplicación. Cuando la
interfaz cambie hay que rehacerlas, o la landing terminará mostrando un producto que ya
no existe:

1. Levantar el stack (`docker compose up -d`) con interconsultas cargadas.
2. Abrir `/dashboard` y `/interconsultas/<id>` a 1600 × 1000 con el navegador en 2×.
3. Reescalar a 1920 px de ancho y reemplazar los archivos.

Para el detalle conviene elegir una interconsulta **sin bandera roja**: con la bandera
activa la prioridad la fuerza la regla y el panel no muestra la distribución de
confianza, que es justamente lo que la landing describe al lado de la captura.

## Qué falta conectar

1. **Correo de contacto.** Está como marcador de posición `contacto@priorizai.cl` en
   tres lugares: `index.html` (sección contacto y footer) y `assets/js/priorizai.js`.
   Reemplázalo por el real.
2. **Formulario.** Hoy valida en el cliente y arma un `mailto:` con los datos.
   Para un envío real, sustituye ese bloque de `priorizai.js` por un `fetch`
   al endpoint que corresponda (Formspree, una función serverless, tu backend).
3. **Analítica y OG image.** `og:image` apunta a la captura del dashboard;
   si quieres una imagen social propia, reemplázala por una de 1200 × 630.

## Contenido: de dónde sale cada cifra

- 8 meses de espera (no GES) y 86,7 % en FONASA — Visor Ciudadano de Tiempos de Espera.
- 3,3/3,9 médicos y 1,9/4,2 camas cada 1.000 hab.; 3.749/5.967 USD per cápita —
  OCDE, *Panorama de la salud 2025: Chile*.
- 37.000 especialistas, <50 % en el sistema público — CONACEM, 07-03-2024.
- 15 minutos por interconsulta y 1 millón de interconsultas digitales — HL7 Chile.

Lo que la página afirma sobre el producto sale de la referencia del proyecto: alcance,
requerimientos y restricciones duras. En particular, y porque es fácil equivocarse:

- **El producto no anonimiza.** La anonimización pertenece al trabajo de investigación,
  no a esta aplicación. Lo que el producto garantiza es que ningún dato clínico sale de
  la infraestructura del hospital y que el texto clínico se descarta una vez exportado.
- **El reentrenamiento no es una función del software.** Se presta como servicio del
  equipo sobre la instalación del cliente.
- **Los 15 minutos** son los que toma priorizar una interconsulta, no los que dura una
  atención.

Los porcentajes del panel del héroe son casos sintéticos y están rotulados como tales.
La página incluye, además, el descargo de que PriorizAI es una herramienta de apoyo a la
decisión clínica y no reemplaza el criterio del profesional tratante.
