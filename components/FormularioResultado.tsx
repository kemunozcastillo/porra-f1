'use client';

import { useEffect, useState, useTransition } from 'react';
import { publicarResultado, type BloqueResultado } from '@/app/acciones';
import type { Resultado, Sesion } from '@/lib/puntaje';

interface Props {
  gps: { id: number; ronda: number; nombre: string; tipo: string }[];
  equipos: string[];
  pilotos: string[];
  compuestos: { codigo: string; nombre: string }[];
  resultados: { gp_id: number; sesion: string; payload: Partial<Resultado> }[];
}

const vacio = (n: number) => Array.from({ length: n }, () => '');

/** Rellena `n` casillas con lo que hubiera guardado, sin desbordar. */
const desde = (lista: readonly string[] | undefined, n: number) =>
  Array.from({ length: n }, (_, i) => lista?.[i] ?? '');

export default function FormularioResultado({ gps, equipos, pilotos, compuestos, resultados }: Props) {
  const [gpId, setGpId] = useState(gps[0]?.id ?? 0);
  const [sesion, setSesion] = useState<Sesion>('gp');
  const [bloque, setBloque] = useState<BloqueResultado>('qualy');

  const [qe, setQe] = useState(vacio(11));
  const [qp, setQp] = useState(vacio(5));
  const [ce, setCe] = useState(vacio(11));
  const [cp, setCp] = useState(vacio(5));
  const [dotd, setDotd] = useState('');
  const [vr, setVr] = useState('');
  const [inter, setInter] = useState('');
  const [dnf, setDnf] = useState('');
  const [stints, setStints] = useState(vacio(5));

  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const gp = gps.find((g) => g.id === gpId);
  const guardado = resultados.find((r) => r.gp_id === gpId && r.sesion === sesion)?.payload;
  const tieneQualy = !!guardado?.qualy_equipos?.some(Boolean);
  const tieneCarrera = !!guardado?.carrera_equipos?.some(Boolean);

  // Al cambiar de ronda o de sesión se recarga lo que ya esté guardado.
  // Corregir una sola posición no debe obligar a teclear las once, y un
  // formulario en blanco sobre datos existentes invita a pisarlos.
  useEffect(() => {
    const g = resultados.find((r) => r.gp_id === gpId && r.sesion === sesion)?.payload;
    setQe(desde(g?.qualy_equipos, 11));
    setQp(desde(g?.qualy_podio, 5));
    setCe(desde(g?.carrera_equipos, 11));
    setCp(desde(g?.carrera_podio, 5));
    setDotd(g?.dotd ?? '');
    setVr(g?.vuelta_rapida ?? '');
    setInter(g?.interrupciones?.toString() ?? '');
    setDnf(g?.dnf_dsq?.toString() ?? '');
    setStints(desde(g?.stints, 5));
    setAviso(null);
  }, [gpId, sesion, resultados]);

  const cambiar = (
    setter: React.Dispatch<React.SetStateAction<string[]>>, i: number, v: string
  ) => setter((prev) => prev.map((x, j) => (j === i ? v : x)));

  function publicar() {
    const datos: Partial<Resultado> =
      bloque === 'qualy'
        ? { qualy_equipos: qe, qualy_podio: qp }
        : {
            carrera_equipos: ce,
            carrera_podio: cp,
            // El sprint no puntúa detalles, así que no se guardan.
            ...(sesion === 'gp' ? {
              dotd: dotd || undefined,
              vuelta_rapida: vr || undefined,
              interrupciones: inter === '' ? undefined : Number(inter),
              dnf_dsq: dnf === '' ? undefined : Number(dnf),
              stints: stints.filter(Boolean),
            } : {}),
          };

    iniciar(async () => {
      const r = await publicarResultado(gpId, sesion, bloque, datos);
      setAviso({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje });
    });
  }

  const Orden = ({ titulo, valores, setter, opciones }: {
    titulo: string; valores: string[];
    setter: React.Dispatch<React.SetStateAction<string[]>>; opciones: string[];
  }) => (
    <div className="tarjeta">
      <label className="suelto">{titulo}</label>
      <div className="rejilla dos">
        {valores.map((v, i) => (
          <div className="campo" key={i}>
            <span className="marcador">P{i + 1}</span>
            <select value={v} aria-label={`${titulo} P${i + 1}`}
                    onChange={(e) => cambiar(setter, i, e.target.value)}>
              <option value="">—</option>
              {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}

      <div className="tarjeta">
        <div className="rejilla dos">
          <div>
            <label className="suelto" htmlFor="gp">Ronda</label>
            <select id="gp" value={gpId} onChange={(e) => setGpId(Number(e.target.value))}>
              {gps.map((g) => <option key={g.id} value={g.id}>R{g.ronda} · {g.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="suelto" htmlFor="sesion">Sesión</label>
            <select id="sesion" value={sesion} onChange={(e) => setSesion(e.target.value as Sesion)}>
              <option value="gp">Gran Premio</option>
              <option value="sprint" disabled={gp?.tipo !== 'sprint'}>
                Sprint{gp?.tipo !== 'sprint' ? ' · esta ronda no tiene' : ''}
              </option>
            </select>
          </div>
        </div>

        <label className="suelto" style={{ marginTop: 16 }}>Qué vas a cargar</label>
        <div className="filtros">
          <button type="button" className="pestana" aria-current={bloque === 'qualy' ? 'page' : undefined}
                  onClick={() => setBloque('qualy')}>
            Clasificación <span className="cuenta">{tieneQualy ? '✓' : '—'}</span>
          </button>
          <button type="button" className="pestana" aria-current={bloque === 'carrera' ? 'page' : undefined}
                  onClick={() => setBloque('carrera')}>
            Carrera <span className="cuenta">{tieneCarrera ? '✓' : '—'}</span>
          </button>
        </div>
        <p style={{ margin: '10px 0 0', color: 'var(--tenue)', fontSize: 13 }}>
          {tieneCarrera
            ? 'Esta sesión está completa. Lo que guardes corrige sólo el bloque elegido.'
            : tieneQualy
              ? 'La clasificación ya está cargada. Las medallas y los puntos F1 de la ronda se reparten en cuanto guardes la carrera.'
              : 'Todavía no hay nada cargado en esta sesión.'}
        </p>
      </div>

      {bloque === 'qualy' ? (
        <>
          <Orden titulo="Parrilla de clasificación · equipos" valores={qe} setter={setQe} opciones={equipos} />
          <Orden titulo="Top 5 de clasificación · pilotos" valores={qp} setter={setQp} opciones={pilotos} />
        </>
      ) : (
        <>
          <Orden titulo="Orden de carrera · equipos" valores={ce} setter={setCe} opciones={equipos} />
          <Orden titulo="Top 5 de carrera · pilotos" valores={cp} setter={setCp} opciones={pilotos} />

          {sesion === 'gp' && (
            <div className="tarjeta">
              <label className="suelto">Detalles</label>
              <div className="rejilla dos">
                <div>
                  <label className="suelto" htmlFor="a-dotd">Piloto del día</label>
                  <select id="a-dotd" value={dotd} onChange={(e) => setDotd(e.target.value)}>
                    <option value="">—</option>
                    {pilotos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="suelto" htmlFor="a-vr">Vuelta rápida</label>
                  <select id="a-vr" value={vr} onChange={(e) => setVr(e.target.value)}>
                    <option value="">—</option>
                    {pilotos.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="suelto" htmlFor="a-int">Interrupciones</label>
                  <input id="a-int" type="number" min={0} value={inter} onChange={(e) => setInter(e.target.value)} />
                </div>
                <div>
                  <label className="suelto" htmlFor="a-dnf">Abandonos y DSQ</label>
                  <input id="a-dnf" type="number" min={0} value={dnf} onChange={(e) => setDnf(e.target.value)} />
                </div>
              </div>
              <label className="suelto" style={{ marginTop: 16 }}>
                Estrategia del ganador · deja en blanco los stints que no uses
              </label>
              <div className="rejilla dos">
                {stints.map((v, i) => (
                  <div className="campo" key={i}>
                    <span className="marcador">S{i + 1}</span>
                    <select value={v} aria-label={`Stint ${i + 1}`}
                            onChange={(e) => cambiar(setStints, i, e.target.value)}>
                      <option value="">—</option>
                      {compuestos.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <button className="boton" onClick={publicar} disabled={pendiente}>
        {pendiente ? 'Publicando…' : bloque === 'qualy' ? 'Publicar clasificación' : 'Publicar carrera'}
      </button>
    </>
  );
}
