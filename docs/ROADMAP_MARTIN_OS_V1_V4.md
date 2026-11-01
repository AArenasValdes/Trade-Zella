# Martin OS — Roadmap de implementación V1 → V4

Fecha de planificación: 2026-10-29. Base: feedback directo de Martín y revisión del código de `master`.

## Reglas transversales

- Desarrollar cada versión en ramas y PR independientes. No hacer merge ni desplegar sin QA.
- Nunca ejecutar borrados masivos de trades, notas, cuentas, playbooks o imágenes. Ocultar opciones no equivale a eliminar datos almacenados.
- Mantener compatibilidad de Supabase, `localStorage`, CSV, backup/restore JSON y registros existentes.
- La hora de una operación corresponde a Nueva York. Distinguir hora exacta de ventana representativa y no inventar precisión temporal.
- Separar beneficios monetarios reales de valores *derivados*; no presentar un R como retorno en % sin un riesgo de referencia verificable.
- Toda estadística debe exponer tamaño muestral, población/filtros, moneda/unidad, costos disponibles y tratamiento de datos incompletos.
- Al cerrar cada PR: ejecutar `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, smoke test autenticado y prueba de persistencia con datos no productivos.

## V1 — Captura simple, calendario y compatibilidad

### V1a — Correcciones de bajo riesgo (PR inicial)

- [x] R-Multiple positivo de hasta dos decimales; aceptar punto y coma como separador.
- [x] Tooltip de la curva de equity: fecha y hora/ventana NY, trade individual, acumulado y drawdown; marcar importe estimado cuando el P&L es derivado.
- [x] Calendario de lunes a viernes; conservar fines de semana en datos y totales.
- [x] Alta directa de operación con botón `+` dentro de cada día hábil.
- [x] Mostrar rendimientos semanales sin perder la cabecera de rendimiento mensual.
- [ ] QA automatizado y smoke test del PR; no fusionar hasta pasar.

### V1b — Simplificación y migración (siguiente PR, después de V1a)

- [ ] Retirar visualmente el Notebook Diario y el icono de libro. Conservar registros históricos de notas, y resolver la regla de días `No Trade` sin dejar alertas huérfanas.
- [ ] Retirar controles de cuenta y riesgo del flujo habitual; mantener entidades históricas donde son requeridas para interpretar datos anteriores.
- [ ] Redefinir esquema de captura del rendimiento: distinguir `R realizado`, `retorno neto % real` y `retorno estimado`. Decidir explícitamente qué dato debe introducir Martín antes de mostrar rentabilidad porcentual.
- [ ] Ocultar checklist, `respetó el plan`, target liquidez y modelo BPR en nuevos registros; conservar valores históricos y actualizar `Martin Edge Score`, las vistas y los filtros dependientes.
- [ ] Dejar Breaker Block y Key Level como modelos seleccionables; definir si se exige un modelo principal único para métricas sin doble conteo.
- [ ] Agregar duración manual del trade en minutos. Requiere migración **aditiva** y sincronización/backups compatibles; no inferir hora de cierre a partir de una entrada de ventana.
- [ ] Mantener precios de ejecución como sección optativa/en prueba; no impedir el guardado sin esos valores.
- [ ] No exigir cuentas o niveles de riesgo visibles para registros nuevos si el esquema decidido no los necesita.
- [ ] Revisar estados `Win`, `Loss`, break-even, operaciones parciales y sus efectos antes de ampliar el modelo.
- [ ] Verificar caso de registros de fin de semana y explicar su impacto en calendarios y totales.

### Aceptación V1

1. Un usuario puede registrar un trade en pocos campos sin configurar cuentas manualmente, sin checklist, sin notebook y sin información redundante.
2. Un registro con `1,25R` o `1.25R` guarda y reaparece exactamente como 1.25R, incluso tras recargar, importar y exportar.
3. Los datos históricos y rentabilidades previas no cambian silenciosamente.
4. El calendario muestra cinco columnas y puede abrir registro desde cada día sin duplicados.
5. Los indicadores `%`, `R` y `USD` sólo aparecen cuando existe una base de cálculo válida.

## V2 — Estadística de edge por modelo, horario y emoción

- [ ] Métricas principales por Breaker Block y Key Level: N, TP/SL/BE, Win Rate, win/loss medio en R, expectativa neta, Profit Factor, MFE/MAE si existe evidencia.
- [ ] Agrupar horarios NY reales sin mezclar horas exactas y ventanas representativas; usar el horario operativo habitual como filtro editable, no como dato inventado.
- [ ] Explorar duración, día laboral, activo y emoción; incluir N, poblaciones y ausencia de datos.
- [ ] Retirar creación de nuevos escenarios del UI, conservando playbooks históricos.
- [ ] Sustituir `Martin Edge Score` por indicador interpretable y documentado, o retirarlo hasta que exista justificación.
- [ ] Evitar ranking de setups con N insuficiente; establecer advertencias y evidencia trazable.

### Aceptación V2

Los mismos trades generan exactamente las mismas estadísticas en dashboard, calendario y vista de análisis; filtros y denominadores visibles, sin inventar precisión ni confundir asociación con causalidad.

## V3 — Backtesting vs Real

- [ ] Añadir `source_type`/entorno con valores explícitos `backtest`, `demo`, `real` (y manejo seguro de registros históricos `sin clasificar`).
- [ ] Unificar esquemas de modelo, horario NY, dirección, duración y emoción, permitiendo `sin dato` en registros retrospectivos.
- [ ] Importación de backtesting y deduplicación identificable.
- [ ] Panel comparativo de expectativa, drawdown, Win Rate, frecuencia, costes, slippage y distribución de resultados, sin sumar poblaciones distintas.
- [ ] Comparaciones por muestra, rango temporal y confianza; segmentar out-of-sample para reducir overfitting.
- [ ] Migraciones aditivas con políticas RLS por usuario, pruebas de autorización y backup previo.

### Aceptación V3

El usuario puede seleccionar Backtesting / Demo / Real, comparar el mismo modelo en dos cohortes y abrir las operaciones que respaldan cada diferencia sin contaminar la curva real con datos hipotéticos.

## V4 — Monte Carlo y analista IA

- [ ] Monte Carlo mediante remuestreo reproducible (seed), con supuestos, límites y advertencias de tamaño muestral; distinguir simulación de predicción.
- [ ] Medir distribución de drawdown y rachas; usar supuestos documentados de riesgo, costos y límites de fondeo cuando existan.
- [ ] Implementar IA **lectora** de métricas verificadas y operaciones seleccionadas mediante herramientas de consulta de solo lectura.
- [ ] Responder con tamaño muestral, IDs de operaciones, filtros y contradicciones; permitir `datos insuficientes`.
- [ ] Protecciones de privacidad, cuotas/costos, no exposición de credenciales y evaluación de exactitud del asistente.
- [ ] No realizar autotrading, órdenes al broker ni prometer rentabilidad.

### Aceptación V4

Las simulaciones son reproducibles y el asistente puede justificar cada estadística con los datos reales de la plataforma; ninguno puede inventar resultados ni ejecutar órdenes.

## QA de regresión prioritaria

- Acceso con Supabase y aislamiento de datos por usuario.
- CRUD de operaciones y sincronización remota; recarga/edición/historial sin pérdidas.
- CSV, backup/restore JSON, imágenes y notas históricas.
- Cambio horario verano/invierno Chile ↔ NY, días límite de mes y cambio de año.
- Diferencia entre operaciones con hora exacta y registros por ventana.
- Dos operaciones el mismo día, días de fin de semana históricos y reordenamiento de trades.
- P&L monetario auditado vs derivado, porcentaje, R, cero/BE y operaciones con cuenta antigua.
- Responsividad en escritorio y móvil.
