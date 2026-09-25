import { clienteServidor } from '@/lib/supabase';
import { notFound } from 'next/navigation';

export const revalidate = 60;

const ETIQUETAS: Record<string, string> = {
  qualy_equipos: 'Parrilla de clasificación',
  qualy_podio: 'Podio de clasificación',
  carrera_equipos: 'Orden de carrera',
  carrera_podio: 'Podio de carrera',
  dotd: 'Piloto del día',
  interrupciones: 'Interrupciones',
  vuelta_rapida: 'Vuelta rápida',
  estrategia: 'Estrategia',
  dnf_dsq: 'Abandonos',
};

export default async function DetalleGP({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await clienteServidor();

  const { data: gp } = await supabase.from('gps').select('*').eq('slug', slug).maybeSingle();
  if (!gp) notFound();

  const [{ data: puntajes }, { data: posiciones }, { data: comodines }] = await Promise.all([
    supabase.from('puntajes').select('participante, sesion, puntos, detalle').eq('gp_id', gp.id),
    supabase.from('posiciones_gp').select('*').eq('gp_id', gp.id).order('posicion'),
    supabase.from('comodines').select('participante, tipo').eq('gp_id', gp.id),
  ]);

  const soloGp = (puntajes ?? []).filter((p) => p.sesion === 'gp');
  const detalleDe = new Map(soloGp.map((p) => [p.participante, p.detalle]));
  // Lo que sumó el boost es el puntaje de la sesión de Gran Premio, que
  // se cobra una segunda vez. El sprint nunca se dobla.
  const puntajeGpDe = new Map(soloGp.map((p) => [p.participante, p.puntos as number]));
  const comodinDe = new Map((comodines ?? []).map((c) => [c.participante, c.tipo as string]));

  // Con sólo la clasificación cargada, `posiciones_gp` está vacía a
  // propósito: el podio de la ronda espera a la carrera. Pero los
  // puntajes sí existen, así que se muestran igual en un orden
  // provisional, sin medallas ni puntos F1, que es lo que todavía no
  // está decidido.
  const provisional = !posiciones?.length;
  const totalPorParticipante = new Map<string, number>();
  (puntajes ?? []).forEach((p) => {
    totalPorParticipante.set(
      p.participante,
      (totalPorParticipante.get(p.participante) ?? 0) + (p.puntos as number)
    );
  });

  const filas = provisional
    ? [...totalPorParticipante]
        .map(([participante, total_gp]) => ({
          participante, total_gp,
          posicion: 0, medalla: 0, puntos_f1: 0,
        }))
        .sort((a, b) => b.total_gp - a.total_gp || a.participante.localeCompare(b.participante))
        .map((f, i) => ({ ...f, posicion: i + 1 }))
    : posiciones!;

  return (
    <>
      <p className="rotulo">Ronda {gp.ronda} · {gp.circuito} · {gp.tipo === 'sprint' ? 'fin de semana sprint' : 'formato normal'}</p>
      <h1 className="titulo">{gp.nombre}</h1>

      {provisional && filas.length > 0 && (
        <div className="aviso">
          Puntaje provisional, sólo está cargada la clasificación.
        </div>
      )}

      {filas.length === 0 ? (
        <div className="vacio">Esta ronda todavía no tiene resultados publicados.</div>
      ) : (
        <div className="torre">
          {filas.map((f) => {
            const detalle = (detalleDe.get(f.participante) ?? {}) as Record<string, number>;
            return (
              <details key={f.participante} className={`fila ${provisional ? '' : f.posicion === 1 ? 'lider' : f.posicion <= 3 ? 'podio' : ''}`} style={{ display: 'block' }}>
                <summary style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto auto', gap: 14, alignItems: 'center', cursor: 'pointer', listStyle: 'none' }}>
                  <span className="pos">{f.posicion}</span>
                  <span className="nombre">
                    {f.participante}
                    {comodinDe.has(f.participante) && (
                      <span className="comodin" data-tipo={comodinDe.get(f.participante)}>
                        {comodinDe.get(f.participante) === 'boost_ciegas' ? 'BOOST A CIEGAS'
                          : comodinDe.get(f.participante) === 'cambio' ? 'CAMBIO' : 'BOOST'}
                      </span>
                    )}
                  </span>
                  <span className="gap">{!provisional && f.puntos_f1 ? `${f.puntos_f1} pts F1` : ''}</span>
                  <span className="total">{f.total_gp}</span>
                </summary>
                <div className="desglose" style={{ marginTop: 12 }}>
                  {Object.entries(detalle).map(([clave, valor]) => (
                    <div key={clave}>
                      <span>{ETIQUETAS[clave] ?? clave}</span>
                      <span className="puntos" data-cero={valor === 0 ? 'si' : 'no'}>{valor}</span>
                    </div>
                  ))}
                  {comodinDe.get(f.participante) === 'cambio' && (
                    <div>
                      <span style={{ color: 'var(--verde)' }}>Cambio · rehizo la carrera</span>
                      <span className="puntos" data-cero="si">0</span>
                    </div>
                  )}
                  {comodinDe.has(f.participante) && comodinDe.get(f.participante) !== 'cambio' && (
                    <div>
                      <span style={{ color: comodinDe.get(f.participante) === 'boost_ciegas' ? 'var(--ambar)' : 'var(--violeta)' }}>
                        {comodinDe.get(f.participante) === 'boost_ciegas' ? 'Boost a ciegas' : 'Boost'}
                        {' · duplica el Gran Premio'}
                      </span>
                      <span className="puntos">+{puntajeGpDe.get(f.participante) ?? 0}</span>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
