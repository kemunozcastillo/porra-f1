#!/usr/bin/env python3
"""
Migra el Excel de la Porra F1 a sentencias SQL para Postgres/Supabase.

Uso:
    python scripts/migrar_excel.py Porra_F1_2026.xlsx > db/03_datos.sql

Además valida el motor de puntaje: reimplementa las reglas y las compara
contra la columna `Puntaje_GP` ya calculada por el Excel. Si algo no
coincide, lo reporta por stderr.
"""

import sys, json, math, unicodedata, re
from datetime import datetime
import pandas as pd

# ---------------------------------------------------------------- utilidades

def norm(v):
    if v is None: return ''
    s = str(v).strip().lower()
    s = unicodedata.normalize('NFD', s)
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn')

def slug(v):
    s = norm(v).replace('_sprint', '')
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')

# Zona horaria del calendario del Excel. Sus fechas no traen huso, y
# Postgres las leería como UTC: cada cierre caería tres horas antes de lo
# real. Se dedujo contrastando con los horarios oficiales de F1 —la qualy
# de Australia es sábado 16:00 en Melbourne, o sea 05:00 UTC, y la
# planilla dice 02:00— y da UTC-3. Cambiala si el calendario se carga
# desde otro lado.
ZONA = '-03'

def sql(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return 'null'
    if isinstance(v, bool):   return 'true' if v else 'false'
    if isinstance(v, (int,)): return str(v)
    if isinstance(v, float):  return str(int(v)) if v.is_integer() else str(v)
    if isinstance(v, datetime): return "'" + v.isoformat(sep=' ') + ZONA + "'"
    return "'" + str(v).replace("'", "''") + "'"

def sql_ts(v):
    """Timestamp del Excel -> literal SQL.

    Lo que no sea una fecha real (celdas con '-', vacías o con basura) se
    emite como null: es preferible decir "no se sabe" a inventar una hora.
    No afecta al puntaje, porque estas filas van con hora_confiable = false
    y el motor ni mira `enviado_at` en ese caso.
    """
    return sql(v) if isinstance(v, datetime) else 'null'

def limpio(v):
    """Celda -> str/int/None, descartando NaN y vacíos."""
    if v is None: return None
    if isinstance(v, float):
        if math.isnan(v): return None
        if v.is_integer(): return int(v)
        return v
    s = str(v).strip()
    return s or None

# ---------------------------------------------------------------- puntaje

ESCALA_GP     = [5, 3, 1]
ESCALA_SPRINT = [3, 1]

def puntuar_lista(pron, ofi, escala=ESCALA_GP):
    real = [norm(x) for x in ofi if norm(x)]
    total = 0
    for i, elegido in enumerate(pron):
        k = norm(elegido)
        if not k: continue
        if k in real:
            d = abs(i - real.index(k))
            total += escala[d] if d < len(escala) else 0
    return total

def puntuar_exacto(a, b):
    na, nb = norm(a), norm(b)
    return 5 if na and nb and na == nb else 0

def puntuar_estrategia(pron, ofi):
    p = [norm(x) for x in pron if norm(x)]
    r = [norm(x) for x in ofi  if norm(x)]
    if not p or not r: return 0
    if p == r: return 5
    if len(p) == len(r):
        return 3 if sorted(p) == sorted(r) else 1
    return 0

def puntuar_sesion(pred, res, sprint=False, qualy_corrida=False, carrera_corrida=False):
    e = ESCALA_SPRINT if sprint else ESCALA_GP
    q = 0 if qualy_corrida else 1
    c = 0 if carrera_corrida else 1
    t  = puntuar_lista(pred['qualy_equipos'],   res['qualy_equipos'],   e) * q
    t += puntuar_lista(pred['qualy_podio'],     res['qualy_podio'],     e) * q
    t += puntuar_lista(pred['carrera_equipos'], res['carrera_equipos'], e) * c
    t += puntuar_lista(pred['carrera_podio'],   res['carrera_podio'],   e) * c
    if not sprint:
        t += puntuar_exacto(pred.get('dotd'),           res.get('dotd')) * c
        t += puntuar_exacto(pred.get('interrupciones'), res.get('interrupciones')) * c
        t += puntuar_exacto(pred.get('vuelta_rapida'),  res.get('vuelta_rapida')) * c
        t += puntuar_estrategia(pred.get('stints', []), res.get('stints', [])) * c
        t += puntuar_exacto(pred.get('dnf_dsq'),        res.get('dnf_dsq')) * c
    return t

# ---------------------------------------------------------------- extracción

COMP = {'blando (s)': 'S', 'medio (m)': 'M', 'duro (h)': 'H',
        'intermedio (i)': 'I', 'lluvia (w)': 'W'}

def compuesto(v):
    return COMP.get(norm(v), limpio(v))

def fila_a_payload(f, cols_pod=3):
    g = lambda c: limpio(f.get(c))
    payload = {
        'qualy_equipos':   [g(f'Qualy_Equipo_P{i}')   for i in range(1, 12)],
        'qualy_podio':     [g(f'Podio_Qualy_P{i}')    for i in range(1, cols_pod + 1)],
        'carrera_equipos': [g(f'Carrera_Equipo_P{i}') for i in range(1, 12)],
        'carrera_podio':   [g(f'Podio_Carrera_P{i}')  for i in range(1, cols_pod + 1)],
    }
    extras = {
        'dotd':           g('Driver_of_the_Day'),
        'interrupciones': g('Total_Interrupciones'),
        'vuelta_rapida':  g('Vuelta_Rapida'),
        'stints':         [c for c in (compuesto(g(f'Stint_{i}')) for i in range(1, 6)) if c],
        'dnf_dsq':        g('Total_DNF_DSQ'),
    }
    for k, v in extras.items():
        if v not in (None, [], ''):
            payload[k] = v
    return {k: v for k, v in payload.items() if v not in (None, [])}

# Las hojas nombran los mismos GP de maneras distintas: `Calendario` usa
# el país o el circuito, `Predicciones` y `Resultados_Oficiales` usan otra
# cosa. Sin esto, esas rondas se descartan en silencio.
ALIAS = {
    'barcelona-cataluna': 'barcelona',
    'spa-francorchamps':  'spa',
    'bahrain':            'bahrein',
    'jeddah':             'arabia saudi',
    'baku':               'baku',
    'cota':               'cota',
}

# Bloques anulados a mano en la temporada 2026.
#
# Los `Timestamp` del Excel los ponía la PC de quien mandaba, no un
# servidor, así que la misma hora significaba cosas distintas según el
# país y no sirven para decidir quién llegó tarde. Por eso se migran con
# `hora_confiable = false` y el corte por reloj no se aplica hacia atrás.
#
# Lo único que vale para 2026 es la verificación que ya se hizo a mano, y
# su resultado son estos dos casos: ambos mandaron el pronóstico de China
# después de la clasificación sprint y cobraron sólo la carrera sprint.
ANULACIONES = [
    ('gnaran', 'China', {'sprint': ['qualy']}),
    ('Seru',   'China', {'sprint': ['qualy']}),
]

COMODIN = {'normal': 'boost', 'a ciegas': 'boost_ciegas'}

# Boosts reconstruidos cruzando tres hojas que no coincidían entre sí.
# `Predicciones.Boost_Aplicado` tenía nueve, `Puntajes` columnas J/K tenía
# trece, y `Comodines` marcaba siete. Se resolvió comparando cada monto
# registrado contra `Totales_Carrera.Puntaje_GP`: los trece coinciden con
# exactamente un GP, así que la reconstrucción es unívoca.
BOOSTS = [
    ('KevinVlogs',     'boost_ciegas', 'China'),
    ('MrSpidy',        'boost',        'China'),          # la 2ª declaración (Spa) nunca se aplicó
    ('gnaran',         'boost_ciegas', 'Miami'),
    ('Sarahoria__',    'boost',        'Miami'),
    ('Pedro Domenech', 'boost',        'Canadá'),
    ('luchi',          'boost',        'Canadá'),
    ('Shiristian',     'boost',        'Austria'),
    ('El_corcho',      'boost_ciegas', 'Silverstone'),
    ('Chat GPT',       'boost_ciegas', 'Monaco'),
    ('Grok',           'boost_ciegas', 'Monaco'),
    ('Grok',           'boost',        'Silverstone'),
    ('Gemini',         'boost_ciegas', 'Barcelona'),
]

# ---------------------------------------------------------------- principal

def main(ruta):
    x = lambda h: pd.read_excel(ruta, sheet_name=h)
    cal, usr, pil, eqp, cmp_ = x('Calendario'), x('Usuario'), x('Pilotos'), x('Equipos_Carrera'), x('Compuestos')
    pred, ofi = x('Predicciones'), x('Resultados_Oficiales')
    proc = x('Procesamiento_Puntajes')

    out = ['-- Datos migrados desde el Excel de la Porra F1', 'begin;', '']

    # catálogos
    out.append('-- equipos')
    for e in eqp['Equipos'].dropna():
        out.append(f"insert into equipos (nombre) values ({sql(e)}) on conflict do nothing;")
    out.append('\n-- pilotos')
    for p in pil['Pilotos'].dropna():
        out.append(f"insert into pilotos (nombre) values ({sql(p)}) on conflict do nothing;")
    out.append('\n-- compuestos')
    for c in cmp_['Compuestos'].dropna():
        out.append(f"insert into compuestos (codigo, nombre) values ({sql(COMP.get(norm(c), c))}, {sql(c)}) on conflict do nothing;")

    # calendario
    out.append('\n-- calendario')
    slugs = {}
    sin_mapear = set()

    def buscar(nombre):
        """GP de cualquier hoja -> slug del calendario. Registra los fallos."""
        k = norm(str(nombre).replace('_sprint', ''))
        s = slugs.get(k) or slugs.get(ALIAS.get(k, ''))
        if not s:
            sin_mapear.add(str(nombre))
        return s

    for i, f in cal.dropna(subset=['GP']).reset_index(drop=True).iterrows():
        s = slug(f['Circuito'] if pd.notna(f.get('Circuito')) else f['GP'])
        # El circuito es único; el país no (España aparece dos veces).
        # Por eso el circuito manda y el país sólo se registra si está libre.
        slugs[norm(str(f['Circuito']))] = s
        slugs.setdefault(norm(f['GP']), s)
        estado = {'finalizado': 'finalizado', 'activo': 'abierto', 'proximo': 'proximo'}.get(norm(f.get('Estado')), 'proximo')
        tipo = 'sprint' if norm(f.get('Tipo')) == 'sprint' else 'normal'
        # `Fecha_Cierre` es la largada de la primera sesión que puntúa: la
        # clasificación sprint en los fines de semana con sprint, la
        # clasificación normal en el resto. Las demás largadas no están en
        # el Excel y quedan sin cargar; hasta que se completen, esas
        # sesiones puntúan siempre (ver `loQueYaSeCorrio`).
        # El horario de largada sólo se siembra en las rondas que faltan.
        # En las ya jugadas, `Fecha_Cierre` es un cierre nominal y no la
        # largada real: mucha gente mandó después y cobró igual, así que
        # sembrarlo ahí reescribiría la historia. Las dos penalizaciones
        # que sí se aplicaron van explícitas en ANULACIONES.
        col_qualy = 'sprint_qualy_at' if tipo == 'sprint' else 'qualy_at'
        siembra_horario = estado != 'finalizado'
        out.append(
            f"insert into gps (ronda, slug, nombre, circuito, tipo, estado, abre_at, fp1_at, cierra_at, {col_qualy}) values ("
            f"{i+1}, {sql(s)}, {sql(f['GP'])}, {sql(f['Circuito'])}, {sql(tipo)}, {sql(estado)}, "
            f"{sql(f['Fecha_Inicio'])}, {sql(f.get('Fecha_FP1'))}, {sql(f['Fecha_Cierre'])}, "
            f"{sql(f['Fecha_Cierre']) if siembra_horario else 'null'}) on conflict (slug) do nothing;"
        )

    # participantes
    out.append('\n-- participantes')
    for n in usr['Nombre'].dropna():
        tipo = 'historico' if norm(n).startswith('temporada') else (
            'ia' if norm(n) in {'chat gpt', 'claude', 'gemini', 'grok', 'replica'} else 'humano')
        out.append(f"insert into participantes (nombre, tipo) values ({sql(n)}, {sql(tipo)}) on conflict do nothing;")

    # resultados
    out.append('\n-- resultados oficiales')
    res_por_clave = {}
    for _, f in ofi.dropna(subset=['GP']).iterrows():
        nombre_gp = str(f['GP'])
        sesion = 'sprint' if nombre_gp.endswith('_sprint') else 'gp'
        s = buscar(nombre_gp)
        if not s: continue
        payload = fila_a_payload(f, cols_pod=5)
        if not payload.get('qualy_equipos') or not any(payload['qualy_equipos']):
            continue
        res_por_clave[(norm(nombre_gp))] = payload
        out.append(
            "insert into resultados (gp_id, sesion, payload, publicado) select id, "
            f"{sql(sesion)}, {sql(json.dumps(payload, ensure_ascii=False))}::jsonb, true "
            f"from gps where slug = {sql(s)} on conflict (gp_id, sesion) do update set payload = excluded.payload;"
        )

    # predicciones + validación
    out.append('\n-- pronósticos')
    errores, comparados = [], 0
    proc_idx = {}
    for _, f in proc.dropna(subset=['ID_usuario']).iterrows():
        proc_idx[(norm(f['ID_usuario']), norm(f['GP']))] = f.get('Puntaje_GP')

    for _, f in pred.dropna(subset=['ID_usuario', 'GP']).iterrows():
        s = buscar(f['GP'])
        if not s: continue
        payload = fila_a_payload(f, cols_pod=3)
        out.append(
            "insert into predicciones (participante, gp_id, payload, enviado_at, hora_confiable) select "
            f"{sql(str(f['ID_usuario']).strip())}, id, {sql(json.dumps(payload, ensure_ascii=False))}::jsonb, "
            f"{sql_ts(f.get('Timestamp'))}, false from gps where slug = {sql(s)} "
            "on conflict (participante, gp_id) do update set payload = excluded.payload;"
        )
        # validación contra el Excel
        real = res_por_clave.get(norm(f['GP']))
        esperado = proc_idx.get((norm(f['ID_usuario']), norm(f['GP'])))
        if real and esperado is not None and not (isinstance(esperado, float) and math.isnan(esperado)):
            calculado = puntuar_sesion(payload, real)
            comparados += 1
            if calculado != int(esperado):
                errores.append((f['ID_usuario'], f['GP'], int(esperado), calculado))

    out.append('\n-- bloques anulados por llegar tarde')
    for quien, gp, bloques in ANULACIONES:
        sl_ = buscar(gp)
        if not sl_: continue
        out.append(
            f"update predicciones set anulado = {sql(json.dumps(bloques))}::jsonb "
            f"where participante = {sql(quien)} and gp_id = (select id from gps where slug = {sql(sl_)});"
        )

    out.append('\n-- comodines quemados')
    for quien, tipo, gp in BOOSTS:
        sl = buscar(gp)
        if not sl:
            print(f'[aviso] no encuentro el GP {gp} para el boost de {quien}', file=sys.stderr)
            continue
        out.append(
            f"insert into comodines (participante, tipo, gp_id) select {sql(quien)}, {sql(tipo)}, id "
            f"from gps where slug = {sql(sl)} on conflict do nothing;"
        )

    out += ['', 'commit;']
    print('\n'.join(out))

    if sin_mapear:
        print('[ERROR] GP que no matchean con el calendario y quedaron fuera:',
              file=sys.stderr)
        for n in sorted(sin_mapear):
            print(f'  - {n}   (agregalo a ALIAS)', file=sys.stderr)

    print(f'\n[validación] {comparados} pronósticos comparados contra el Excel, '
          f'{len(errores)} diferencias.', file=sys.stderr)
    for e in errores[:15]:
        print(f'  {e[0]} / {e[1]}: excel={e[2]} motor={e[3]}', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'Porra_F1_2026.xlsx')
