# Seguimiento de Créditos Aprobados — AutoFácil

Aplicación web para seguimiento de créditos aprobados por ejecutivos comerciales.

## Stack

- **Frontend:** HTML + CSS + JavaScript (single file)
- **Base de datos:** Supabase (PostgreSQL)
- **Hosting:** Vercel

## Configuración

Las credenciales de Supabase están embebidas en `index.html`:

- **URL:** `https://wvjzzefvimaegrphixdq.supabase.co`
- **API Key:** ver archivo `index.html` → función `initConfig()`

## Despliegue

Este proyecto se despliega automáticamente en Vercel al hacer push a `main`.

**URL de producción:** se asigna automáticamente por Vercel.

## Actualizar la aplicación

1. Editar `index.html`
2. `git add .`
3. `git commit -m "descripción del cambio"`
4. `git push origin main`
5. Vercel despliega automáticamente en ~30 segundos

## Usuarios

Ver tabla de usuarios en el código fuente (`index.html` → constante `USUARIOS`).

## Supabase

- **Dashboard:** https://supabase.com/dashboard/project/wvjzzefvimaegrphixdq
- **Tablas:** `creditos`, `gestiones`
- **Nota:** En plan gratuito el proyecto se pausa tras 7 días sin actividad. Reactivar desde el dashboard.
