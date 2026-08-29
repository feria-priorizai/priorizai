# PriorizAI — Landing

Landing page de **PriorizAI**, software de priorización médica.
Construida a partir del pitch deck *Blue and White Modern Startup Pitch Deck Presentation*
(mismo logo, misma paleta, misma retícula de plano técnico, mismas cifras y fuentes).

Stack: **Bootstrap 5.3.3** (vendorizado, sin build) + CSS propio + un archivo JS sin dependencias.

---

## Estructura

```
priorizai-landing/
├── index.html                  Página completa (una sola)
└── assets/
    ├── css/priorizai.css       Sistema visual: tokens, componentes, animaciones
    ├── js/priorizai.js         Navbar, revelado al scroll, contadores, formulario
    ├── vendor/                 Bootstrap 5.3.3 (CSS + bundle JS con Popper)
    └── img/
        ├── logo-priorizai.png        Lockup a color, fondo transparente
        ├── logo-priorizai-white.png  Lockup en blanco (fondos oscuros)
        ├── logo-priorizai-mark.png   Solo el isotipo (favicon)
        ├── app-dashboard.png         Captura: dashboard de interconsultas
        └── app-detalle.png           Captura: detalle de interconsulta
```

Los assets se extrajeron directamente del PDF del deck, así que son los mismos
originales (el logo con canal alfa recuperado desde el *soft mask* del PDF).

## Cómo verla

Es HTML estático, pero conviene servirla por HTTP para que las rutas relativas
funcionen igual que en producción:

```bash
cd priorizai-landing
python3 -m http.server 8731
# http://127.0.0.1:8731
```

Para publicarla basta subir la carpeta completa a cualquier hosting estático
(Netlify, Vercel, GitHub Pages, S3, un `/var/www` cualquiera).

---

## Sistema visual

Todo vive en `:root` dentro de `assets/css/priorizai.css`.

| Token | Valor | Uso |
|---|---|---|
| `--pz-green` | `#09BC8A` | Acento principal, prioridad/acción, sombras duras |
| `--pz-purple` | `#744FC6` | Bloques de énfasis, manifiesto, consecuencias |
| `--pz-blue` | `#4F86C6` | Apoyo, hitos de roadmap |
| `--pz-blue-deep` | `#003D96` | Ancla institucional, etiquetas, enlaces |
| `--pz-ink` | `#0A1A2F` | Texto principal (no negro puro) |
| `--pz-line` / `--pz-line-2` | `#DCE4F0` / `#C3D2E7` | Retícula de plano y bordes |
| `--pz-night` | `#061225` | Sección de producto y footer |

Los cuatro colores de marca salieron del propio PDF (objetos vectoriales del deck),
no de una aproximación a ojo.

**Tipografías** (Google Fonts):

- **Archivo** (variable, eje `wdth`) — titulares pesados y comprimidos.
- **Instrument Sans** — texto corrido.
- **IBM Plex Mono** — etiquetas, cifras, metadatos: es lo que le da el aire de
  ficha técnica y evita el look de plantilla SaaS.
- **Newsreader** *itálica* — solo la cita del manifiesto.

**Recursos de composición**: retícula de plano en dos frecuencias (28 px y 140 px),
marcas de corte en las esquinas (`.pz-crop`), sombras duras desplazadas en vez de
difusas, numeración de sección en el margen (`01 / DIAGNÓSTICO`) y bandas a sangre
en morado/nocturno para romper el ritmo.

## Componentes de Bootstrap usados

`navbar` + `collapse` + `scrollspy` · `container/row/col` · `nav-pills` + `tab-pane`
(las dos pantallas del producto) · `accordion` (preguntas) · `progress` (comparación
Chile/OCDE) · `form-control`, `form-select`, `form-check` + validación
(`needs-validation`, `was-validated`) · utilidades de espaciado y flex.

## Animación

- Revelado al entrar en pantalla vía `IntersectionObserver` (`.pz-reveal`, con
  `--d` para escalonar).
- El panel del héroe reordena las interconsultas en bucle: la de prioridad **Alta**
  sube al primer lugar y las demás bajan una posición. El recorrido depende de la
  altura real de cada fila (un diagnóstico largo ocupa dos líneas en anchos
  angostos), así que `priorizai.js` lo mide en cada vuelta.

  Las cuatro filas se animan con la **Web Animations API**, con el mismo
  `startTime` asignado a mano y la misma duración, para que sea un solo gesto.
  Se llegó ahí descartando dos enfoques: `@keyframes` con `var()` (el soporte de
  custom properties dentro de keyframes es irregular y en algunos navegadores el
  desplazamiento hacia abajo no se aplicaba) y transiciones CSS (funcionan, pero
  el navegador decide cuándo arranca cada una y se desincronizaban). Queda una
  transición CSS como respaldo para navegadores sin `element.animate`.

  El reordenamiento es el **único** movimiento del panel. Hubo una línea de
  barrido verde y se eliminó: recorría el panel entero hacia abajo mientras la
  fila subía 240 px hacia arriba, así que competía con el gesto principal en vez
  de acompañarlo. La sensación de "en vivo" la sostienen el punto verde y la
  etiqueta del encabezado. El bucle se detiene cuando el panel sale de pantalla.
- Contadores del riel de cifras con red de seguridad: si `requestAnimationFrame`
  se detiene, a los 1,6 s se fuerza el valor real del HTML, así una cifra citada
  nunca queda a medias.
- Todo respeta `prefers-reduced-motion: reduce`.

---

## Qué falta conectar

1. **Correo de contacto.** Está como marcador de posición
   `contacto@priorizai.cl` en tres lugares: `index.html` (sección contacto y
   footer) y `assets/js/priorizai.js`. Reemplázalo por el real.
2. **Formulario.** Hoy valida en el cliente y arma un `mailto:` con los datos.
   Para un envío real, sustituye ese bloque de `priorizai.js` por un `fetch`
   al endpoint que corresponda (Formspree, una función serverless, tu backend).
3. **Analítica y OG image.** `og:image` apunta a la captura del dashboard;
   si quieres una imagen social propia, reemplázala por una de 1200×630.

## Contenido: de dónde sale cada cifra

Todas las cifras y fuentes son las del deck, sin agregar nada:

- 8 meses de espera (no GES) y 86,7 % en FONASA — Visor Ciudadano de Tiempos de Espera.
- 3,3/3,9 médicos y 1,9/4,2 camas cada 1.000 hab.; 3.749/5.967 USD per cápita —
  OCDE, *Panorama de la salud 2025: Chile*.
- 37.000 especialistas, <50 % en el sistema público — CONACEM, 07-03-2024.
- 15 minutos por interconsulta y 1 millón de interconsultas digitales — HL7 Chile.

No se inventaron métricas de precisión del modelo: los porcentajes que aparecen en
el panel del héroe son los mismos de las capturas del deck y están rotulados como
datos ilustrativos. La página incluye, además, el descargo de que PriorizAI es una
herramienta de apoyo a la decisión clínica y no reemplaza el criterio del
profesional tratante.
