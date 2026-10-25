<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Proyecto: Zella ICT

Zella ICT es una bitácora personal de trading enfocada en Smart Money Concepts (ICT). Permite registrar operaciones, revisar resultados y disciplina, organizar playbooks, llevar notas diarias, seguir cuentas de fondeo y calcular riesgo/tamaño de posición. La interfaz y los datos de ejemplo están en español; conserva esos términos funcionales al cambiar pantallas o modelos.

## Stack y ejecución

- Next.js **16.4.2** con App Router y Turbopack; React **19.3.0**; TypeScript en modo estricto.
- Tailwind CSS 4, Recharts para gráficos y Lucide para iconos.
- Alias `@/*` apunta a `src/*` (`tsconfig.json`).
- Scripts del proyecto: `pnpm dev`, `pnpm lint` y `pnpm build` (en Windows PowerShell).
- `README.md` todavía es el texto genérico de create-next-app; usa el código y este archivo como fuente de verdad.

## Esqueleto y rutas

Solo hay una ruta App Router implementada: `/`, en `src/app/page.tsx`. Es una aplicación cliente que muestra una vista según `activeTab`; el menú lateral no navega a rutas URL separadas.

- `src/app/layout.tsx`: layout raíz, fuentes, metadatos y estilos globales.
- `src/app/page.tsx`: compone `TradingProvider`, navegación, vistas y modales globales.
- `src/components/layout/`: `Sidebar` (navegación, importación/exportación y acciones) y `Topbar` (título y filtros compartidos).
- `src/components/views/`: `DashboardView` (KPIs y gráficos), `JournalView` (tabla, búsqueda y filtros), `CalendarView` (calendario y notas), `PlaybooksView` (reglas y estadísticas ICT) y `AccountsView` (cuentas y límites).
- `src/components/modals/`: formulario de operación, calculadora de riesgo y panel de inspección de una operación.
- `src/context/TradingContext.tsx`: estado compartido y acciones de trades, cuentas, playbooks, notas, filtros e importación/respaldo.
- `src/types/trading.ts`: contratos TypeScript y uniones canónicas del dominio.
- `src/config/ict-constants.ts`: opciones de killzones, PD Arrays, checklist, instrumentos y datos iniciales.
- `src/services/math-engine.ts`: reglas de killzone, cálculos de operaciones/riesgo y métricas.
- `src/services/storage-service.ts`: claves de persistencia, parser CSV, imágenes y validación/importación de respaldos.
- `src/hooks/use-zella-store.ts` y `src/app/lib/ict-engine.ts`: implementación anterior sin referencias desde la app activa. El hook solo importa el engine anterior. No agregues nuevas dependencias a esta ruta paralela ni la elimines sin revisar compatibilidad y datos primero.

## Datos y comportamiento

- La app activa usa `useTrading()` desde `TradingContext`; las vistas deben consumir y actualizar el estado por ese contexto, no mantener copias independientes de trades/cuentas.
- Persistencia actual del contexto: `localStorage`, con claves `zella_ict_*_v3` declaradas en `services/storage-service.ts`. El navegador se lee después de montar para mantener la hidratación consistente.
- No hay API, base de datos ni autenticación configuradas en el esqueleto actual. No describas `localStorage` como sincronización entre dispositivos.
- `Trade`, `ICTPlaybook`, `PropAccount`, notas y filtros se definen en `types/trading.ts`. Mantén los literales de `Killzone`, `PDArray`, `PsychologyTag`, dirección y estado alineados con las opciones de `ict-constants.ts`.
- `entryDate` se guarda como texto de fecha/hora; el motor detecta killzone leyendo hora y minutos de ese valor. Las etiquetas indican hora de Nueva York. Evita conversiones de zona horaria inadvertidas.
- Los cálculos de riesgo, valor por punto, P&L, R-multiple, filtros y estadísticas son reglas de dominio. Antes de cambiar una fórmula, revisa sus consumidores en formulario, calculadora, dashboard e importación CSV.
- CSV y JSON se procesan en el navegador desde `Sidebar`; al cambiar los esquemas, conserva compatibilidad y valida datos antes de reemplazar estado persistido. No borres datos locales como arreglo general.

## Guía para cambios

- Sigue el flujo: interfaz → `useTrading()` → tipos/servicios/configuración. Mantén la lógica de cálculo y parsing fuera de los componentes.
- Usa tipos explícitos del dominio e imports `type` cuando corresponda. Evita `any`, conversiones sin validar y redefinir uniones existentes.
- Usa actualizaciones funcionales de estado cuando dependan del valor previo. No escribas estado derivado en un `useEffect`; deriva el valor o usa el evento que cambia la fuente para evitar renders en cascada.
- No leas `window`, `localStorage`, la hora actual, números aleatorios ni datos externos durante el render de prerender. Lee estado del navegador después del montaje y calcula la hora de una nueva operación desde la acción que la crea. Formatea el primer HTML de forma determinista para prevenir hydration mismatches y errores de prerender de Next.
- Al añadir vistas, decide si requieren una pestaña de `ActiveTab`; añade su unión y contenido condicional en `page.tsx`. No crees rutas nuevas salvo que el producto requiera URL navegable o recarga directa.
- Mantén componentes enfocados, props tipadas y cálculos repetidos memoizados cuando el costo lo justifique. No uses `useMemo`/`useCallback` por defecto si no reducen trabajo o renders observables.
- Trata textos visibles y opciones ICT existentes como parte del contrato de datos guardados; renombrar un literal puede dejar valores antiguos incompatibles.
- No cambies claves o formato de `localStorage`, ni el modelo de respaldo, sin una migración explícita y una ruta de lectura compatible.
- Mantén estilos con las clases Tailwind existentes y reutiliza componentes/convenciones actuales antes de introducir dependencias.

## Verificación

- Cambios de tipos o dominio: `pnpm exec tsc --noEmit`.
- Cambios de componentes: `pnpm lint`.
- Para verificar el build de producción: `pnpm build`, comprobando antes que no se esté ejecutando otro servidor Next sobre el mismo directorio `.next`.
- Si el cambio afecta hidratación, formularios, navegación o persistencia, revisa la ruta `/` en navegador y los flujos afectados; el build y el lint no sustituyen esa comprobación.
