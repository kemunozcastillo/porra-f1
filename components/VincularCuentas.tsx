'use client';

import { useState, useTransition } from 'react';
import { vincularPerfil, desvincularParticipante } from '@/app/acciones';

export interface Perfil {
  id: string;
  nombre: string;
  avatar_url: string | null;
  es_admin: boolean;
  creado_at: string;
}

export interface Participante {
  nombre: string;
  tipo: string;
  perfil_id: string | null;
}

  interface Props {
  perfiles: Perfil[];
  participantes: Participante[];
}

export default function VincularCuentas({ perfiles, participantes }: Props) {
  const [elegido, setElegido] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const participanteDe = new Map(
    participantes.filter((p) => p.perfil_id).map((p) => [p.perfil_id as string, p])
  );
  const libres = participantes.filter((p) => !p.perfil_id);
  const sinCuenta = libres.filter((p) => p.tipo === 'humano');

  function vincular(perfilId: string) {
    const quien = elegido[perfilId];
    if (!quien) return;
    iniciar(async () => setAviso(await vincularPerfil(perfilId, quien)));
  }

  function desvincular(nombre: string) {
    iniciar(async () => setAviso(await desvincularParticipante(nombre)));
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <>
      {aviso && <div className={`aviso ${aviso.ok ? 'ok' : 'error'}`}>{aviso.mensaje}</div>}

      {perfiles.length === 0 ? (
        <div className="vacio">
          Todavía no ha entrado nadie con Discord.
        </div>
      ) : (
        perfiles.map((pe) => {
          const ligado = participanteDe.get(pe.id);
          return (
            <div className="tarjeta" key={pe.id}>
              <div className="rejilla dos" style={{ alignItems: 'end' }}>
                <div>
                  <label className="suelto">
                    Entró el {fecha(pe.creado_at)}
                    {pe.es_admin && ' · admin'}
                  </label>
                  <strong style={{ fontFamily: 'var(--display)', fontSize: 20, textTransform: 'uppercase' }}>
                    {pe.nombre}
                  </strong>
                  {ligado && (
                    <p style={{ margin: '6px 0 0', color: 'var(--verde)', fontSize: 14 }}>
                      Vinculada a <strong>{ligado.nombre}</strong>
                    </p>
                  )}
                </div>

                <div>
                  {ligado ? (
                    <button className="boton secundario" disabled={pendiente}
                            onClick={() => desvincular(ligado.nombre)}>
                      {pendiente ? 'Guardando…' : 'Desvincular'}
                    </button>
                  ) : sinCuenta.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--tenue)', fontSize: 14 }}>
                      No queda ningún participante libre.
                    </p>
                  ) : (
                    <>
                      <label className="suelto" htmlFor={`sel-${pe.id}`}>Asociar con</label>
                      <select id={`sel-${pe.id}`} value={elegido[pe.id] ?? ''}
                              onChange={(e) => setElegido({ ...elegido, [pe.id]: e.target.value })}>
                        <option value="">—</option>
                        {sinCuenta.map((p) => (
                          <option key={p.nombre} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                      <button className="boton" style={{ marginTop: 10 }}
                              disabled={pendiente || !elegido[pe.id]}
                              onClick={() => vincular(pe.id)}>
                        {pendiente ? 'Guardando…' : 'Vincular'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {sinCuenta.length > 0 && (
        <div className="tarjeta">
          <label className="suelto">Participantes sin cuenta ({sinCuenta.length})</label>
          <p style={{ margin: 0, color: 'var(--tenue)', fontSize: 14 }}>
            {sinCuenta.map((p) => p.nombre).join(' · ')}
          </p>
        </div>
      )}
    </>
  );
}
