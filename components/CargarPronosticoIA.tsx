'use client';

import { useMemo, useState, useTransition } from 'react';
import { cargarPronosticoIA, generarPronosticoReplica } from '@/app/acciones';
import { plantillaPrediccion, type Catalogos } from '@/lib/prediccion-json';

  interface Props {
  gps: { id: number; ronda: number; nombre: string; tipo: string }[];
  ias: string[];
  catalogos: Catalogos;
}

export default function CargarPronosticoIA({ gps, ias, catalogos }: Props) {
  const [gpId, setGpId] = useState(gps[0]?.id ?? 0);
  const [quien, setQuien] = useState(ias[0] ?? '');
  const [texto, setTexto] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; mensaje: string; errores?: string[]; avisos?: string[] } | null>(null);
  const [pendiente, iniciar] = useTransition();

  const gp = gps.find((g) => g.id === gpId);

  const instrucciones = useMemo(() => {
    if (!gp) return '';
    const plantilla = plantillaPrediccion(gp.nombre, catalogos);
    return [
      `Eres participante de una porra de Fórmula 1. Tienes que pronosticar el Gran Premio de ${gp.nombre} (ronda ${gp.ronda}${gp.tipo === 'sprint' ? ', fin de semana con sprint' : ''}).`,
      '',
      'Devuelve ÚNICAMENTE un objeto JSON con esta forma exacta, sin texto alrededor y sin bloque de código:',
      '',
      JSON.stringify(plantilla, null, 2),
      '',
      'Reglas:',
      '- `qualy_equipos` y `carrera_equipos`: los 11 equipos ordenados de primero a último. Todos, sin repetir.',
      '- `qualy_podio` y `carrera_podio`: 3 pilotos, en orden.',
      '- `dotd` es el piloto del día y `vuelta_rapida` quien marca la vuelta rápida.',
      '- `interrupciones`: cuántos coches de seguridad y banderas rojas habrá, en total.',
      '- `dnf_dsq`: cuántos coches abandonan o son descalificados.',
      '- `stints`: la estrategia de neumáticos del ganador, en orden. Por ejemplo ["M","H"] para media y luego dura.',
      '- Usa exactamente los nombres de las listas `_equipos_admitidos`, `_pilotos_admitidos` y `_compuestos_admitidos`.',
      '- Borra del JSON las tres claves que empiezan con guion bajo antes de devolverlo.',
      '',
      'Cómo se puntúa, por si te ayuda a decidir: 5 puntos por cada posición exacta, 3 si te equivocas por un lugar y 1 si te equivocas por dos. Los podios se comparan contra las cinco primeras posiciones reales, así que un piloto que termina cuarto todavía suma. Piloto del día, vuelta rápida, interrupciones y abandonos dan 5 puntos cada uno si son exactos.',
    ].join('\n');
  }, [gp, catalogos]);

  function copiar() {
    navigator.clipboard.writeText(instrucciones).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  function cargar() {
    iniciar(async () => setRes(await cargarPronosticoIA(quien, gpId, texto)));
  }

  function replica() {
    iniciar(async () => setRes(await generarPronosticoReplica(gpId)));
  }

  return (
    <>
      <div className="tarjeta">
        <div className="rejilla dos">
          <div>
            <label className="suelto" htmlFor="ia-gp">Ronda</label>
            <select id="ia-gp" value={gpId} onChange={(e) => { setGpId(Number(e.target.value)); setRes(null); }}>
              {gps.map((g) => <option key={g.id} value={g.id}>R{g.ronda} · {g.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="suelto" htmlFor="ia-quien">Participante</label>
            <select id="ia-quien" value={quien} onChange={(e) => setQuien(e.target.value)}>
              {ias.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="tarjeta">
        <label className="suelto">1 · Lo que le pasas a la IA</label>
        <p style={{ color: 'var(--tenue)', fontSize: 14, margin: '0 0 12px' }}>
          Lleva incrustados los nombres admitidos.
        </p>
        <textarea readOnly value={instrucciones} rows={10}
                  aria-label="Instrucciones para la IA"
                  style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 12 }} />
        <button className="boton secundario" onClick={copiar} style={{ marginTop: 10 }}>
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <div className="tarjeta">
        <label className="suelto" htmlFor="ia-json">2 · Lo que te devolvió</label>
        <p style={{ color: 'var(--tenue)', fontSize: 14, margin: '0 0 12px' }}>
          Pega el JSON tal cual. Acentos y mayúsculas se corrigen solos.
        </p>
        <textarea id="ia-json" value={texto} rows={10}
                  onChange={(e) => { setTexto(e.target.value); setRes(null); }}
                  placeholder='{ "qualy_equipos": [...], ... }'
                  style={{ width: '100%', fontFamily: 'var(--mono, monospace)', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button className="boton" onClick={cargar} disabled={pendiente || !texto.trim() || !quien}>
            {pendiente ? 'Cargando…' : `Cargar como ${quien || '—'}`}
          </button>
          <button className="boton secundario" onClick={replica} disabled={pendiente}>
            Cargar Réplica desde la ronda anterior
          </button>
        </div>
      </div>

      {res && (
        <div className={`aviso ${res.ok ? 'ok' : 'error'}`}>
          <strong>{res.mensaje}</strong>
          {!!res.errores?.length && (
            <ul style={{ margin: '10px 0 0', paddingLeft: 20 }}>
              {res.errores.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          {!!res.avisos?.length && (
            <>
              <p style={{ margin: '10px 0 4px', fontSize: 13 }}>Correcciones y campos vacíos:</p>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: 'var(--tenue)' }}>
                {res.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </>
  );
}
