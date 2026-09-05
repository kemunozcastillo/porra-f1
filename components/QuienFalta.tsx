'use client';

import { useState } from 'react';

interface Props {
  gps: { id: number; ronda: number; nombre: string; estado: string; cierra_at: string | null }[];
  participantes: { nombre: string; tipo: string }[];
  /** Sólo quién y cuándo: el contenido del pronóstico no hace falta aquí. */
  enviados: { gp_id: number; participante: string; enviado_at: string | null }[];
  gpInicial: number;
}

export default function QuienFalta({ gps, participantes, enviados, gpInicial }: Props) {
  const [gpId, setGpId] = useState(gpInicial);

  const gp = gps.find((g) => g.id === gpId);
  const deEstaRonda = new Map(
    enviados.filter((e) => e.gp_id === gpId).map((e) => [e.participante, e.enviado_at])
  );

  const humanos = participantes.filter((p) => p.tipo === 'humano');
  const ias = participantes.filter((p) => p.tipo === 'ia');

  const faltanHumanos = humanos.filter((p) => !deEstaRonda.has(p.nombre));
  const faltanIas = ias.filter((p) => !deEstaRonda.has(p.nombre));

  const cerrado = !!gp?.cierra_at && new Date(gp.cierra_at) < new Date();
  const cuando = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString('es', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }) : 'sin hora';

  const Lista = ({ titulo, gente, vacio, color }: {
    titulo: string; gente: { nombre: string }[]; vacio: string; color?: string;
  }) => (
    <div className="tarjeta">
      <label className="suelto" style={color && gente.length ? { color } : undefined}>
        {titulo} ({gente.length})
      </label>
      {gente.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--tenue)', fontSize: 14 }}>{vacio}</p>
      ) : (
        <div className="desglose">
          {gente.map((p) => (
            <div key={p.nombre}>
              <span>{p.nombre}</span>
              <span className="puntos" style={{ fontWeight: 400, color: 'var(--tenue)', fontSize: 13 }}>
                {deEstaRonda.has(p.nombre) ? cuando(deEstaRonda.get(p.nombre)) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="tarjeta">
        <label className="suelto" htmlFor="falta-gp">Ronda</label>
        <select id="falta-gp" value={gpId} onChange={(e) => setGpId(Number(e.target.value))}>
          {gps.map((g) => (
            <option key={g.id} value={g.id}>
              R{g.ronda} · {g.nombre}
              {g.estado === 'abierto' ? ' · abierta' : ''}
            </option>
          ))}
        </select>
        <p style={{ margin: '10px 0 0', color: cerrado ? 'var(--ambar)' : 'var(--tenue)', fontSize: 13 }}>
          {gp?.cierra_at
            ? cerrado
              ? `El cierre fue el ${cuando(gp.cierra_at)}. Se puede mandar igual, pero lo ya corrido no puntúa.`
              : `Cierra el ${cuando(gp.cierra_at)}.`
            : 'Esta ronda no tiene hora de cierre cargada.'}
        </p>
      </div>

      <Lista
        titulo="Falta que manden"
        gente={faltanHumanos}
        vacio="Han mandado todos."
        color="var(--ambar)"
      />

      <Lista
        titulo="IAs sin cargar"
        gente={faltanIas}
        vacio="Están todas cargadas."
        color="var(--ambar)"
      />

      <Lista
        titulo="Ya enviados"
        gente={[...humanos, ...ias].filter((p) => deEstaRonda.has(p.nombre))}
        vacio="Todavía no ha mandado nadie."
      />
    </>
  );
}
