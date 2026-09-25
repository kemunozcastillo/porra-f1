'use client';

import { useState, useTransition } from 'react';
import { usarCambio, type CarreraEditable } from '@/app/acciones';
import type { Prediccion } from '@/lib/puntaje';

interface Props {
  gpId: number;
  equipos: string[];
  pilotos: string[];
  compuestos: { codigo: string; nombre: string }[];
  /** Lo que mandó en su momento, para partir de ahí. */
  actual: Partial<Prediccion>;
  /** Largada de la carrera: cuándo se cierra el comodín. */
  carrera: string;
}

const vacio = (n: number) => Array.from({ length: n }, () => '');
const desde = (lista: readonly string[] | undefined, n: number) =>
  Array.from({ length: n }, (_, i) => lista?.[i] ?? '');

export default function ComodinCambio({ gpId, equipos, pilotos, compuestos, actual, carrera }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const [ce, setCe] = useState(desde(actual.carrera_equipos, 11));
  const [cp, setCp] = useState(desde(actual.carrera_podio, 3));
  const [dotd, setDotd] = useState(actual.dotd ?? '');
  const [vr, setVr] = useState(actual.vuelta_rapida ?? '');
  const [inter, setInter] = useState(actual.interrupciones?.toString() ?? '');
  const [dnf, setDnf] = useState(actual.dnf_dsq?.toString() ?? '');
  const [stints, setStints] = useState(desde(actual.stints, 5) || vacio(5));

  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cambiar = (
    setter: React.Dispatch<React.SetStateAction<string[]>>, i: number, v: string
  ) => setter((prev) => prev.map((x, j) => (j === i ? v : x)));

  function guardar() {
    setConfirmando(false);
    const datos: CarreraEditable = {
      carrera_equipos: ce,
      carrera_podio: cp,
      dotd: dotd || undefined,
      vuelta_rapida: vr || undefined,
      interrupciones: inter === '' ? undefined : Number(inter),
      dnf_dsq: dnf === '' ? undefined : Number(dnf),
      stints: stints.filter(Boolean),
    };
    iniciar(async () => setAviso(await usarCambio(gpId, datos)));
  }

  const Orden = ({ titulo, valores, setter, opciones }: {
    titulo: string; valores: string[];
    setter: React.Dispatch<React.SetStateAction<string[]>>; opciones: string[];
  }) => (
    <>
      <label className="suelto" style={{ marginTop: 16 }}>{titulo}</label>
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
    </>
  );

  const cierre = new Date(carrera).toLocaleString('es', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  if (aviso?.ok) {
    return <div className="aviso ok" style={{ marginTop: 28 }}>{aviso.mensaje}</div>;
  }

  return (
    <div className="tarjeta" style={{ marginTop: 28 }}>
      <label className="suelto" style={{ color: 'var(--verde)' }}>Comodín Cambio</label>
      <p style={{ margin: '0 0 12px', color: 'var(--tenue)', fontSize: 14 }}>
        Rehaz tu carrera con la clasificación ya corrida. Uno por temporada, cierra el {cierre}.
        Tu pronóstico de clasificación no se toca y sigue puntuando.
      </p>

      {aviso && !aviso.ok && <div className="aviso error">{aviso.mensaje}</div>}

      {!abierto ? (
        <button className="boton secundario" onClick={() => setAbierto(true)}>
          Usar el Cambio
        </button>
      ) : (
        <>
          <Orden titulo="Orden de carrera · por equipo" valores={ce} setter={setCe} opciones={equipos} />
          <Orden titulo="Podio de carrera · pilotos" valores={cp} setter={setCp} opciones={pilotos} />

          <div className="rejilla dos" style={{ marginTop: 16 }}>
            <div>
              <label className="suelto" htmlFor="c-dotd">Piloto del día</label>
              <select id="c-dotd" value={dotd} onChange={(e) => setDotd(e.target.value)}>
                <option value="">—</option>
                {pilotos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="suelto" htmlFor="c-vr">Vuelta rápida</label>
              <select id="c-vr" value={vr} onChange={(e) => setVr(e.target.value)}>
                <option value="">—</option>
                {pilotos.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="suelto" htmlFor="c-int">Interrupciones</label>
              <input id="c-int" type="number" min={0} value={inter} onChange={(e) => setInter(e.target.value)} />
            </div>
            <div>
              <label className="suelto" htmlFor="c-dnf">Abandonos y DSQ</label>
              <input id="c-dnf" type="number" min={0} value={dnf} onChange={(e) => setDnf(e.target.value)} />
            </div>
          </div>

          <label className="suelto" style={{ marginTop: 16 }}>Estrategia del ganador</label>
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
            {confirmando ? (
              <>
                <button className="boton" onClick={guardar} disabled={pendiente}>
                  {pendiente ? 'Guardando…' : 'Sí, quemar el Cambio'}
                </button>
                <button className="boton secundario" onClick={() => setConfirmando(false)} disabled={pendiente}>
                  Cancelar
                </button>
              </>
            ) : (
              <button className="boton" onClick={() => setConfirmando(true)} disabled={pendiente}>
                Guardar y quemar el Cambio
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
