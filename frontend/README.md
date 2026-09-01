# Frontend — PriorizAI

Interfaz web en Next.js (App Router) para revisar y priorizar interconsultas.
Consume la API de FastAPI que vive en [`../backend`](../backend).

Next.js 16, React 19, TypeScript, Bootstrap 5 y Tailwind CSS 4.

## Ejecutar el proyecto

Lo habitual es levantar todo el stack desde la raíz del repositorio, que además
arranca PostgreSQL y el backend:

```bash
docker compose up
```

La interfaz queda en http://localhost:3000 y la API en http://localhost:8000.

Para trabajar solo en el frontend, con el backend ya corriendo aparte:

```bash
npm install
npm run dev
```

## Variables de entorno

| Variable | Valor por defecto | Descripción |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base de la API que consumen los servicios de `services/` |

El backend autoriza orígenes mediante `CORS_ORIGINS`, que por defecto solo
incluye `http://localhost:3000`. Al abrir la aplicación por `127.0.0.1:3000` las
peticiones se rechazan por CORS aunque el servidor responda.

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de producción
npm run lint    # eslint
```

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `app/` | Rutas del App Router (`dashboard`, `interconsultas`, `interconsultas/[id]`, `configuracion`) y el sistema de diseño en `globals.css` |
| `components/layout/` | Contenedor de la aplicación, barra lateral y encabezado |
| `components/interconsultas/` | Cola agrupada, detalle, panel de decisión, resumen clínico y entidades |
| `components/configuracion/` | Matriz de campos de importación y exportación, y aviso de filas rechazadas |
| `components/dashboard/`, `components/ui/` | Indicadores del resumen y piezas compartidas |
| `services/` | Llamadas a la API y mapeo de las respuestas al modelo del front |
| `hooks/`, `context/` | Estado del listado y de la configuración de campos |
| `types/` | Tipos compartidos del dominio |
| `utils/` | Formato de fechas y exportación a los distintos formatos |
| `data/` | Sesión del usuario, provisional hasta que exista autenticación |

## Sistema de diseño

Vive completo en `app/globals.css`, bajo el prefijo `pz-`. Comparte la paleta de
marca con la landing (`landing/assets/css/priorizai.css`).

- Las tarjetas blancas se apoyan sobre un lienzo azul; el blanco puro queda
  reservado para las superficies de contenido.
- La escala tipográfica está en variables `--fs-*`. Los componentes las usan en
  lugar de fijar tamaños sueltos.
- El color codifica una sola cosa. En la lista de espera, la prioridad clínica:
  cada nivel es una zona con su propio fondo. En los controles, el tipo de
  acción: verde confirma, azul navega, morado ejecuta el modelo, rojo es
  urgente, claro es neutro.

### Bootstrap y Tailwind en el mismo proyecto

Conviven mediante capas de cascada, y el orden importa. `globals.css` declara
`@layer bootstrap` antes de importar Tailwind, de modo que las utilidades de
Tailwind ganan sobre el reboot de Bootstrap, y las reglas `pz-*`, que no están en
ninguna capa, ganan sobre ambas.

La consecuencia práctica es que el preflight de Tailwind anula propiedades que
Bootstrap da por sentadas. Ya ocurrió con el grosor de los bordes de los campos
de formulario y con las canaletas de la grilla; ambas se reponen explícitamente
en `globals.css`. Al usar un componente de Bootstrap que no esté ya en uso,
conviene verificar que su espaciado y sus bordes sobrevivan al preflight.

## Logo del establecimiento

El encabezado carga el logo desde `public/img/hospital-san-juan-de-dios.png`. La
imagen se comprueba en memoria antes de montarse: si el archivo no existe, se
muestra un emblema junto al nombre del centro en lugar de una imagen rota.

## Pruebas

No hay pruebas automatizadas. La CI solo ejecuta `npm run lint` y
`npm run build`. La lógica sin cobertura, en orden de riesgo, está detallada en
[`../docs/revision-tecnica-completa.md`](../docs/revision-tecnica-completa.md),
sección T2.
