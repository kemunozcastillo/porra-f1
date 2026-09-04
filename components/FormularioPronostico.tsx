'use client';

import { useState, useTransition } from 'react';
import { guardarPronostico, declararComodin, retirarComodin, pronosticoAnterior, type TipoComodin } from '@/app/acciones';
import type { Prediccion } from '@/lib/puntaje';

interface Props {
  gpId: number;
  gpNombre: string;
  cierra: string;
  equipos: string[];
  pilotos: string[];
  compuestos: { codigo: string; nombre: string }[];
  inicial?: Partial<Prediccion>;
  /** Comodines que todavía no quemó en toda la temporada. */
  disponibles: TipoComodin[];
  /** Comodín ya declarado en esta ronda, si hay. */
  declarado: TipoComodin | null;
  /** Arranque de FP1: plazo del boost a ciegas. Null = no se puede declarar. */
  fp1: string | null;
}

const vacio = (n: number) => Array.from({ length: n }, () => '');

export default function FormularioPronostico({
  gpId, gpNombre, cierra, equipos, pilotos, compuestos,
  inicial = {}, disponibles, declarado, fp1,
}: Props) {
  const [qualyEquipos,   setQualyEquipos]   = useState<string[]>(inicial.qualy_equipos   ?? vacio(11));
  const [qualyPodio,     setQualyPodio]     = useState<string[]>(inicial.qualy_podio     ?? vacio(3));
  const [carreraEquipos, setCarreraEquipos] = useState<string[]>(inicial.carrera_equipos ?? vacio(11));
  const [carreraPodio,   setCarreraPodio]   = useState<string[]>(inicial.carrera_podio   ?? vacio(3));
  const [dotd,           setDotd]           = useState(inicial.dotd ?? '');
  const [vueltaRapida,   setVueltaRapida]   = useState(inicial.vuelta_rapida ?? '');
  const [interrupciones, setInterrupciones] = useState(String(inicial.interrupciones ?? ''));
  const [dnf,            setDnf]            = useState(String(inicial.dnf_dsq ?? ''));
  const [stints,         setStints]         = useState<string[]>(inicial.stints ?? vacio(5));
  const [comodin,        setComodin]        = useState<TipoComodin | null>(declarado);

  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const cambiar = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    indice: number, valor: string
  ) => setter((prev) => prev.map((v, i) => (i === indice ? valor : v)));

  function enviar() {
    const payload: Prediccion = {
      qualy_equipos: qualyEquipos,
      qualy_podio: qualyPodio,
      carrera_equipos: carreraEquipos,
      carrera_podio: carreraPodio,
      dotd: dotd || undefined,
      vuelta_rapida: vueltaRapida || undefined,
      interrupciones: interrupciones === '' ? undefined : Number(interrupciones),
      dnf_dsq: dnf === '' ? undefined : Number(dnf),
      stints: stints.filter(Boolean),
    };

    iniciar(async () => {
      const r = await guardarPronostico(gpId, payload);
      setAviso({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje });
    });
  }

  /**
   * Copia el pronóstico de la última ronda que jugó esta persona. Sólo
   * rellena: no manda nada, para que pueda repasarlo y retocar lo que
   * quiera antes de guardarlo.
   */
  function repetirAnterior() {
    iniciar(async () => {
      const r = await pronosticoAnterior(gpId);
      if (r.ok && r.payload) {
        const p = r.payload;
        setQualyEquipos(p.qualy_equipos   ?? vacio(11));
        setQualyPodio(p.qualy_podio       ?? vacio(3));
        setCarreraEquipos(p.carrera_equipos ?? vacio(11));
        setCarreraPodio(p.carrera_podio   ?? vacio(3));
        setDotd(p.dotd ?? '');
        setVueltaRapida(p.vuelta_rapida ?? '');
        setInterrupciones(p.interrupciones?.toString() ?? '');
        setDnf(p.dnf_dsq?.toString() ?? '');
        setStints([...(p.stints ?? []), ...vacio(5)].slice(0, 5));
      }
      setAviso({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje });
    });
  }

  function cambiarComodin(tipo: TipoComodin | null) {
    iniciar(async () => {
      const r = tipo
        ? await declararComodin(gpId, tipo)
        : comodin ? await retirarComodin(gpId, comodin) : { ok: true, mensaje: '' };
      if (r.ok) setComodin(tipo);
      if (r.mensaje) setAviso({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje });
    });
  }

  const Orden = ({
    titulo, valores, setter, opciones, prefijo = 'P',
  }: {
    titulo: string; valores: string[];
    setter: React.Dispatch<React.SetStateAction<string[]>>;
    opciones: string[]; prefijo?: string;
  }) => (
    <div className="tarjeta">
      <label className="suelto">{titulo}</label>
      <div className="rejilla dos">
        {valores.map((valor, i) => (
          <div className="campo" key={i}>
            <span className="marcador">{prefijo}{i + 1}</span>
            <select
              value={valor}
              aria-label={`${titulo} ${prefijo}${i + 1}`}
              onChange={(e) => cambiar(setter, i, e.target.value)}
            >
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
      <p className="rotulo">
        {gpNombre} · cierra {new Date(cierra).toLocaleString('es', {
          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
        })}
      </p>

      {aviso && <div className={`aviso ${aviso.tipo}`}>{aviso.texto}</div>}

      <div className="tarjeta">
        <label className="suelto">¿Sin tiempo?</label>
        <p style={{ margin: '0 0 12px', color: 'var(--tenue)', fontSize: 14 }}>
          Copia tu pronóstico de la ronda anterior y lo tienes listo. Puedes retocar lo que
          quieras antes de guardarlo; hasta que no le des a guardar no se manda nada.
        </p>
        <button className="boton secundario" onClick={repetirAnterior} disabled={pendiente}>
          {pendiente ? 'Copiando…' : 'Repetir mi pronóstico anterior'}
        </button>
      </div>

      <Orden titulo="Parrilla de clasificación · por equipo" valores={qualyEquipos} setter={setQualyEquipos} opciones={equipos} />
      <Orden titulo="Podio de clasificación · pilotos" valores={qualyPodio} setter={setQualyPodio} opciones={pilotos} />
      <Orden titulo="Orden de carrera · por equipo" valores={carreraEquipos} setter={setCarreraEquipos} opciones={equipos} />
      <Orden titulo="Podio de carrera · pilotos" valores={carreraPodio} setter={setCarreraPodio} opciones={pilotos} />

      <>
          <div className="tarjeta">
            <label className="suelto">Detalles de carrera</label>
            <div className="rejilla dos">
              <div>
                <label className="suelto" htmlFor="dotd">Piloto del día</label>
                <select id="dotd" value={dotd} onChange={(e) => setDotd(e.target.value)}>
                  <option value="">—</option>
                  {pilotos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="suelto" htmlFor="vr">Vuelta rápida</label>
                <select id="vr" value={vueltaRapida} onChange={(e) => setVueltaRapida(e.target.value)}>
                  <option value="">—</option>
                  {pilotos.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="suelto" htmlFor="int">Interrupciones (SC + bandera roja)</label>
                <input id="int" type="number" min={0} max={20} value={interrupciones}
                       onChange={(e) => setInterrupciones(e.target.value)} />
              </div>
              <div>
                <label className="suelto" htmlFor="dnf">Abandonos y descalificaciones</label>
                <input id="dnf" type="number" min={0} max={22} value={dnf}
                       onChange={(e) => setDnf(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="tarjeta">
            <label className="suelto">Estrategia del ganador · deja en blanco los stints que no uses</label>
            <div className="rejilla dos">
              {stints.map((valor, i) => (
                <div className="campo" key={i}>
                  <span className="marcador">S{i + 1}</span>
                  <select value={valor} aria-label={`Stint ${i + 1}`}
                          onChange={(e) => cambiar(setStints, i, e.target.value)}>
                    <option value="">—</option>
                    {compuestos.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
      </>

      <button className="boton" onClick={enviar} disabled={pendiente}>
        {pendiente ? 'Guardando…' : 'Guardar pronóstico'}
      </button>

      <div className="tarjeta" style={{ marginTop: 28 }}>
          <label className="suelto">Comodín de la ronda</label>
          <p style={{ marginTop: 0, color: 'var(--tenue)', fontSize: 14 }}>
            Duplica lo que saques en el Gran Premio. El sprint no se dobla. Se declara
            aparte del pronóstico porque tiene su propio plazo, y una vez que vence
            queda quemado igual.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`boton ${comodin === null ? '' : 'secundario'}`}
              disabled={pendiente}
              onClick={() => cambiarComodin(null)}
            >
              Sin comodín
            </button>

            {(disponibles.includes('boost') || comodin === 'boost') && (
              <button
                className={`boton ${comodin === 'boost' ? '' : 'secundario'}`}
                disabled={pendiente}
                onClick={() => cambiarComodin('boost')}
              >
                Boost · hasta el cierre
              </button>
            )}

            {(disponibles.includes('boost_ciegas') || comodin === 'boost_ciegas') && (
              <button
                className={`boton ${comodin === 'boost_ciegas' ? '' : 'secundario'}`}
                disabled={pendiente || (!fp1 && comodin !== 'boost_ciegas')}
                onClick={() => cambiarComodin('boost_ciegas')}
                title={fp1 ? undefined : 'Esta ronda no tiene FP1 cargada'}
              >
                Boost a ciegas · hasta FP1
              </button>
            )}
          </div>

          {fp1 && (
            <p style={{ marginBottom: 0, color: 'var(--tenue)', fontSize: 13 }}>
              La FP1 arranca el {new Date(fp1).toLocaleString('es', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
              })}. Después de esa hora el boost a ciegas ya no se puede declarar.
            </p>
          )}

          {!disponibles.length && !comodin && (
            <p style={{ marginBottom: 0, color: 'var(--ambar)', fontSize: 13 }}>
              Ya usaste los dos comodines de la temporada.
            </p>
          )}
      </div>
    </>
  );
}
