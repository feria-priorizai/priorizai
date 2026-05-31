## Requisitos

- Git
- Docker Desktop

## Ejecutar con Docker

Después de clonar el repositorio, crear el archivo local `.env` copiando la
plantilla incluida:

```bash
cp .env.example .env
```

Levantar la aplicación:

```bash
docker compose up --build -d
```

Esto inicia frontend, backend y PostgreSQL. Los cambios en `frontend/` y
`backend/` se actualizan automáticamente mientras los contenedores están
levantados.

| Servicio | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

Detener la aplicación:

```bash
docker compose down
```

Para eliminar también los datos locales de PostgreSQL:

```bash
docker compose down -v
```

## Validaciones

Con los contenedores levantados, validar el backend:

```bash
docker compose exec backend ruff check .
docker compose exec backend black --check .
docker compose exec backend mypy .
docker compose exec backend pytest
```

Si falla Black, aplicar el formato con:

```bash
docker compose exec backend black .
```

Validar el frontend:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm run build
```

## Jenkins

Jenkins se ejecuta por separado. `docker compose up` no lo inicia.

Levantar Jenkins:

```bash
docker compose -f docker-compose.jenkins.yml up --build -d
```

Abrir http://localhost:8080 y obtener la contraseña inicial:

```bash
docker exec priorizai_jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Detener Jenkins:

```bash
docker compose -f docker-compose.jenkins.yml down
```
