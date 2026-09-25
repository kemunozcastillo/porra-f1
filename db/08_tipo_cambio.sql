-- Añade el comodín «Cambio» al enum.
--
-- EJECUTAR SOLO ESTA SENTENCIA, y después `09_comodin_cambio.sql`.
-- Postgres no deja usar un valor de enum en la misma transacción en que
-- se crea, y el 09 lo nombra en las políticas.

alter type tipo_comodin add value if not exists 'cambio';
