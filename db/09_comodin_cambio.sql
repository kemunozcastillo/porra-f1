-- Comodín «Cambio»: rehacer el pronóstico de carrera con la
-- clasificación ya corrida. Uno por temporada.
--
-- Ejecutar DESPUÉS de `08_tipo_cambio.sql`, que añade el valor al enum.
--
-- Tres piezas, y las tres hacen falta:
--
--   1. El plazo del comodín, en la política de `comodines`.
--   2. Cerrar la edición del pronóstico al cierre normal. Sin esto el
--      comodín no concede nada, porque hoy cualquiera puede editar
--      hasta que larga la carrera.
--   3. Filtrar el bonus del acumulado por tipo. Sin esto un `cambio` se
--      sumaría como un boost y doblaría el puntaje de esa ronda.

-- ---------- 1. Plazo del comodín ----------

drop policy if exists "declarar comodin" on comodines;
create policy "declarar comodin" on comodines for insert with check (
  participante = mi_participante()
  and exists (
    select 1 from gps g
    where g.id = comodines.gp_id
      and case comodines.tipo
            -- A ciegas: antes de que arranque la FP1. Si la ronda no
            -- tiene FP1 cargada queda bloqueado, que es preferible a
            -- dejar pasar uno fuera de plazo.
            when 'boost_ciegas' then now() < g.fp1_at
            -- Cambio: sólo en fin de semana sin sprint, con la
            -- clasificación ya corrida y antes de que largue la
            -- carrera. En un fin de semana con sprint no aplica porque
            -- el sprint ya se puntuó y el pronóstico es el mismo.
            when 'cambio' then g.tipo = 'normal'
                             and now() > g.qualy_at
                             and now() < g.carrera_at
            else now() < g.cierra_at
          end
  )
);

-- El Cambio no se retira: cuando se declara, ya se usó para reescribir
-- la carrera. Los boosts sí, mientras su plazo siga abierto.
drop policy if exists "retirar comodin" on comodines;
create policy "retirar comodin" on comodines for delete using (
  participante = mi_participante()
  and comodines.tipo <> 'cambio'
  and exists (
    select 1 from gps g
    where g.id = comodines.gp_id
      and now() < case when comodines.tipo = 'boost_ciegas' then g.fp1_at
                       else g.cierra_at end
  )
);

-- ---------- 2. La edición se cierra con el pronóstico ----------

-- Antes se podía editar hasta que largaba la carrera, sin límite. Eso
-- dejaba corregir la parrilla de clasificación con el resultado ya
-- conocido, porque `enviado_at` no se toca al editar. Ahora la edición
-- libre acaba en el cierre; después sólo entra el comodín, y lo aplica
-- el servidor tocando únicamente los casilleros de carrera.
drop policy if exists "editar mi pronostico" on predicciones;
create policy "editar mi pronostico" on predicciones for update using (
  participante = mi_participante()
  and exists (
    select 1 from gps g
    where g.id = predicciones.gp_id and now() < g.cierra_at
  )
);

-- ---------- 3. El bonus sólo lo dan los boosts ----------

create or replace view clasificacion as
with sesiones as (
  select participante, coalesce(sum(puntos), 0) as puntos_sesiones
  from puntajes
  group by participante
),
podios as (
  select
    participante,
    coalesce(sum(medalla), 0)   as puntos_medallas,
    coalesce(sum(puntos_f1), 0) as puntos_f1,
    count(*) filter (where medalla = 3)  as oros,
    count(*) filter (where medalla = 2)  as platas,
    count(*) filter (where medalla = 1)  as bronces,
    count(*) filter (where posicion = 4) as cuartos
  from posiciones_gp
  group by participante
),
bonus as (
  -- Sólo los dos boosts duplican. El Cambio no suma puntos: lo que hace
  -- es dejar reescribir la carrera, y sin este filtro se contaría como
  -- un boost más.
  select c.participante, coalesce(sum(pt.puntos), 0) as puntos_boost
  from comodines c
  join puntajes pt
    on pt.participante = c.participante
   and pt.gp_id = c.gp_id
   and pt.sesion = 'gp'
  where c.tipo in ('boost', 'boost_ciegas')
  group by c.participante
)
select
  p.nombre as participante,
  p.tipo,
  coalesce(se.puntos_sesiones, 0)
    + coalesce(po.puntos_medallas, 0)
    + coalesce(bo.puntos_boost, 0) as total,
  coalesce(se.puntos_sesiones, 0) as puntos_sesiones,
  coalesce(po.puntos_medallas, 0) as puntos_medallas,
  coalesce(bo.puntos_boost, 0)    as puntos_boost,
  coalesce(po.puntos_f1, 0)       as puntos_f1,
  coalesce(po.oros, 0)    as oros,
  coalesce(po.platas, 0)  as platas,
  coalesce(po.bronces, 0) as bronces,
  coalesce(po.cuartos, 0) as cuartos
from participantes p
left join sesiones se on se.participante = p.nombre
left join podios   po on po.participante = p.nombre
left join bonus    bo on bo.participante = p.nombre
where p.activo
order by total desc, oros desc, platas desc, bronces desc, cuartos desc, p.nombre;
