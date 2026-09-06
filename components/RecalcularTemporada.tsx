'use client';

import { useState, useTransition } from 'react';
import { recalcularTodo } from '@/app/acciones';

/**
 * Rehacer la temporada entera es idempotente y no pierde nada: todo sale
 * de los pronósticos y los resultados guardados. Pero recorre las 24
 * rondas y tarda, así que pide confirmación en vez de dispararse de un
 * clic despistado.
 */
export default function RecalcularTemporada() {
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [pendiente, iniciar] = useTransition();

  function lanzar() {
    setConfirmando(false);
    iniciar(async () => setAviso(await recalcularTodo()));
  }

  return (
    <div className="tarjeta" style={{ marginTop: 28 }}>
      <label className="suelto">Recalcular la temporada</label>
      <p style={{ margin: '0 0 12px', color: 'var(--tenue)', fontSize: 14 }}>
        Rehace los puntajes de las 24 rondas. Tarda unos segundos.
      </p>

      {aviso && (
        <div className={`aviso ${aviso.ok ? 'ok' : 'error'}`} style={{ marginBottom: 12 }}>
          {aviso.mensaje}
        </div>
      )}

      {confirmando ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="boton" onClick={lanzar} disabled={pendiente}>
            Sí, recalcular
          </button>
          <button className="boton secundario" onClick={() => setConfirmando(false)} disabled={pendiente}>
            Cancelar
          </button>
        </div>
      ) : (
        <button className="boton secundario" onClick={() => setConfirmando(true)} disabled={pendiente}>
          {pendiente ? 'Recalculando…' : 'Recalcular temporada'}
        </button>
      )}
    </div>
  );
}
