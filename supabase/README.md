# Supabase para Zella ICT

La aplicación usa Supabase Auth para el acceso, Postgres para la bitácora y un bucket privado para capturas. Las tablas expuestas tienen RLS y cada fila queda asociada al usuario autenticado. Las capturas no se guardan como texto base64 en Postgres.

## Crear el proyecto

1. Crea un proyecto Supabase en tu propia organización. El plan Free sirve para esta etapa; no selecciones una mejora pagada.
2. Guarda el `project ref`, la URL del proyecto y la clave `publishable` desde **Connect**. No copies una clave `service_role` a la aplicación.
3. Aplica la migración versionada:

```powershell
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <project-ref>
pnpm dlx supabase db push
```

La migración crea el esquema, el perfil al registrar una cuenta, las restricciones, los índices, las políticas RLS y el bucket privado de capturas. Revisa la migración antes de aplicarla a cualquier base que ya tenga datos.

## Variables locales

Copia `.env.example` a `.env.local` y completa:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
NEXT_PUBLIC_MARTIN_USER_ID=<auth-user-id-de-martin>
```

`NEXT_PUBLIC_MARTIN_USER_ID` solo controla la dedicatoria. No concede permisos de datos. Para obtenerlo, crea la cuenta de Martín y copia el UUID desde **Authentication → Users**. Los demás usuarios no ven la experiencia cinematográfica.

## Verificación antes de publicar

- Prueba registro, confirmación por correo, inicio de sesión y cierre de sesión.
- Verifica con dos usuarios que cada uno solo pueda leer y modificar sus filas.
- Prueba respaldo/importación local antes de borrar datos de cualquier navegador. La migración inicial combina filas locales y remotas por ID; no elimina los datos locales originales.
- Comprueba que las capturas se guardan en el bucket privado y se leen mediante URL firmada.
- Comprueba las dos horas: la hora local configurada y la hora de Nueva York. `entry_date` mantiene la hora NY como reloj local (`timestamp without time zone`) para no desplazar las operaciones al convertir zonas.

## Vercel

En el proyecto Vercel añade las mismas tres variables a **Preview** y **Production**. Configura también la URL de autenticación de Supabase con los dominios locales y el dominio final de Vercel. Primero publica una preview y valida Auth, RLS, sincronización, importación y capturas. No publiques Production mientras esas comprobaciones estén pendientes.

El plan Hobby de Vercel es para uso personal/no comercial. Si el producto se ofrece de pago, revisa un plan que permita uso comercial antes de cobrar. Supabase Free puede pausar proyectos con poca actividad; confirma el estado y los límites en el panel antes de depender de él.
