# Revisión técnica · segunda pasada

**Fecha:** 2026-09-01 · **Rama base:** `develop` (`208af4d`) · **Revisado desde:** `review/revision-tecnica-2`

Segunda revisión completa, hecha sobre `develop` ya con los arreglos de la
primera. Continúa a [`revision-tecnica-completa.md`](revision-tecnica-completa.md):
acá va lo **nuevo**, más el estado de lo anterior. Cada hallazgo lleva
`archivo:línea`. **Nada de esto se corrigió.**

Esta pasada cubre lo que la primera dejó fuera —componentes del frontend,
`landing/`, el montaje de Jenkins, los catálogos YAML— y revisa el código que se
mergeó ayer, que nadie más miró.

---

## 0. Qué cambió desde la primera revisión

De los 21 hallazgos, **7 están cerrados** y verificados en CI (`develop` en verde
por primera vez desde el merge del PR #28):

| Cerrado | Cómo |
| --- | --- |
| B1 EDAD corrupta | `_parsear_edad` + rango, con tests |
| B2 bandera roja pegada | rama `elif` que libera la marca |
| B3 fecha un día antes | fecha de calendario, sin conversión de zona |
| B4 solo 100 interconsultas | `X-Total-Count` + paginación en el cliente |
| A4 orden de clases | mitigado: warning + `MODEL_LABELS` |
| T1 orden alfabético | `conftest.py` con fixtures |
| T3 sin cobertura | `pytest-cov` + umbral 82% en ambos pipelines |

**A4 sigue sin verificarse de verdad.** Está mitigado, no resuelto: hace falta el
`LabelEncoder` del entrenamiento, que no está en el repo.

Los otros 14 siguen abiertos y se listan en la [sección 4](#4-lo-que-sigue-abierto-de-la-primera-revisión).

---

## 1. Resumen de lo nuevo

| # | Hallazgo | Severidad | Área |
| --- | --- | --- | --- |
| [N1](#n1-jenkins-corre-como-root-con-el-socket-de-docker-del-host) | Jenkins corre como root con el socket de Docker del host | **Alta** | Seguridad |
| [N2](#n2-el-motivo-de-la-modificación-se-valida-distinto-en-cada-lado) | El motivo se valida distinto en cada lado | **Media** | Front/Back |
| [N3](#n3-la-referencia-a-las-decisiones-de-diseño-apunta-a-un-archivo-que-no-existe) | Las decisiones de diseño citadas no existen en el repo | **Media** | Docs |
| [N4](#n4-el-catálogo-de-alarmas-tiene-8-términos-y-nadie-clínico-lo-validó) | El catálogo de alarmas tiene 8 términos sin validar | **Media** | Producto |
| [N5](#n5-checkboxgroup-deseleccionar-todo-hace-lo-contrario) | `CheckboxGroup`: "deseleccionar todo" hace lo contrario | **Media** | Frontend |
| [N6](#n6-priorizar-con-ia-no-se-protege-del-doble-clic) | "Priorizar con IA" no se protege del doble clic | **Media** | Frontend |
| [N7](#n7-tres-componentes-que-no-usa-nadie) | Tres componentes que no usa nadie (~223 líneas) | Baja | Frontend |
| [N8](#n8-los-logos-están-duplicados-byte-a-byte) | Logos duplicados byte a byte (503 KB) | Baja | Repo |
| [N9](#n9-la-tarjeta-total-del-panel-cuenta-lo-cargado-no-lo-que-hay) | La tarjeta "Total" cuenta lo cargado, no lo que hay | Baja | Frontend |

Y la [auto-revisión](#3-revisión-del-código-que-se-mergeó-ayer) de lo de ayer: 5 hallazgos más.

---

## 2. Hallazgos nuevos

### N1: Jenkins corre como root con el socket de Docker del host

**Severidad: alta.**

`docker-compose.jenkins.yml:12` monta el socket del demonio dentro del contenedor:

```yaml
- /var/run/docker.sock:/var/run/docker.sock
```

Y `docker/jenkins/Dockerfile` termina en `USER root` (líneas 3 y 9; la segunda es
redundante), así que el proceso de Jenkins **no vuelve al usuario `jenkins`**.

La combinación es el camino conocido a root en la máquina anfitriona: cualquiera
que pueda definir o editar un pipeline puede lanzar un contenedor con el disco del
host montado. Con Jenkins publicado en `8080` y las instrucciones para obtener la
contraseña inicial en el `README.md`, el radio de exposición depende solo de quién
llegue a ese puerto.

Montar el socket es el patrón habitual para construir imágenes desde Jenkins, así
que no es un error de configuración accidental. Pero conviene que sea una decisión
consciente y anotada, y que al menos el contenedor no corra como root.

### N2: El motivo de la modificación se valida distinto en cada lado

**Severidad: media.**

`FormularioModificarPrioridad.tsx:14` exige un mínimo de 10 caracteres:

```ts
const MOTIVO_MINIMO = 10;
```

El backend, en `api/interconsultas.py:105-109`, solo rechaza el motivo vacío. Un
motivo de un carácter entra sin problema por la API.

El motivo es el único registro de **por qué** un médico cambió una prioridad
clínica: es el contenido de la auditoría de HdU02. Que la regla viva solo en el
formulario significa que cualquier otro cliente —o esta misma UI si mañana cambia
el flujo— puede llenar el historial de motivos vacíos de contenido. La regla
debería estar en el backend, y el frontend adelantarla para dar mejor feedback.

### N3: La referencia a las decisiones de diseño apunta a un archivo que no existe

**Severidad: media.**

El código cita decisiones numeradas por todos lados: **D1, D3, D4, D5, D6, D7 y
D18** aparecen en `main.py`, `api/interconsultas.py`, `services/banderas_rojas.py`,
`services/priorizador.py`, los dos YAML de datos y cuatro archivos de tests.

Los dos catálogos apuntan explícitamente a dónde vivirían:

```yaml
# ... ver docs/RF7-banderas-rojas.md, D4.
```

**Ese archivo no existe.** `docs/` tiene `arquitectura.md`, `revision-tecnica.md` y
`revision-tecnica-completa.md`, nada más.

O sea que las decisiones que el código invoca para justificar su comportamiento
—por qué la regla determinista manda sobre el modelo, por qué se persiste el id y
no el nombre del término, por qué `FECHA_EMISION` es opcional— no están escritas en
ninguna parte accesible. Quien llegue nuevo lee "ver D5" y no tiene dónde mirar.

También `frontend/README.md` referencia `docs/revision-tecnica.md`, que sí existe.

### N4: El catálogo de alarmas tiene 8 términos y nadie clínico lo validó

**Severidad: media (producto, no código).**

`backend/app/data/banderas_rojas.yml` define **8 términos**: dolor torácico,
hemorragia digestiva, sepsis, dificultad respiratoria severa y cuatro más.

El propio archivo es honesto sobre su estado:

> Semilla configurable, NO es el listado definitivo: el documento fuente del
> backlog declara explícitamente que debe definirse con especialistas de cada
> disciplina (pendiente abierto del proyecto).

Vale traerlo a esta revisión porque es la única regla del sistema que **fuerza**
prioridad alta por encima del modelo. Su cobertura define qué urgencias no se
escapan, y hoy son 8 frases con sus sinónimos. No es deuda técnica: es un pendiente
de producto con dueño clínico, y conviene que figure como riesgo asumido y no como
detalle de implementación.

### N5: `CheckboxGroup`: "deseleccionar todo" hace lo contrario

**Severidad: media** (latente: el componente hoy no se usa).

`components/ui/CheckboxGroup.tsx:41-46`:

```ts
if (allSelected) {
  onChange(selectedValues.filter(v => !items.find(i => i.value === v)?.disabled));
} else {
  onChange([...selectedValues, ...items.filter(i => !i.disabled).map(i => i.value)]);
}
```

Las dos ramas están mal:

- **Deseleccionar** conserva los valores cuyo item **no** está deshabilitado, es
  decir exactamente los que debía quitar, y elimina los deshabilitados, que debía
  conservar. La condición está invertida.
- **Seleccionar todo** concatena sin deduplicar: los que ya estaban marcados quedan
  **repetidos** en el array. Si ese array llega a `camposExport`, el CSV exportado
  sale con columnas duplicadas.

Además `allSelected` (`:38`) exige `!item.disabled` para *todos* los items, así que
con un solo item deshabilitado nunca vale `true` y el botón queda permanentemente
en modo "seleccionar".

No rompe nada hoy porque nadie lo importa — ver [N7](#n7-tres-componentes-que-no-usa-nadie).
Lo peligroso es que parece un componente listo para reutilizar.

### N6: "Priorizar con IA" no se protege del doble clic

**Severidad: media.**

`PanelDecision.tsx:92-99` no deshabilita el botón mientras la petición está en
vuelo:

```tsx
<button type="button" onClick={onPriorizarConIA} disabled={priorizadaPorIA}>
  Priorizar con IA
</button>
```

`disabled` mira si ya fue priorizada, no si hay una llamada en curso. Y esa llamada
es la más lenta del sistema: carga el modelo y corre inferencia en CPU
([B9](revision-tecnica-completa.md#b9-la-carga-de-un-csv-corre-dos-modelos-de-forma-síncrona)).
Durante esos segundos el botón sigue activo y sin indicación de progreso, así que
lo natural es volver a apretarlo y disparar una segunda inferencia.

El botón de al lado, "Marcar como revisada", sí lo hace bien: usa
`actualizandoEstado` (`:111`). El patrón existe en el mismo archivo, falta
aplicarlo.

### N7: Tres componentes que no usa nadie

**Severidad: baja.**

Ninguno de estos se importa desde ningún lado:

| Archivo | Líneas |
| --- | ---: |
| `components/ui/CheckboxGroup.tsx` | 109 |
| `components/ui/Accordion.tsx` | 60 |
| `components/ui/IndicadorConfianza.tsx` | 54 |

Son ~223 líneas que se compilan, se lintean y se mantienen sin que nada dependa de
ellas. `CheckboxGroup` además arrastra los bugs de [N5](#n5-checkboxgroup-deseleccionar-todo-hace-lo-contrario)
y 2 de los 8 warnings de lint del proyecto.

### N8: Los logos están duplicados byte a byte

**Severidad: baja.**

`frontend/public/img/` y `landing/assets/img/` tienen los mismos tres PNG, idénticos
(verificado con `cmp`): 503 KB versionados dos veces.

| Archivo | Peso |
| --- | ---: |
| `logo-priorizai.png` | 299 KB |
| `logo-priorizai-mark.png` | 141 KB |
| `logo-priorizai-white.png` | 63 KB |

Sumado a `app-dashboard.png` (480 KB) y `app-detalle.png` (370 KB), solo en
`landing/` hay 1,4 MB de imágenes sin optimizar. Un PNG de 299 KB para un logo y
otro de 141 KB para una marca de favicon son entre 10 y 50 veces lo razonable; en
SVG o WebP quedarían en unos pocos KB.

### N9: La tarjeta "Total" del panel cuenta lo cargado, no lo que hay

**Severidad: baja.**

`ResumenEstadisticas.tsx:14` calcula `const total = interconsultas.length`, sobre el
array que recibe. El listado, después del arreglo de B4, sí usa el total real del
servidor, pero el panel no: si alguna vez la carga se trunca, las cinco cifras del
riel quedan calculadas sobre una parte y presentadas como si fueran el todo.

Hay una trampa latente en el mismo archivo: el conteo de "Prioridad alta" (`:17-20`)
filtra por `prioridadActual === "alta"` sin mirar `sinPrioridad`. Hoy es correcto
porque las interconsultas sin prioridad se rellenan con `"baja"`, pero es
exactamente el patrón que produjo el bug del filtro arreglado en `2c1201a`. Si
alguien agrega una tarjeta de "Prioridad baja", contará todas las no priorizadas.

---

## 3. Revisión del código que se mergeó ayer

Los arreglos de la primera revisión entraron directo a `develop`, sin PR ni revisor.
Los reviso acá con el mismo criterio que el resto, y encontré cinco cosas.

### R1: La lista completa se vuelve a pedir entera en cada cambio

**Severidad: media.** · Introducido por el arreglo de B4.

`services/interconsultas.ts:96` pagina hasta juntar todas las interconsultas, y
`useInterconsultas.ts:81` llama a esa función completa cada vez que llega
`EVENTO_INTERCONSULTAS_ACTUALIZADAS` (`:141`), que se dispara con cada cambio de
prioridad, cada cambio de estado y cada carga de archivo.

Con 800 interconsultas eso son 8 peticiones secuenciales —cada una con su
`selectinload` de modificaciones— por cada clic que cambia algo. Antes era 1
petición por evento. Cambié un bug de correctitud por un costo de red que crece
lineal con la tabla.

Lo correcto sería actualizar solo la fila que cambió (el endpoint ya devuelve la
interconsulta actualizada) y dejar la recarga completa para la carga de archivos.

### R2: La cancelación no cubre el bucle de paginación

**Severidad: baja.** · Introducido por el arreglo de B4.

El efecto de `useInterconsultas.ts` usa el patrón `activo` para descartar la
respuesta si el componente se desmontó, pero la bandera se consulta recién **al
final**, cuando ya se hicieron todas las peticiones. Si el usuario navega a otra
página en medio de una carga larga, las 8 peticiones se completan igual.

### R3: El cambio automático de prioridad no queda en el historial

**Severidad: media.** · Introducido por el arreglo de B2.

`banderas_rojas.py:248` ahora devuelve la prioridad al valor del modelo cuando la
regla deja de aplicar. Es lo correcto, pero ese cambio **no genera un
`ModificacionPrioridad`**: una interconsulta puede pasar de "alta" a "baja" sin que
el historial muestre nada.

El historial solo registra decisiones del médico, por diseño. Pero desde la vista
del médico, la prioridad cambió sola y no hay dónde ver por qué. Si la auditoría
tiene que explicar toda la trayectoria de una prioridad, esto es un hueco.

### R4: `_parsear_edad` sigue aceptando espacios internos

**Severidad: baja.** · Heredado, no introducido.

`main.py:467` elimina todos los espacios antes de parsear, así que `"4 6"` se lee
como 46. Lo mantuve porque había un test que lo fijaba como comportamiento
esperado, pero es una tolerancia dudosa: `"4 6"` es más probable que sea un error de
tipeo que una edad de 46 años. Con el rango 0-130 el daño está acotado, pero el
criterio merece una decisión explícita en vez de heredarse.

### R5: Constantes duplicadas a ambos lados de la API

**Severidad: baja.**

`LIMITE_LISTADO = 100` (`api/interconsultas.py:29`) y `TAMANO_PAGINA = 100`
(`services/interconsultas.ts:73`) son el mismo número mantenido en dos lugares, y
`MAXIMO_EN_MEMORIA = 2000` (`:74`) es un tope del cliente que el servidor
desconoce. `EDAD_MAXIMA = 130` (`main.py:464`) está fijo en el código sin pasar por
`Settings`, a diferencia del resto de los parámetros configurables.

---

## 4. Lo que sigue abierto de la primera revisión

Sin cambios respecto de [`revision-tecnica-completa.md`](revision-tecnica-completa.md);
se listan para que este documento se lea solo.

| # | Hallazgo | Severidad |
| --- | --- | --- |
| S1 | No hay autenticación ni autorización | **Alta** |
| A1 | Importar `app.main` abre conexión a la base | **Alta** |
| B5 | El XLSX que se descarga no es un XLSX | Media |
| B6 | Una fila mal formada tumba el archivo completo | Media |
| B7 | La configuración de import no hace nada | Media |
| B8 | Errores que llegan como `[object Object]` | Media |
| B9 | La carga corre dos modelos de forma síncrona | Media |
| B10 | `puedeEditar` dice una cosa y hace otra | Media |
| S2 | Inyección de fórmulas en el CSV exportado | Media |
| S3 | Contraseña por defecto en el código | Media |
| T2 | El frontend no tiene un solo test | Media |
| A2 | Migraciones a mano con ALTER TABLE | Media |
| A3 | La imagen de frontend es el servidor de desarrollo | Media |
| — | Duplicación y deuda (sección 6 del doc anterior) | Baja |

---

## 5. Orden sugerido

1. **[N1](#n1-jenkins-corre-como-root-con-el-socket-de-docker-del-host)** — es el
   único hallazgo nuevo que expone la máquina anfitriona. Volver a `USER jenkins`
   es una línea; decidir qué hacer con el socket, una conversación corta.
2. **[R1](#r1-la-lista-completa-se-vuelve-a-pedir-entera-en-cada-cambio)** — lo
   introduje ayer y empeora a medida que crece la tabla. Actualizar solo la fila
   que cambió.
3. **S1 + T2**, de la primera revisión: sin autenticación esto no toca datos
   reales, y sin tests de frontend el próximo merge vuelve a romper una página.
4. **[N2](#n2-el-motivo-de-la-modificación-se-valida-distinto-en-cada-lado)** y
   **[R3](#r3-el-cambio-automático-de-prioridad-no-queda-en-el-historial)** juntos:
   los dos son huecos de la auditoría de HdU02, que es lo que el proyecto promete
   como registro clínico.
5. **[N3](#n3-la-referencia-a-las-decisiones-de-diseño-apunta-a-un-archivo-que-no-existe)**
   — escribir `docs/RF7-banderas-rojas.md` con las decisiones D1-D7 y D18 que el
   código ya cita. Es documentación que existe en la cabeza de alguien.
6. **[N4](#n4-el-catálogo-de-alarmas-tiene-8-términos-y-nadie-clínico-lo-validó)** —
   no es trabajo de desarrollo, es agendar la validación con especialistas. Cuanto
   antes empiece, mejor.
7. Limpieza barata en un PR: [N7](#n7-tres-componentes-que-no-usa-nadie),
   [N8](#n8-los-logos-están-duplicados-byte-a-byte),
   [N9](#n9-la-tarjeta-total-del-panel-cuenta-lo-cargado-no-lo-que-hay),
   [R5](#r5-constantes-duplicadas-a-ambos-lados-de-la-api) y los 8 warnings de lint.
