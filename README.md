# Simuladores Monte Carlo — Promundial Consulting Group

Simuladores financieros estocásticos para análisis de valor por sector.

## Simuladores incluidos

### Sector Automotriz
- **Taller de Autos** — Servicios y repuestos, 3 cuellos de botella, absorción
- **Taller de Motos** — Servicios y repuestos motos, defaults calibrados
- **Venta Autos Nuevos** — Funnel comercial, inventario, floor plan
- **Venta Motos Nuevas** — Funnel comercial motos, sin devoluciones

### Sector Salud
- **Hospital** — Quirófanos, emergencias, imágenes, laboratorio, hospitalización

### Sector Bebidas
- **Embotelladora** — Volumen, COGS, CAPEX, WACC flexible

## Stack
- React 19 + Vite
- react-router-dom
- Recharts

## Instalación
```bash
npm install
npm run dev
```

## Deploy
Conectar repo a Vercel. Deploy automático en cada push a `main`.

IR y WACC son parámetros flexibles configurables por país e industria.
