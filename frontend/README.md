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
| `API_URL` | `http://localhost:8000` | Backend al que el servidor de Next reenvía `/api/*` y `/upload-csv` |

El navegador solo habla con el servidor de Next, que hace de proxy hacia el
backend (`next.config.ts`). Por eso los servicios usan rutas relativas y la
cookie de sesión es del mismo origen que la página. `API_URL` se lee al
arrancar el servidor (`npm run dev` o `npm run start`), no desde el navegador.

## Comandos

```bash
npm run dev            # servidor de desarrollo
npm run build          # build de producción
npm run lint           # eslint
npm test               # pruebas unitarias y de componentes
npm run test:coverage  # pruebas con reporte de cobertura
```

`Dockerfile` es la imagen de desarrollo (`next dev`, la que usa
`docker compose up`); `Dockerfile.prod` compila la aplicación (`next build` y
`next start`) y es la que usa el ambiente QA.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `app/` | Rutas del App Router (`login`, `dashboard`, `interconsultas`, `interconsultas/[id]`, `configuracion`, `usuarios`, `cuenta`) y el sistema de diseño en `globals.css` |
| `components/auth/` | Cambio de contraseña, incluida la pantalla obligatoria del primer ingreso |
| `components/layout/` | Contenedor de la aplicación, barra lateral y encabezado |
| `components/interconsultas/` | Lista de espera en tarjetas o tabla, detalle, panel de decisión, navegación entre interconsultas, resumen clínico, entidades, explicación de la sugerencia y resumen de cada carga de archivo |
| `components/configuracion/` | Matriz de campos de importación y exportación |
| `components/dashboard/`, `components/ui/` | Indicadores del resumen y piezas compartidas |
| `services/` | Llamadas a la API (`api.ts` centraliza el fetch y el manejo del 401), sesión y mapeo de las respuestas al modelo del front |
| `hooks/`, `context/` | Estado del listado y de la vista preferida, de la sesión (`SesionContext`) y de la configuración de campos |
| `types/` | Tipos compartidos del dominio |
| `utils/` | Formato de fechas, orden de la lista de espera y exportación a los distintos formatos |
| `data/` | Datos fijos de la instalación, como el nombre del establecimiento |
| `tests/` | Pruebas unitarias y de componentes (`tests/unit`) y su configuración |

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

Las pruebas usan Vitest con jsdom y React Testing Library, y viven en
`tests/unit`. Cubren las utilidades (exportación a CSV, JSON y XLSX, incluida la
neutralización de fórmulas; orden de la lista; fechas), los servicios de la API
(con `fetch` simulado) y los formularios de cambio de prioridad y de contraseña.

```bash
npm test
npm run test:coverage
```

La cobertura se mide sobre `utils/`, `services/`, `components/ui/` y esos dos
formularios, y la corrida falla si cualquiera de sus medidas (líneas, ramas,
funciones o sentencias) baja del 90 %. El reporte HTML queda en `coverage/`.
Las páginas y los componentes que dependen del router de Next no se prueban
aquí: los recorren las pruebas E2E del ambiente QA (`../qa/e2e`), que los
encuentran por sus atributos `data-testid`. Al cambiar uno de esos atributos hay
que actualizar también las pruebas E2E.

La CI ejecuta `npm run lint`, `npm run test:coverage` y `npm run build` en cada
pull request.
