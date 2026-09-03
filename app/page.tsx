import { clienteServidor } from '@/lib/supabase';

export const revalidate = 60;

type FilaAcumulado = {
  participante: string; tipo: string; total: number;
  puntos_sesiones: number; puntos_medallas: number; puntos_boost: number;
  oros: number; platas: number; bronces: number;
};

type FilaF1 = {
  participante: string; tipo: string; puntos: number;
  victorias: number; podios: number; rondas_en_puntos: number;
};

type FilaMedallero = {
  participante: string; tipo: string;
  oros: number; platas: number; bronces: number; cuartos: number; podios: number;
};

type Fila = FilaAcumulado | FilaF1 | FilaMedallero;

/**
 * Las medallas se leen en el mismo orden que las ordena: oro, plata,
 * bronce y, como último desempate, cuartos puestos. Los colores son los
 * de la tira de rondas, para que una fila y su tira se lean igual.
 *
 * Los rótulos van una sola vez en la cabecera: repetirlos en cada fila
 * era lo que descolocaba los números, porque "oro" y "cuartos" no miden
 * lo mismo.
 */
const ESCALONES = [
  { clave: 'oros'    as const, rotulo: 'Oro',    color: 'var(--violeta)' },
  { clave: 'platas'  as const, rotulo: 'Plata',  color: 'var(--verde)' },
  { clave: 'bronces' as const, rotulo: 'Bronce', color: 'var(--ambar)' },
  { clave: 'cuartos' as const, rotulo: '4º',     color: 'var(--tenue)' },
];

function Medallas({ fila }: { fila: FilaMedallero }) {
  return (
    <div className="medallas">
      {ESCALONES.map((e) => (
        <span key={e.clave} style={{ color: fila[e.clave] ? e.color : '#3F4A57' }}>
          {fila[e.clave]}
        </span>
      ))}
    </div>
  );
}

function CabeceraMedallero() {
  return (
    <div className="cabecera-medallero">
      <span />
      <span />
      <div className="medallas">
        {ESCALONES.map((e) => <span key={e.clave}>{e.rotulo}</span>)}
      </div>
    </div>
  );
}

export default async function Clasificacion({
  searchParams,
}: { searchParams: Promise<{ tabla?: string; tipo?: string }> }) {
  const { tabla, tipo } = await searchParams;
  const esF1 = tabla === 'f1';
  const esMedallero = tabla === 'podios';
  const esBoosts = tabla === 'boosts';
  const supabase = await clienteServidor();

  const [acumulado, campeonato, medallero, { data: gps }, { data: posiciones }, { data: comodines }, { data: puntajesGp }] =
    await Promise.all([
      supabase.from('clasificacion').select('*'),
      supabase.from('campeonato_f1').select('*'),
      supabase.from('medallero').select('*'),
      supabase.from('gps').select('id, ronda, nombre, slug, estado').order('ronda'),
      supabase.from('posiciones_gp').select('participante, gp_id, medalla'),
      // RLS sólo deja ver los comodines ajenos una vez cerrada su ronda,
      // así que un boost de la ronda en curso no se le filtra a nadie.
      supabase.from('comodines').select('participante, tipo, gp_id'),
      supabase.from('puntajes').select('participante, gp_id, puntos').eq('sesion', 'gp'),
    ]);

  const medallaDe = new Map<string, number>();
  posiciones?.forEach((p) => medallaDe.set(`${p.participante}|${p.gp_id}`, p.medalla));

  // El boost duplica la sesión de Gran Premio, así que lo que sumó es
  // exactamente el puntaje de esa sesión: se cobra una segunda vez.
  const puntajeGpDe = new Map<string, number>();
  (puntajesGp ?? []).forEach((p) => puntajeGpDe.set(`${p.participante}|${p.gp_id}`, p.puntos));

  const gpPorId = new Map(gps?.map((g) => [g.id, g]) ?? []);
  const todosLosBoosts = (comodines ?? [])
    .map((c) => ({
      participante: c.participante as string,
      tipo: c.tipo as string,
      gp: gpPorId.get(c.gp_id),
      puntos: puntajeGpDe.get(`${c.participante}|${c.gp_id}`),
    }))
    .sort((a, b) => (b.puntos ?? -1) - (a.puntos ?? -1));

  const filtroTipo = tipo === 'boost' || tipo === 'boost_ciegas' ? tipo : null;
  const boosts = filtroTipo ? todosLosBoosts.filter((b) => b.tipo === filtroTipo) : todosLosBoosts;

  const FILTROS = [
    { valor: null,            rotulo: 'Todos',    color: 'var(--texto)' },
    { valor: 'boost',         rotulo: 'Normal',   color: 'var(--violeta)' },
    { valor: 'boost_ciegas',  rotulo: 'A ciegas', color: 'var(--ambar)' },
  ] as const;

  const filas: Fila[] = esMedallero
    ? ((medallero.data ?? []) as FilaMedallero[])
    : esF1
      ? ((campeonato.data ?? []) as FilaF1[])
      : ((acumulado.data ?? []) as FilaAcumulado[]);

  const valorDe = (f: Fila) =>
    esMedallero ? (f as FilaMedallero).oros
    : esF1 ? (f as FilaF1).puntos
    : (f as FilaAcumulado).total;

  const lider = filas.length ? valorDe(filas[0]) : 0;
  const disputadas = gps?.filter((g) => g.estado === 'finalizado').length ?? 0;
  const proximo = gps?.find((g) => g.estado === 'abierto') ?? gps?.find((g) => g.estado === 'proximo');
  const slugDe = new Map(gps?.map((g) => [g.id, g.slug]) ?? []);

  const titulo = esBoosts
    ? <>Los<br />comodines</>
    : esMedallero
      ? <>El<br />medallero</>
      : esF1 ? <>Campeonato<br />paralelo</> : <>La tabla<br />no miente</>;

  const subtitulo = esBoosts
    ? 'Un boost y un boost a ciegas por temporada, y una vez quemados no vuelven. Los dos duplican el puntaje del Gran Premio: en un fin de semana con sprint, el sprint no se dobla. La columna de la derecha es lo que sumó cada uno.'
    : esMedallero
      ? 'Criterio olímpico: manda quien más rondas ganó. Un oro vale más que cualquier cantidad de platas, y una plata más que cualquier cantidad de bronces. Si hay empate se baja a los cuartos puestos.'
      : esF1
        ? 'Puntos de F1 según tu posición en cada ronda: 25 al que gana el fin de semana, 18 al segundo, y así hasta el décimo. Ganar por un punto vale lo mismo que ganar por cuarenta.'
        : 'Suma de todo lo que acertaste, más las medallas por ganar una ronda y el boost si lo quemaste.';

  return (
    <>
      <p className="rotulo">Temporada 2026 · {disputadas} rondas disputadas</p>
      <h1 className="titulo">{titulo}</h1>
      <p className="subtitulo">{subtitulo}</p>

      <nav className="nav" style={{ marginBottom: 22 }}>
        <a href="/" aria-current={!esF1 && !esMedallero ? 'page' : undefined}>Acumulado</a>
        <a href="/?tabla=f1" aria-current={esF1 ? 'page' : undefined}>Puntos F1</a>
        <a href="/?tabla=podios" aria-current={esMedallero ? 'page' : undefined}>Podios</a>
        <a href="/?tabla=boosts" aria-current={esBoosts ? 'page' : undefined}>Comodines</a>
        <a href="/gp">Por ronda</a>
      </nav>

      {esBoosts ? (
        <>
        <div className="filtros">
          {FILTROS.map((f) => {
            const activo = filtroTipo === f.valor;
            const n = f.valor ? todosLosBoosts.filter((b) => b.tipo === f.valor).length : todosLosBoosts.length;
            return (
              <a key={f.rotulo}
                 href={f.valor ? `/?tabla=boosts&tipo=${f.valor}` : '/?tabla=boosts'}
                 aria-current={activo ? 'page' : undefined}
                 style={activo ? { color: f.color, borderColor: 'currentColor' } : undefined}>
                {f.rotulo} <span className="cuenta">{n}</span>
              </a>
            );
          })}
        </div>

        {boosts.length === 0 ? (
          <div className="vacio">
            {filtroTipo ? 'Nadie ha quemado ese comodín todavía.' : 'Todavía no hay ningún comodín declarado.'}
          </div>
        ) : (
          <div className="torre">
            {boosts.map((b, i) => (
              <div key={`${b.participante}|${b.tipo}`} className={`fila ${i === 0 ? 'lider' : ''}`}>
                <div className="pos">{i + 1}</div>
                <div className="nombre">
                  {b.participante}
                  <span className="comodin" data-tipo={b.tipo}>
                    {b.tipo === 'boost_ciegas' ? 'A CIEGAS' : 'NORMAL'}
                  </span>
                </div>
                <div className="gap">
                  {b.gp ? (
                    <a href={`/gp/${b.gp.slug}`}>R{b.gp.ronda} · {b.gp.nombre}</a>
                  ) : 'ronda desconocida'}
                </div>
                <div className="total">
                  {b.puntos === undefined
                    ? <span style={{ fontSize: 13, color: 'var(--tenue)' }}>sin correr</span>
                    : <>+{b.puntos}</>}
                </div>
              </div>
            ))}
          </div>
        )}
        </>
      ) : filas.length === 0 ? (
        <div className="vacio">Todavía no hay puntajes cargados.</div>
      ) : (
        <div className="torre">
          {esMedallero && <CabeceraMedallero />}
          {filas.map((f, i) => (
            <div key={f.participante}
                 className={`fila ${esMedallero ? 'medallero' : ''} ${i === 0 ? 'lider' : i < 3 ? 'podio' : ''}`}>
              <div className="pos">{i + 1}</div>
              <div className="nombre">
                {f.participante}
                {f.tipo !== 'humano' && <span className="etiqueta-ia">{f.tipo}</span>}
              </div>
              {esMedallero ? (
                <Medallas fila={f as FilaMedallero} />
              ) : (
                <>
                  <div className="gap">
                    {esF1
                      ? `${(f as FilaF1).victorias} vict · ${(f as FilaF1).podios} podios`
                      : i === 0 ? 'líder' : `+${lider - valorDe(f)}`}
                  </div>
                  <div className="total">{valorDe(f)}</div>
                </>
              )}
              <div className="tira" aria-hidden={false}>
                {gps?.map((g) => {
                  const m = medallaDe.get(`${f.participante}|${g.id}`);
                  return (
                    <a
                      key={g.id}
                      className="bloque"
                      href={`/gp/${slugDe.get(g.id)}`}
                      data-medalla={m ?? 0}
                      data-jugado={g.estado === 'finalizado' ? 'si' : 'no'}
                      title={`${g.nombre}${m ? ` · ${m === 3 ? '1º' : m === 2 ? '2º' : '3º'} de la ronda` : ''}`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {proximo && (
        <>
          <p className="rotulo">Próxima ronda</p>
          <a className="tarjeta" href={`/gp/${proximo.slug}`} style={{ display: 'block' }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 24, textTransform: 'uppercase' }}>
              R{proximo.ronda} · {proximo.nombre}
            </strong>
          </a>
        </>
      )}
    </>
  );
}
