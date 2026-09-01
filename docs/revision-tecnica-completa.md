# Revisión técnica completa

**Fecha:** 2026-08-31 · **Rama base:** `develop` (`792c592`) · **Revisado desde:** `hotfix/resumen-clinico-jsx` (`1b086be`)

> **Estado al 2026-08-31.** Corregidos en `fix/bugs-revision-tecnica`: **B1**, **B2**,
> **B3**, **B4** y **A4** (mitigado), cada uno con test de regresión. **T1** y **T3**
> se cierran al mergear `feat/testing-fixes`, ya rebasada sobre `develop`. El bug de
> la página de detalle que motivó esta revisión va en `hotfix/resumen-clinico-jsx`.
> El resto sigue abierto.

Revisión de todo el repositorio: backend, frontend, tests, CI y empaquetado.
Cada hallazgo está anotado con `archivo:línea` y describe el estado **en el
momento de la revisión**; lo corregido después se indica en la nota de arriba.

---

## 0. Cómo se hizo

Con el stack levantado (`docker compose up -d`, modelos montados en `models/`).
Los hallazgos marcados **[verificado]** se reprodujeron ejecutando el código real
dentro del contenedor, no por lectura. Los demás salen de leer el código.

No se revisó: `landing/` (sitio estático, sin lógica de negocio) ni los pesos de
los modelos.

---

## 1. Resumen

| # | Hallazgo | Severidad | Área |
| --- | --- | --- | --- |
| [B1](#b1-la-edad-se-corrompe-al-cargar-el-csv) | La EDAD se corrompe al cargar el CSV | **Crítica** | Backend |
| [B2](#b2-una-bandera-roja-retirada-deja-la-interconsulta-congelada-en-alta) | Bandera roja retirada deja la IC congelada en "alta" | **Alta** | Backend |
| [B3](#b3-la-fecha-de-emisión-se-muestra-un-día-antes) | La fecha de emisión se muestra un día antes | **Alta** | Front/Back |
| [B4](#b4-la-aplicación-solo-ve-las-primeras-100-interconsultas) | La app solo ve las primeras 100 interconsultas | **Alta** | Frontend |
| [B5](#b5-el-xlsx-que-se-descarga-no-es-un-xlsx) | El XLSX que se descarga no es un XLSX | **Media** | Frontend |
| [B6](#b6-una-fila-con-columnas-de-más-tumba-el-archivo-completo) | Una fila mal formada tumba el archivo completo | **Media** | Backend |
| [B7](#b7-la-pestaña-de-configuración-de-import-no-hace-nada) | La configuración de import no hace nada | **Media** | Front/Back |
| [B8](#b8-errores-del-backend-que-llegan-como-object-object) | Errores que llegan como `[object Object]` | **Media** | Frontend |
| [B9](#b9-la-carga-de-un-csv-corre-dos-modelos-de-forma-síncrona) | La carga corre dos modelos de forma síncrona | **Media** | Backend |
| [B10](#b10-puedeeditar-dice-una-cosa-y-hace-otra) | `puedeEditar` dice una cosa y hace otra | **Media** | Frontend |
| [S1](#s1-no-hay-autenticación-ni-autorización) | No hay autenticación ni autorización | **Alta** | Seguridad |
| [S2](#s2-inyección-de-fórmulas-en-el-csv-exportado) | Inyección de fórmulas en el CSV exportado | **Media** | Seguridad |
| [S3](#s3-contraseña-por-defecto-en-el-código) | Contraseña por defecto en el código | **Media** | Seguridad |
| [T1](#t1-la-suite-depende-del-orden-alfabético-de-los-archivos) | La suite depende del orden alfabético | **Alta** | Testing |
| [T2](#t2-el-frontend-no-tiene-un-solo-test) | El frontend no tiene un solo test | **Media** | Testing |
| [T3](#t3-la-ci-no-mide-cobertura) | La CI no mide cobertura | **Media** | Testing |
| [A1](#a1-importar-appmain-abre-conexión-a-la-base) | Importar `app.main` abre conexión a la base | **Alta** | Arquitectura |
| [A2](#a2-migraciones-a-mano-con-alter-table-al-importar) | Migraciones a mano con ALTER TABLE | **Media** | Arquitectura |
| [A3](#a3-la-imagen-de-frontend-es-el-servidor-de-desarrollo) | La imagen de frontend es el server de desarrollo | **Media** | Empaquetado |
| [A4](#a4-el-orden-de-las-clases-del-modelo-no-está-verificado) | El orden de clases del modelo no está verificado | **Alta** | Modelo |

Más [duplicación y deuda](#5-duplicación-y-deuda) al final.

---

## 2. Bugs confirmados

### B1: La EDAD se corrompe al cargar el CSV

**Severidad: crítica.** · **[verificado]**

`backend/app/main.py:228-231` limpia la edad borrando puntos y comas antes de
convertirla a entero:

```python
raw_edad_clean = raw_edad.replace(".", "").replace(",", "").replace(" ", "")
datos["EDAD"] = int(raw_edad_clean)
```

La intención es tolerar separadores de miles, pero en un CSV **todas las celdas
son texto**, así que un decimal se convierte en un entero distinto:

```
$ docker compose exec backend python -c "..."
EDAD guardada: 530        # el CSV decía 53.0
EDAD 4,5 -> 45            # el CSV decía 4,5
```

Un `53.0` exportado por Excel, R o pandas —lo más común al volcar una planilla—
queda guardado como **530 años**. No hay validación de rango, así que entra a la
base y de ahí al texto que ve el modelo (`priorizador.construir_texto:58` mete la
edad en el prompt), a la tabla y al export.

En XLSX no pasa: openpyxl entrega un `float` y `_normalizar_valor:464-465` lo
convierte a `int` antes. **Solo se corrompe la ruta CSV**, que es la principal.

### B2: Una bandera roja retirada deja la interconsulta congelada en "alta"

**Severidad: alta.** · **[verificado]**

`banderas_rojas.py:245-247` fuerza la prioridad cuando detecta un término de
alarma, pero **no tiene rama contraria**:

```python
if resultado.forzar_prioridad_alta:
    interconsulta.prioridad_actual = "alta"
    interconsulta.prioridad_forzada_por_regla = True
```

Al reevaluar (`POST /api/interconsultas/reevaluar-banderas`) una interconsulta
cuyo término se quitó del catálogo:

```
bandera_roja               -> False   # se limpia bien
prioridad_forzada_por_regla -> True   # queda pegado
prioridad_actual            -> alta   # queda pegado
```

El daño no es solo la prioridad que no vuelve atrás. `prioridad_forzada_por_regla`
es el guard de `priorizador.aplicar_resultado:51-52`:

```python
if not interconsulta.prioridad_forzada_por_regla:
    interconsulta.prioridad_actual = resultado.prioridad
```

Con la bandera pegada en `True`, **esa interconsulta nunca más recibe la prioridad
del modelo**, por más veces que se la priorice. Queda en "alta" para siempre y la
UI sigue mostrando "regla clínica" (`ColaInterconsultas.tsx:211`) para una regla
que ya no aplica. El endpoint de reevaluación existe justo para corregir el
catálogo (RF7/D6) y es el que no puede deshacer su propio efecto.

### B3: La fecha de emisión se muestra un día antes

**Severidad: alta.** · **[verificado]**

`main.py:451` interpreta la fecha del archivo como medianoche **UTC**:

```python
return datetime.strptime(texto, formato).replace(tzinfo=UTC)
```

`fechas.ts:28-30` la vuelve a leer como UTC y la formatea en horario de Chile
(UTC−4/−3), así que retrocede al día anterior:

```
$ docker compose exec frontend node -e "..."
CSV dice 01/09/2026 -> la UI muestra: 31-08-2026, 08:00 p. m.
```

Afecta a los dos lugares donde se muestra: `ColaInterconsultas.tsx:210` y
`DetalleInterconsulta.tsx:60-61`. Además se le pone hora ("08:00 p. m.") a un dato
que en el archivo es solo fecha.

El orden no se altera (todas se desplazan igual), pero HU3-c1 ordena por este
campo y el médico ve una fecha de derivación equivocada. Es un dato clínico:
"hace cuántos días espera este paciente".

### B4: La aplicación solo ve las primeras 100 interconsultas

**Severidad: alta.**

`services/interconsultas.ts:74` pide el listado con un límite fijo:

```ts
const respuesta = await fetch(`${API_BASE}/api/interconsultas?limit=100`, ...)
```

No hay paginación en ninguna vista. Todo lo que se calcula encima —el dashboard,
los contadores de `useInterconsultas.ts:170-179`, los filtros, el agrupamiento por
prioridad, la selección de "descargar todas las revisadas"— trabaja sobre esas 100
y **no avisa que hay más**. El texto "Mostrando N de M" (`app/interconsultas/page.tsx:120`)
compara la lista filtrada contra las mismas 100, así que confirma un total falso.

Con la carga esperada (un archivo del sistema hospitalario) la lista de espera
queda truncada en silencio, y truncada justo por el orden que define el backend:
se pierden las de menor prioridad y las más nuevas.

### B5: El XLSX que se descarga no es un XLSX

**Severidad: media.**

`exportUtils.ts:165-181` genera un CSV, le pone extensión `.xlsx` y el MIME type de
Excel:

```ts
const contenido = lineas.join("\n");
descargarArchivo(contenido, `${nombreBase}-${interconsulta.id}.xlsx`,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
```

Lo mismo en `descargarXLSXMultiple:257-280`. El comentario lo reconoce ("MVP"),
pero el usuario elige "XLSX" en un desplegable y recibe un archivo que Excel abre
con advertencia de formato corrupto, o directamente rechaza. Es una de las tres
opciones de descarga de HDU-13.

Dos problemas más en el mismo CSV, que sí afectan al formato "CSV" legítimo:

- Separador de líneas `\n` en vez de `\r\n` y **sin BOM UTF-8** (`:157`). Excel en
  español abre el archivo con las tildes rotas.
- Sin escape de fórmulas → ver [S2](#s2-inyección-de-fórmulas-en-el-csv-exportado).

### B6: Una fila con columnas de más tumba el archivo completo

**Severidad: media.**

`main.py:140-148` corta la carga entera con un 400 cuando una fila tiene distinta
cantidad de columnas que el encabezado. Lo mismo en XLSX (`:174-178`).

Esto contradice el diseño del resto de la función: `_validar_filas:217-224` junta
las filas malas en `rejected[]` y sigue, y el frontend tiene un modal para
mostrarlas (`ModalErroresCarga.tsx`). Una coma de más en una sola fila de un
archivo de miles hace que no entre **ninguna**, y el mensaje de error es un
`Sample:` con las primeras seis celdas.

### B7: La pestaña de configuración de import no hace nada

**Severidad: media.**

`types/campos.ts:74` define qué campos son obligatorios al importar, y
`/configuracion` deja editarlos. Pero `subirCsvInterconsultas`
(`services/interconsultas.ts:257-263`) manda **solo el archivo**:

```ts
const formData = new FormData();
formData.append("file", archivo);
```

El backend valida contra sus propias listas hardcodeadas (`main.py:23-52`), y ni
siquiera se entera de la configuración. El comentario de `main.py:41-43` afirma que
las dos listas "deben coincidir", pero nada lo garantiza ni lo verifica.

Consecuencia concreta: desmarcar "Motivo Interconsulta" como obligatorio no
cambia nada — el archivo sigue rebotando con 400. La pestaña es decorativa para
import. (Para export sí funciona: ahí la configuración se aplica en el cliente.)

### B8: Errores del backend que llegan como `[object Object]`

**Severidad: media.**

El archivo tiene un helper correcto, `obtenerMensajeError:396-406`, que sabe que
FastAPI a veces manda `detail` como objeto. Pero tres funciones no lo usan:

- `modificarPrioridad:218`
- `modificarEstadoInterconsulta:239`
- `subirCsvInterconsultas:267`

```ts
throw new Error(error?.detail || "No se pudo modificar la prioridad");
```

Y el backend sí devuelve objetos: `_validar_interconsultas_para_prediccion:300-309`
(422) y `_buscar_interconsultas:263-267` (404) mandan diccionarios. Cuando eso
pasa, el médico ve `[object Object]` en pantalla en vez del motivo.

### B9: La carga de un CSV corre dos modelos de forma síncrona

**Severidad: media.**

`upload_csv` (`main.py:79`) hace, dentro del request HTTP: insertar todas las
filas, correr el **NER** sobre cuatro campos de cada una (`main.py:365`) y después
el **priorizador** sobre todas (`main.py:368`).

Ninguna de las dos cosas es rápida: el NER segmenta cada campo y llama al pipeline
por fragmento (`ner.py:173-174`), y el priorizador tokeniza y corre inferencia en
CPU. Para un archivo de cientos de filas la petición se va a minutos, sin barra de
progreso, sin timeout propio y sin forma de reanudar. Cualquier proxy con timeout
por defecto corta la conexión con la transacción a medias.

No hay cola de trabajo ni endpoint de estado; el diseño asume que la carga es
instantánea.

### B10: `puedeEditar` dice una cosa y hace otra

**Severidad: media.**

`ConfiguracionContext.tsx:117-119`:

```ts
// Permisos: ambos roles pueden ver, solo admin puede editar
const puedeVer = usuario?.rol === "admin" || usuario?.rol === "medico";
const puedeEditar = usuario?.rol === "admin" || usuario?.rol === "medico";
```

Las dos expresiones son idénticas y el comentario describe otra cosa. Hoy no rompe
nada porque no hay login, pero es la clase de línea que se lee por encima al
implementar autenticación y se da por buena.

Relacionado: hay **dos tipos `Usuario` distintos y no compatibles**.
`types/usuario.ts` (rol `"medico_especialista"`, con especialidad y centro) y
`types/campos.ts:10-14` (rol `"medico" | "admin"`). El único `setUsuario(...)` de la
app (`app/interconsultas/[id]/page.tsx:42`) escribe el segundo a mano. Si alguien
pasara `usuarioActual` de `data/sesion.ts`, `puedeEditar` daría `false` y la
configuración se volvería de solo lectura sin explicación.

---

## 3. Seguridad

### S1: No hay autenticación ni autorización

**Severidad: alta.**

No existe login. El médico responsable que queda en el historial de
modificaciones sale de una constante: `data/sesion.ts:10-16`, "Dra. María
González". El archivo lo declara como provisional, y está bien documentado, pero
conviene ser explícito sobre lo que implica hoy:

- Todos los endpoints del backend son públicos. Cualquiera con acceso de red al
  puerto 8000 puede listar interconsultas con texto clínico, cambiar prioridades
  (`PATCH /{id}/prioridad`), marcar como revisadas o disparar el modelo.
- El **historial de auditoría es ficticio**: todas las modificaciones quedan
  firmadas con el mismo nombre inventado. Para una aplicación cuyo valor está en
  registrar quién cambió una prioridad clínica y por qué (HdU02), el registro no
  sirve como evidencia.

Es una decisión consciente del MVP, no un descuido. Pero mientras exista, el
sistema no puede tocar datos de pacientes reales.

### S2: Inyección de fórmulas en el CSV exportado

**Severidad: media.**

`exportUtils.ts:150` escapa comillas, y nada más:

```ts
const escapar = (val: string) => `"${val.replace(/"/g, '""')}"`;
```

Un valor que empiece con `=`, `+`, `-` o `@` es interpretado como fórmula por
Excel y LibreOffice al abrir el archivo. El texto exportado viene de campos
clínicos que entraron por un CSV externo, o sea de una fuente que la aplicación no
controla. Es el vector clásico de CSV injection: basta que el archivo de origen
traiga `=HYPERLINK(...)` en un campo de texto libre.

### S3: Contraseña por defecto en el código

**Severidad: media.**

`core/config.py:13-17` define credenciales de base de datos con valores por
defecto reales, no vacíos:

```python
database_password: str = os.getenv("DATABASE_PASSWORD", "priorizai_password")
```

Si la variable no está seteada, la app arranca igual contra esas credenciales en
vez de fallar. En un despliegue con un `.env` incompleto eso pasa desapercibido.
Lo mismo aplica a `database_user` y `database_name`.

---

## 4. Testing y CI

### T1: La suite depende del orden alfabético de los archivos

**Severidad: alta.** · **[verificado]**

`test_priorizacion.py:56-57` registra `app.dependency_overrides` a nivel de módulo
y nunca los limpia; `test_upload_csv.py:92` los borra enteros en su
`setup_function`. Hoy pasa de casualidad, porque `test_priorizacion` va antes
alfabéticamente:

```
$ pytest -q
58 passed in 6.03s

$ pytest -q tests/test_upload_csv.py tests/test_priorizacion.py
11 failed, 10 passed in 3.44s
```

Se rompe con `pytest-randomly`, con un `-k`, con `-p no:cacheprovider`, o
renombrando un archivo. Es el mismo hallazgo que la revisión anterior marcó como
2.a: **la corrección existe en la rama `feat/testing-fixes` (`tests/conftest.py`)
pero nunca se mergeó a `develop`.**

### T2: El frontend no tiene un solo test

**Severidad: media.**

`frontend/package.json` no tiene script `test` ni framework: ni vitest, ni jest, ni
playwright. La CI corre `npm run lint` y `npm run build`, nada más.

Esto ya costó caro. El bug que arregla el hotfix `1b086be` —la página de detalle
rota por el merge del PR #28— habría salido con cualquier smoke test de render. En
su lugar llegó a `develop` y se descubrió usando la aplicación a mano. Los tres
componentes indefinidos que quedaron en esa página los detectó `npm run lint`,
que la CI **sí** corre: el pipeline estaba en rojo o nadie lo miró.

Lógica pura sin cobertura, en orden de riesgo:

- `services/interconsultas.ts:286-363` — `mapearInterconsulta`, con la regla de
  HU2-c5 (sin prioridad **no** se cae a "baja"). Es una regla de seguridad clínica.
- `utils/exportUtils.ts` — 297 líneas, cuatro variantes de serialización.
- `hooks/useInterconsultas.ts:130-157` — el filtrado, que ya tuvo el bug de las
  "sin prioridad" colándose en el filtro Baja (arreglado en `2c1201a`).
- `context/ConfiguracionContext.tsx:36-68` — la lectura de localStorage, que
  descarta la configuración entera ante una sola clave desconocida.

### T3: La CI no mide cobertura

**Severidad: media.**

`.github/workflows/ci.yml` y `Jenkinsfile` corren `pytest` pelado. No hay
`pytest-cov` en `backend/requirements.txt`, no hay `--cov` en el `addopts` de
`pyproject.toml:26`, no hay umbral y no se publica reporte. Si la cobertura baja,
nadie se entera.

Igual que T1, esto **ya está resuelto en `feat/testing-fixes`** y no se mergeó.

Aparte: `ci.yml:14-24` levanta un servicio Postgres completo del que ningún test
depende (todos usan SQLite en memoria o dobles). Se levanta solo para que el
`import` de `app.main` no explote — ver [A1](#a1-importar-appmain-abre-conexión-a-la-base).

---

## 5. Arquitectura y empaquetado

### A1: Importar `app.main` abre conexión a la base

**Severidad: alta.**

Tres cosas ocurren al importar el módulo, no al arrancar la app:

- `core/database.py:11` crea el engine.
- `main.py:56` — `Base.metadata.create_all(bind=engine)`.
- `main.py:469` — `_asegurar_columnas_interconsultas()`, que hace un `inspect()`.

Las dos últimas **abren conexión**. Consecuencias: los tests no corren sin
Postgres, la CI levanta un servicio entero solo para eso, y no se puede importar
la app para inspeccionarla (generar el OpenAPI, por ejemplo) sin una base viva.

Además `config.py:35-43` arma la URL a mano desde piezas de Postgres y no acepta un
`DATABASE_URL` completo, así que no hay forma de apuntar la app a SQLite por
variable de entorno.

Lo natural es mover ambas llamadas a un `lifespan` de FastAPI.

### A2: Migraciones a mano con ALTER TABLE al importar

**Severidad: media.**

`main.py:320-347` es un mini-Alembic casero: un diccionario de ocho columnas y un
bucle de `ALTER TABLE ... ADD COLUMN`. Ya se agregaron así `estado`,
`motivo_sin_prioridad`, `fecha_emision`, `bandera_roja`, `terminos_bandera_roja`,
`prioridad_forzada_por_regla`, `entidades` y `entidades_error`.

Solo sabe agregar columnas: no renombra, no cambia tipos, no borra, no tiene
historial ni rollback, y no hay forma de saber en qué versión está una base. El
día que haya que modificar una columna existente, hay que hacerlo a mano en
producción.

### A3: La imagen de frontend es el servidor de desarrollo

**Severidad: media.**

`frontend/Dockerfile:11`:

```dockerfile
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--webpack"]
```

La única imagen que existe corre `next dev`: sin build optimizado, con HMR, y con
las dependencias de desarrollo dentro (`npm install`, no `npm ci`, aunque
`package-lock.json` está versionado). No hay `Dockerfile` de producción ni
multi-stage, y `next build` solo se ejecuta en la CI para verificar que compila.

En el backend, `backend/Dockerfile` instala torch y transformers (~2-3 GB) en la
misma imagen que se usa para correr ruff, black, mypy y los tests. Cada corrida de
CI paga esa descarga para ejecutar 58 tests que nunca tocan torch.

### A4: El orden de las clases del modelo no está verificado

**Severidad: alta.**

`priorizador.py:108-128` resuelve los nombres de las clases desde el `config.json`
del modelo y, si son genéricos, cae a una constante:

```python
FALLBACK_ID2LABEL = {0: "baja", 1: "media", 2: "alta"}
```

El modelo que hay hoy en `models/priorizacion/config.json` trae exactamente eso:
`"id2label": {"0": "LABEL_0", "1": "LABEL_1", "2": "LABEL_2"}`. O sea, **siempre se
usa el fallback**, que es una suposición escrita a mano.

Si ese orden no coincide con el `LabelEncoder` del entrenamiento, todas las
probabilidades quedan asignadas a la clase equivocada y el sistema prioriza al
revés, con confianza alta y sin ningún síntoma visible. El `README.md` lo advierte
para el script, pero el backend hace lo mismo sin verificación.

No es una hipótesis abstracta: es el punto donde un error silencioso cambia la
prioridad clínica de todos los pacientes. Debería verificarse contra el
entrenamiento y dejar constancia en un test.

Lo agrava que `PriorizadorRigoBerta` **nunca se ejecuta en los tests**: siempre
está reemplazado por un doble.

---

## 6. Duplicación y deuda

### Backend

- **`_tiene_informacion_clinica` duplicada** — `main.py:412-419` y
  `api/interconsultas.py:312-319`, idénticas. Define qué interconsulta es
  priorizable; si divergen, la ingesta y el endpoint dejan de coincidir.
  *(Ya unificada en `feat/testing-fixes`, sin mergear.)*
- **`utc_now` duplicada** — `models/interconsulta.py:81-82` y
  `models/modificacion_prioridad.py`. *(Ídem.)*
- **`scripts/predict_interconsultas.py`** (288 líneas) duplica casi entero
  `services/priorizador.py`: `PRIORITY_ORDER`, `FALLBACK_ID2LABEL`, `_normalize`,
  `resolve_label_names`, `predict`, `build_texts`. Dos copias que pueden divergir
  justo en el mapeo de clases de [A4](#a4-el-orden-de-las-clases-del-modelo-no-está-verificado).
  Además apunta a un `INPUT_PATH` hardcodeado que no existe en el repo
  (`:40`).
- **La lógica de segmentación del NER está copiada** de `models/NER/extractor.py` a
  `services/ner.py:1-7`, y el propio módulo lo documenta. La razón es válida (el
  volumen no existe en CI), pero son dos copias de la lógica que decide dónde
  cortar el texto clínico.
- **`ner_max_length` no se usa nunca.** `ConfiguracionNER.max_length` (`ner.py:49`)
  se define, se lee del entorno (`config.py:26`) y se pasa al constructor, pero el
  pipeline de `ner.py:152-158` nunca lo recibe. Configuración muerta que aparenta
  estar activa.
- **`_estado_priorizacion(0, 0)` devuelve `"completed"`** (`main.py:422-427`). Si
  todas las filas fueron rechazadas, la respuesta dice que la priorización se
  completó.
- **`inserted` y `stored` son el mismo número** (`main.py:297-298`), calculado dos
  veces desde `len(filas_json)`.
- **`GET /api/interconsultas` no tiene tope de `limit`** (`api/interconsultas.py:60`),
  a diferencia de `/priorizar-pendientes`, que sí lo acota con
  `Query(ge=1, le=500)`. Un `?limit=999999` trae la tabla entera.
- **`reevaluar-banderas` carga todas las interconsultas en memoria**
  (`api/interconsultas.py:188`) sin paginar ni acotar.

### Frontend

- `descargarCSV`, `descargarXLSX`, `descargarCSVMultiple` y `descargarXLSXMultiple`
  son cuatro bloques casi idénticos en `exportUtils.ts`.
- Importaciones sin usar que el lint ya reporta como warnings:
  `CheckboxGroup.tsx:3,39`, `useConfiguracionCampos.ts:4`, `exportUtils.ts:4-5`.
  Son 8 warnings que ensucian la salida y esconden los que sí importan.
- `useInterconsultas.ts:130` recalcula el filtrado en cada render, sin `useMemo`.
- `cambiarPrioridad` del listado (`useInterconsultas.ts:181-207`) no llama a
  `notificarActualizacion()`, pero el del detalle sí (`:291`). El dashboard no se
  entera de los cambios hechos desde el listado.

### Repositorio

- **`landing/.DS_Store` está commiteado** y `.gitignore` no tiene la regla
  `.DS_Store`. *(Corregido en `feat/testing-fixes`, sin mergear.)*
- **`docs/arquitectura.md`** son 9 líneas fechadas en mayo de 2026, sin
  actualizar. No menciona el NER, ni el frontend, ni el catálogo de banderas
  rojas.
- **`Jenkinsfile` y `.github/workflows/ci.yml` son el mismo pipeline duplicado** en
  dos sistemas. Ya divergen: el de GitHub levanta Postgres, el de Jenkins no.
- **`docker-compose.gpu.yml`** son tres líneas (`gpus: all`) que solo funcionan
  combinadas con `-f`. Está documentado en el README, pero es un archivo que no se
  explica solo.

---

## 7. Orden sugerido

1. **[B1](#b1-la-edad-se-corrompe-al-cargar-el-csv)** — la edad corrupta entra a la
   base, al modelo y al export. Es dato clínico equivocado y ya hay filas cargadas
   con el error. Arreglar el parseo y decidir qué hacer con lo cargado.
2. **[B2](#b2-una-bandera-roja-retirada-deja-la-interconsulta-congelada-en-alta)** —
   una línea (`else`), pero deja interconsultas permanentemente fuera del alcance
   del modelo.
3. **[A4](#a4-el-orden-de-las-clases-del-modelo-no-está-verificado)** — verificar el
   orden de clases contra el entrenamiento **antes** de cualquier demo. Si está
   invertido, todo lo demás da igual.
4. **Mergear `feat/testing-fixes`** — resuelve T1, T3 y buena parte de la
   duplicación del backend, ya escrito y commiteado. Necesita rebase sobre
   `develop`.
5. **[B3](#b3-la-fecha-de-emisión-se-muestra-un-día-antes)** y
   **[B4](#b4-la-aplicación-solo-ve-las-primeras-100-interconsultas)** — los dos
   bugs que el usuario ve en pantalla todos los días.
6. **[A1](#a1-importar-appmain-abre-conexión-a-la-base)** — desbloquea correr los
   tests sin Docker y simplifica la CI.
7. **[T2](#t2-el-frontend-no-tiene-un-solo-test)** — aunque sea un smoke test de
   render por página. El costo de no tenerlo ya se pagó una vez esta semana.
8. El resto, por severidad.
