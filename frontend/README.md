# Frontend — PriorizAI

Interfaz web en Next.js (App Router) para revisar y priorizar interconsultas.
Consume la API de FastAPI que vive en [`../backend`](../backend).

## Correr el proyecto

Lo normal es levantar todo el stack desde la raiz del repo, que ademas arranca
Postgres y el backend:

```bash
docker compose up
```

La UI queda en http://localhost:3000 y la API en http://localhost:8000.

Para trabajar solo en el frontend, con el backend ya corriendo aparte:

```bash
npm install
npm run dev
```

## Variables de entorno

| Variable | Default | Para que sirve |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base de la API que consumen los servicios de `services/` |

## Comandos

```bash
npm run dev     # servidor de desarrollo
npm run build   # build de produccion
npm run lint    # eslint
```

No hay tests todavia: falta instalar un runner y cubrir la logica de
`services/interconsultas.ts` (ver `docs/revision-tecnica.md`, punto 2.g).

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `app/` | Rutas del App Router (`dashboard`, `interconsultas`, `configuracion`) |
| `components/` | Componentes de UI, agrupados por seccion |
| `services/` | Llamadas a la API y mapeo de las respuestas al modelo del front |
| `types/` | Tipos compartidos del dominio |
| `hooks/`, `context/` | Estado de configuracion de campos import/export |
| `utils/` | Utilidades, entre ellas la exportacion a varios formatos |
| `data/` | Datos simulados que todavia no tienen backend |
