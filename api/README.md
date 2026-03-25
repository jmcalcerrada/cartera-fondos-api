# Cartera Fondos — Backend Vercel

## ¿Para qué sirve esto?
Este servidor actúa de intermediario entre tu app móvil y Morningstar/quefondos.
Consulta los valores liquidativos (NAV) históricos de fondos de inversión por ISIN.

---

## Despliegue en Vercel (5 minutos, gratis)

### Paso 1 — Crear cuenta en GitHub
Ve a https://github.com y crea una cuenta gratuita si no tienes.

### Paso 2 — Crear repositorio
1. En GitHub, pulsa el botón verde **"New"** (arriba a la izquierda)
2. Ponle nombre: `cartera-fondos-api`
3. Márcalo como **Público**
4. Pulsa **"Create repository"**

### Paso 3 — Subir los ficheros
1. En la página del repositorio vacío, pulsa **"uploading an existing file"**
2. Arrastra estos 3 ficheros (manteniendo la carpeta `api/`):
   - `api/fondo.js`
   - `vercel.json`
   - `package.json`
3. Pulsa **"Commit changes"**

### Paso 4 — Desplegar en Vercel
1. Ve a https://vercel.com y crea cuenta gratuita (puedes entrar con tu cuenta GitHub)
2. Pulsa **"Add New Project"**
3. Importa el repositorio `cartera-fondos-api`
4. Sin cambiar nada, pulsa **"Deploy"**
5. En ~30 segundos tendrás una URL como: `https://cartera-fondos-api.vercel.app`

### Paso 5 — Probar que funciona
Abre en el navegador:
```
https://TU-URL.vercel.app/api/fondo?isin=ES0108232002&days=90
```
Debes ver un JSON con el nombre del fondo y los datos históricos.

### Paso 6 — Actualizar la app móvil
Abre el fichero `cartera_isin.html` y cambia la línea:
```javascript
const API_BASE = 'https://TU-URL.vercel.app';
```
Sustituyendo `TU-URL` por la URL real que te dio Vercel.

---

## Endpoint disponible

### GET /api/fondo
| Parámetro | Descripción | Ejemplo |
|-----------|-------------|---------|
| `isin` | Código ISIN del fondo | `ES0108232002` |
| `days` | Días de histórico (opcional, default 180) | `90`, `365` |

**Respuesta:**
```json
{
  "name": "ALLIANZ CARTERA DINAMICA, FI",
  "isin": "ES0108232002",
  "nav": 18.2069,
  "navDate": "2026-03-06",
  "series": [
    { "t": 1735689600000, "c": 17.45 },
    { "t": 1735776000000, "c": 17.48 }
  ]
}
```

## Fuentes de datos (en orden de prioridad)
1. **Morningstar España** — tools.morningstar.es
2. **Morningstar Global** — global.morningstar.com
3. **quefondos.com** — fuente de respaldo para fondos españoles
