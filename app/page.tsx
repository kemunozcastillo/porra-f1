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

export default async function Clasificacion({
  searchParams,
}: { searchParams: Promise<{ tabla?: string }> }) {
  const { tabla } = await searchParams;
  const esF1 = tabla === 'f1';
  const supabase = await clienteServidor();

  const [acumulado, campeonato, { data: gps }, { data: posiciones }] = await Promise.all([
    supabase.from('clasificacion').select('*'),
    supabase.from('campeonato_f1').select('*'),
    supabase.from('gps').select('id, ronda, nombre, slug, estado').order('ronda'),
    supabase.from('posiciones_gp').select('participante, gp_id, medalla'),
  ]);

  const medallaDe = new Map<string, number>();
  posiciones?.forEach((p) => medallaDe.set(`${p.participante}|${p.gp_id}`, p.medalla));

  const filas = esF1
    ? ((campeonato.data ?? []) as FilaF1[])
    : ((acumulado.data ?? []) as FilaAcumulado[]);

  const valorDe = (f: FilaAcumulado | FilaF1) =>
    esF1 ? (f as FilaF1).puntos : (f as FilaAcumulado).total;

  const lider = filas.length ? valorDe(filas[0]) : 0;
  const disputadas = gps?.filter((g) => g.estado === 'finalizado').length ?? 0;
  const proximo = gps?.find((g) => g.estado === 'abierto') ?? gps?.find((g) => g.estado === 'proximo');

  return (
    <>
      <p className="rotulo">Temporada 2026 · {disputadas} rondas disputadas</p>
      <h1 className="titulo">
        {esF1 ? <>Campeonato<br />paralelo</> : <>La tabla<br />no miente</>}
      </h1>
      <p className="subtitulo">
        {esF1
          ? 'Puntos de F1 según tu posición en cada ronda: 25 al que gana el fin de semana, 18 al segundo, y así hasta el décimo. Ganar por un punto vale lo mismo que ganar por cuarenta.'
          : 'Suma de todo lo que acertaste, más las medallas por ganar una ronda y el boost si lo quemaste.'}
      </p>

      <nav className="nav" style={{ marginBottom: 22 }}>
        <a href="/" aria-current={!esF1 ? 'page' : undefined}>Acumulado</a>
        <a href="/?tabla=f1" aria-current={esF1 ? 'page' : undefined}>Puntos F1</a>
      </nav>

      {filas.length === 0 ? (
        <div className="vacio">Todavía no hay puntajes cargados.</div>
      ) : (
        <div className="torre">
          {filas.map((f, i) => (
            <div key={f.participante} className={`fila ${i === 0 ? 'lider' : i < 3 ? 'podio' : ''}`}>
              <div className="pos">{i + 1}</div>
              <div className="nombre">
                {f.participante}
                {f.tipo !== 'humano' && <span className="etiqueta-ia">{f.tipo}</span>}
              </div>
              <div className="gap">
                {esF1
                  ? `${(f as FilaF1).victorias} vict · ${(f as FilaF1).podios} podios`
                  : i === 0 ? 'líder' : `+${lider - valorDe(f)}`}
              </div>
              <div className="total">{valorDe(f)}</div>
              <div className="tira" aria-hidden>
                {gps?.map((g) => {
                  const m = medallaDe.get(`${f.participante}|${g.id}`);
                  return (
                    <span
                      key={g.id}
                      className="bloque"
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
