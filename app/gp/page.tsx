import { clienteServidor } from '@/lib/supabase';

export const revalidate = 60;
export const metadata = { title: 'Por ronda · Porra F1' };

  type Posicion = {
  participante: string; gp_id: number;
  total_gp: number; posicion: number; medalla: number; puntos_f1: number;
};

export default async function PorRonda() {
  const supabase = await clienteServidor();

  const [{ data: gps }, { data: posiciones }, { data: comodines }, { data: puntajes }] = await Promise.all([
    supabase.from('gps').select('id, ronda, nombre, slug, tipo, estado, carrera_at').order('ronda'),
    supabase.from('posiciones_gp').select('participante, gp_id, total_gp, posicion, medalla, puntos_f1'),
    supabase.from('comodines').select('participante, tipo, gp_id'),
    supabase.from('puntajes').select('participante, gp_id, puntos'),
  ]);

  const comodinesDe = new Map<number, { participante: string; tipo: string }[]>();
  (comodines ?? []).forEach((c) => {
    const lista = comodinesDe.get(c.gp_id) ?? [];
    lista.push({ participante: c.participante as string, tipo: c.tipo as string });
    comodinesDe.set(c.gp_id, lista);
  });

  const porGp = new Map<number, Posicion[]>();
  (posiciones ?? []).forEach((p) => {
    const lista = porGp.get(p.gp_id) ?? [];
    lista.push(p as Posicion);
    porGp.set(p.gp_id, lista);
  });
  porGp.forEach((l) => l.sort((a, b) => a.posicion - b.posicion));

  // Una ronda con sólo la clasificación cargada no tiene posiciones -el
  // podio espera a la carrera- pero sí puntajes. Se arma un orden
  // provisional para no dejarla en blanco.
  const provisionalDe = new Map<number, Posicion[]>();
  const acumulado = new Map<number, Map<string, number>>();
  (puntajes ?? []).forEach((p) => {
    if (porGp.has(p.gp_id)) return;
    const porNombre = acumulado.get(p.gp_id) ?? new Map<string, number>();
    porNombre.set(p.participante, (porNombre.get(p.participante) ?? 0) + p.puntos);
    acumulado.set(p.gp_id, porNombre);
  });
  acumulado.forEach((porNombre, gpId) => {
    provisionalDe.set(gpId, [...porNombre]
      .map(([participante, total_gp]) => ({
        participante, gp_id: gpId, total_gp, posicion: 0, medalla: 0, puntos_f1: 0,
      }))
      .sort((a, b) => b.total_gp - a.total_gp || a.participante.localeCompare(b.participante))
      .map((f, i) => ({ ...f, posicion: i + 1 })));
  });

  const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';

  return (
    <>
      <p className="rotulo">Temporada 2026</p>
      <h1 className="titulo">Ronda<br />por ronda</h1>
      <p className="subtitulo">
        El puntaje de cada fin de semana y los puntos F1 que repartió.
      </p>

      <nav className="nav" style={{ marginBottom: 22 }}>
        <a href="/">Acumulado</a>
        <a href="/?tabla=f1">Puntos F1</a>
        <a href="/?tabla=podios">Podios</a>
        <a href="/gp" aria-current="page">Por ronda</a>
      </nav>

      {(gps ?? []).map((g) => {
        const definitiva = porGp.get(g.id);
        const tabla = definitiva ?? provisionalDe.get(g.id) ?? [];
        const provisional = !definitiva && tabla.length > 0;
        return (
          <div className="tarjeta" key={g.id}>
            <label className="suelto">
              Ronda {g.ronda} · {fecha(g.carrera_at)}
              {g.tipo === 'sprint' && ' · sprint'}
            </label>
            <a href={`/gp/${g.slug}`} style={{ display: 'block', marginBottom: tabla.length ? 12 : 0 }}>
              <strong style={{ fontFamily: 'var(--display)', fontSize: 22, textTransform: 'uppercase' }}>
                {g.nombre}
              </strong>
            </a>

            {tabla.length === 0 ? (
              <p style={{ color: 'var(--tenue)', fontSize: 14, margin: 0 }}>
                {g.estado === 'finalizado' ? 'Sin puntajes calculados.' : 'Todavía no se corrió.'}
              </p>
            ) : (
              <div className="desglose">
                {tabla.slice(0, 3).map((p) => (
                  <div key={p.participante}>
                    <span>
                      {p.posicion}º {p.participante}
                    </span>
                    <span className="puntos">
                      {p.total_gp}
                      {!provisional && (
                        <span style={{ color: 'var(--tenue)', fontWeight: 400 }}>
                          {' · '}{p.puntos_f1} pts F1
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <div>
                  <span style={{ color: provisional ? 'var(--ambar)' : 'var(--tenue)' }}>
                    {provisional
                      ? `${tabla.length} puntuados · sólo la clasificación, orden provisional`
                      : `${tabla.length} participantes puntuados`}
                  </span>
                  <span className="puntos" style={{ fontWeight: 400 }}>
                    <a href={`/gp/${g.slug}`}>ver todo</a>
                  </span>
                </div>
                {(comodinesDe.get(g.id) ?? []).map((c) => (
                  <div key={`${c.participante}|${c.tipo}`}>
                    <span style={{ color: c.tipo === 'boost_ciegas' ? 'var(--ambar)' : 'var(--violeta)' }}>
                      {c.tipo === 'boost_ciegas' ? 'Boost a ciegas' : 'Boost'} · {c.participante}
                    </span>
                    <span className="puntos" style={{ fontWeight: 400, color: 'var(--tenue)' }}>×2 GP</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
