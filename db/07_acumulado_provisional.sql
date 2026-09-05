-- El acumulado suma los puntajes desde `puntajes`, no desde
-- `posiciones_gp`.
--
-- Desde que el podio de la ronda espera a la carrera, `posiciones_gp`
-- está vacía en una ronda con sólo la clasificación cargada. La vista
-- sacaba de ahí `puntos_sesiones`, así que esos puntos no llegaban al
-- acumulado: con la qualy de Italia cargada, la tabla no se movía.
--
-- Cada cosa viene ahora de donde le corresponde:
--
--   puntos_sesiones  -> `puntajes`, que existe en cuanto hay resultado
--                       de cualquier sesión. Entran en cuanto se cargan.
--   medallas y F1    -> `posiciones_gp`, que espera a la carrera porque
--                       hasta entonces el orden de la ronda no está
--                       decidido.
--
-- Es la diferencia entre lo que ya se sabe y lo que todavía no.

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
  -- El boost duplica únicamente la sesión de Gran Premio.
  -- Si la ronda tuvo sprint, ese puntaje no se dobla.
  select c.participante, coalesce(sum(pt.puntos), 0) as puntos_boost
  from comodines c
  join puntajes pt
    on pt.participante = c.participante
   and pt.gp_id = c.gp_id
   and pt.sesion = 'gp'
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
