# Porra F1

La porra de siempre, fuera de la planilla. Next.js en Vercel, Postgres en Supabase.
Todo dentro de los planes gratuitos.

---

## Qué hace

- **Clasificación** pública, con la tabla acumulada y una tira de bloques por ronda que muestra dónde ganaste.
- **Pronósticos** por Gran Premio y por sprint, con cierre automático por fecha.
- **Panel de admin** para cargar el resultado oficial: al publicarlo se recalcula toda la ronda.
- **Comodines**: un boost y un boost a ciegas por temporada, uno solo de cada uno.
- **Campeonato paralelo** con la escala de puntos de la F1 según tu posición en cada ronda.

---

## Las reglas, tal como estaban en el Excel

El motor vive en `lib/puntaje.ts` y es una función pura: se puede leer, testear y
recalcular la temporada entera sin tocar la base.

| Concepto | Puntos |
|---|---|
| Equipo o piloto en la posición exacta | 5 · **3 en sprint** |
| A una posición | 3 · **1 en sprint** |
| A dos posiciones | 1 · **0 en sprint** |
| Más lejos | 0 |
| Piloto del día, vuelta rápida, interrupciones o abandonos exactos | 5 cada uno |
| Estrategia: misma secuencia de compuestos | 5 |
| Estrategia: mismos compuestos, otro orden | 3 |
| Estrategia: misma cantidad de stints | 1 |
| Ganar la ronda | +3 (segundo +2, tercero +1) |
| Boost | duplica la sesión de Gran Premio |

Los podios se comparan contra las **cinco** primeras posiciones reales, no contra tres:
un piloto que terminó cuarto todavía puede darte 1 punto si lo pusiste en el podio.

### Sobre la validación

El script de migración recalcula los 199 pronósticos ya puntuados en la planilla y los
compara con la columna `Puntaje_GP`. **185 coinciden exactamente.** Las 14 diferencias
están todas en Canadá y Zandvoort, y al abrirlas celda por celda son errores de la
planilla, no del motor: en esas filas la columna `Qualy_Equipo_P3` quedó evaluando la
posición 2 en lugar de la 3, porque la fórmula usa `COLUMN() - 2` y ahí se corrió una
columna. Las diferencias son de 1 a 5 puntos y no cambian el orden de la tabla, pero
conviene saber que existen antes de migrar: **si querés conservar los puntajes históricos
exactos de la planilla, cargalos a mano; si preferís los correctos, dejá que el motor
recalcule.** La hoja `Copia de Puntajes`, además, está entera en `#REF!`.

---

### Sprints

**No hay pronóstico de sprint.** En las rondas con sprint se puntúa el mismo pronóstico
dos veces: una contra el resultado del sprint, donde cuentan sólo las parrillas y los
podios, y otra contra el del Gran Premio, donde cuenta todo. Es lo que hace
`Procesamiento_Sprints`, que lee las mismas columnas de `Predicciones` y las compara
contra la fila `GP_sprint` de `Resultados_Oficiales`.

El sprint usa una **escala reducida: 3 en el lugar exacto, 1 a una posición, nada más**.
Vale menos y perdona menos. En los sprints de China, Miami y Silverstone —los tres que
no arrastran errores de fórmula— 58 de 60 puntajes coinciden al punto con los que
guardaba la planilla, y los dos que no son pronósticos enviados **después del cierre**
(gnaran y Seru mandaron el de China a las 08:27 y 14:14, con cierre a las 04:30). Eso
es exactamente lo que RLS ahora impide.

Sobre el total de 97 sprints puntuados, el motor clava **85**. Los 12 restantes son todos
de Canadá y Zandvoort, las rondas con fórmulas corridas.

### Llegar tarde

Se puede mandar después del cierre, pero **no se puntúa hacia atrás**: los bloques de una
sesión que ya se corrió valen cero, y lo que falta del fin de semana cuenta normal. RLS
deja escribir hasta la largada de la carrera; el descuento lo aplica el motor comparando
`enviado_at` contra las horas de largada de `gps` (`sprint_qualy_at`, `sprint_carrera_at`,
`qualy_at`, `carrera_at`). Una sesión sin horario cargado puntúa igual: es preferible pagar
de más a descontar por un dato que falta.

Para la temporada 2026 el corte **no** se aplica por reloj, y la razón es de fondo: el
`Timestamp` del Excel lo ponía la PC de quien mandaba, no un servidor. La misma hora
significaba cosas distintas según el país, así que mientras en un huso todavía se podía
enviar, en otro ya no. Ese dato no sirve para decidir quién llegó tarde y se migra con
`hora_confiable = false`, lo que desactiva el corte por horario en todo lo histórico.

Lo que sí vale para 2026 es la verificación que ya se hizo a mano. Su resultado son dos
casos —gnaran y Seru en China, que cobraron sólo la carrera sprint— y van explícitos en
`predicciones.anulado`, la columna que un admin usa cuando el reloj no alcanza:

```json
{"sprint": ["qualy"]}
```

Se combina con el corte por horario: basta que una de las dos vías diga que el bloque no
puntúa. Desde Monza en adelante las rondas llevan la hora sembrada, los pronósticos nuevos
entran con `hora_confiable = true`, y el corte pasa a ser automático.

**El reloj ahora es uno solo.** `enviado_at` es `timestamptz` con `default now()`: lo
estampa Postgres en UTC, no el navegador. El problema de husos que tenía la planilla no
puede repetirse, porque el cliente ya no participa de la decisión.

### Zona horaria del calendario

Las fechas del Excel no traen huso, y Postgres las leería como UTC: cada cierre caería
tres horas antes de lo real. La migración las emite con `-03` explícito. El huso se
dedujo contrastando con los horarios oficiales de F1 —la clasificación de Australia es
sábado 16:00 en Melbourne, o sea 05:00 UTC, y la planilla dice 02:00— y da UTC-3, que
además coincide con la FP1 de China. Si el calendario se carga desde otra zona, se cambia
la constante `ZONA` en `scripts/migrar_excel.py`.

### Comodines

Un boost y un boost a ciegas por temporada. Se pueden usar los dos, en rondas distintas
(Grok usó ambos en 2026). Cualquiera de los dos **duplica sólo la sesión de Gran Premio**:
en un fin de semana con sprint, el sprint no se dobla. Esto está verificado contra los
nueve boosts que la planilla tenía registrados, y los nueve valen exactamente el
`Puntaje_GP` de esa ronda.

Los comodines viven en su propia tabla, no como columna del pronóstico, porque tienen
un calendario distinto:

| Comodín | Cierra |
|---|---|
| Boost | con el pronóstico |
| Boost a ciegas | cuando arranca la FP1 |

Atarlos a la fila del pronóstico obligaría a decidir los dos al mismo tiempo, y el
sentido del "a ciegas" es justamente comprometerse antes de ver una sola vuelta.
Los dos plazos los impone RLS contra `gps.fp1_at` y `gps.cierra_at`, que ya vienen
cargados desde la columna `Fecha_FP1` de tu calendario. Si una ronda no tiene FP1
cargada, el boost a ciegas queda bloqueado: es preferible a dejar pasar uno fuera de
plazo. La clave primaria `(participante, tipo)` garantiza uno de cada por temporada
sin depender de que la aplicación lo controle.

El comodín **Cambio** no está implementado: este año no corre.

### Las dos tablas

`db/04_campeonato_f1.sql` crea la vista del segundo campeonato, y la portada alterna
entre las dos con `/` y `/?tabla=f1`.

- **Acumulado**: suma de puntajes + medallas de ronda + boost.
- **Puntos F1**: en cada ronda se ordena a todos por el puntaje del fin de semana y se
  reparte 25-18-15-12-10-8-6-4-2-1. Ganar por un punto vale lo mismo que ganar por
  cuarenta, así que premia la regularidad arriba y no el volumen de aciertos.

Los empates usan ranking de competición (1, 1, 3): los empatados cobran lo mismo y la
posición siguiente se saltea. Es lo que hace la planilla, donde el criterio se calcula
con `LARGE` contando duplicados, y coincide con los empates que ya tenías en la tabla
(Grok y luchi en el 7º, luchi y Enma en el 15º).

## Puesta en marcha

### 1. Base de datos

Creá un proyecto en [supabase.com](https://supabase.com) (plan gratuito: 500 MB de
Postgres, de sobra para esto) y abrí el **SQL Editor**.

```
db/01_schema.sql        → tablas, vistas, RLS y políticas
db/03_datos.sql         → calendario, participantes, resultados, pronósticos y comodines
db/04_campeonato_f1.sql → vista de la segunda tabla
```

Corré los tres, en ese orden. `db/02_admin.sql` no se ejecuta: son consultas sueltas
de mantenimiento para tener a mano.

> **Alternativa:** si preferís [Neon](https://neon.tech), el esquema funciona igual salvo
> las políticas RLS que dependen de `auth.uid()` y la tabla `perfiles` que referencia
> `auth.users`. Ahí tendrías que resolver el login por otro lado. Supabase te da la
> base y la autenticación en el mismo paquete, por eso es la recomendación.

### 2. Login

En Supabase, **Authentication → Providers**, activá **Discord** (y Google si querés).
Para Discord: creá una app en el [portal de desarrolladores](https://discord.com/developers/applications),
copiá Client ID y Secret, y pegá la Redirect URL que te muestra Supabase.

Evitá los magic links por email: el SMTP gratuito de Supabase tiene un límite muy bajo
de mensajes por hora y con veinte personas te lo comés en una tarde.

### 3. Vercel

```bash
git init && git add . && git commit -m "Porra F1"
# subí el repo a GitHub, después:
# vercel.com → Add New → Project → importá el repo
```

Variables de entorno en Vercel (copiadas de Supabase → Project Settings → API):

| Variable | Dónde sale |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` — **nunca** con prefijo `NEXT_PUBLIC_` |

Después del primer deploy, volvé a Supabase → **Authentication → URL Configuration** y
agregá tu dominio de Vercel a las Redirect URLs.

### 4. Vincular a la gente

Cada persona entra una vez con Discord, lo que crea su fila en `perfiles`. Después,
un admin la enlaza con su nombre histórico:

```sql
-- Ver quién entró y todavía no está vinculado
select p.id, p.nombre from perfiles p
left join participantes pa on pa.perfil_id = p.id
where pa.nombre is null;

-- Enlazar
update participantes set perfil_id = 'UUID_DEL_PERFIL' where nombre = 'KevinVlogs';

-- Darte permisos de admin
update perfiles set es_admin = true where nombre = 'TU_NOMBRE';
```

### 5. Correr la migración de nuevo

Si volvés a exportar el Excel:

```bash
pip install pandas openpyxl
python scripts/migrar_excel.py Porra_F1_2026.xlsx > db/03_datos.sql
```

Imprime el SQL por stdout y el informe de validación por stderr.

---

## Cómo está armado

```
app/
  page.tsx              clasificación general
  pronostico/           carga del pronóstico (GP y sprint)
  gp/[slug]/            detalle de una ronda, con desglose por participante
  admin/                carga de resultados oficiales
  reglas/               las reglas, escritas
  acciones.ts           server actions: guardar pronóstico, publicar resultado
components/             los dos formularios
lib/
  puntaje.ts            el motor de puntuación (sin dependencias)
  recalcular.ts         aplica el motor y escribe en la base
  supabase.ts           clientes de servidor
db/                     esquema y datos
scripts/migrar_excel.py conversión del Excel a SQL + validación
```

**El cierre de los pronósticos lo impone Postgres, no el navegador.** Las políticas RLS
comparan `now()` contra `cierra_at` en cada `insert` y `update`, así que aunque alguien
manipule el formulario o pegue una request a mano, la base lo rechaza. Los pronósticos
ajenos tampoco son legibles hasta que la sesión cierra.

## Lo que quedó pendiente

Cosas que la planilla resolvía a mano y acá quedaron a medio camino:

- **Las largadas reales de cada sesión** (`sprint_carrera_at`, `carrera_at`, y `qualy_at`
  en los fines de semana con sprint) están sin cargar. Sin ellas, esos bloques puntúan
  siempre. Conviene completarlas en `gps` antes de que el corte automático importe.
- **Los totales quedan entre −1 y +10 de la planilla**, y esa diferencia es la esperada:
  son las fórmulas corridas de Canadá, Zandvoort, Barcelona y Spa. Chat GPT, Grok y Enma
  cierran exactos en el acumulado; en la tabla F1 cierran exactos KevinVlogs, Chat GPT,
  Grok, Pedro Domenech, 077Agus93, Replica y Gemini. Con las reglas escritas, los
  puntajes de esta versión son los correctos.
- **Los boosts históricos** los reconstruí cruzando tres hojas que no coincidían:
  `Predicciones` tenía nueve, las columnas J/K de `Puntajes` tenían trece, y `Comodines`
  marcaba siete. Comparando cada monto contra `Totales_Carrera.Puntaje_GP`, los trece
  cierran con un GP y sólo uno, así que la reconstrucción es unívoca. Dos detalles: MrSpidy
  figura declarando boost normal en China y en Spa, pero el que se aplicó fue el de China;
  y los boosts de Chat GPT, Grok y Gemini nunca se registraron en `Predicciones`, sólo en
  `Puntajes`. La lista final está en `BOOSTS` dentro de `scripts/migrar_excel.py`.
- **Recalcular la temporada entera** existe como función (`recalcularTemporada`) pero no
  tiene botón. Se puede llamar desde una ruta protegida cuando haga falta.
