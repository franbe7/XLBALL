# XLBall Stats MVP

MVP para jugar la proxima sesion con:

- Sala HaxBall headless
- Mapa custom (`maps/mvp_arena.hbs`)
- Estadisticas persistentes en `data/stats.json`
- Comandos de chat: `!me`, `!stats`, `!top`, `!map`, `!help`

## Alcance v1 (intencionalmente chico)

Incluye:

- Registro por usuario con clave estable (`auth`, o `conn` como fallback)
- Metricas: partidos jugados, victorias, derrotas, goles, autogoles, tiros
- Ranking top 5 por metrica

No incluye (v2):

- Login/registro propio
- ELO/MMR avanzado
- Dashboard web
- Base SQL

## Requisitos

- Node.js 18+
- Token de headless host de HaxBall

## Setup rapido

1. Instalar dependencias:

```bash
npm install
```

2. Crear config:

```bash
cp .env.example .env
```

3. Editar `.env` y completar `TOKEN`.

4. Iniciar bot:

```bash
npm start
```

Cuando arranca, imprime el link de la sala en consola.

## Comandos dentro de la sala

- `!help`: lista comandos
- `!me` o `!stats`: muestra tus stats
- `!top goals` (o `wins`, `matchesPlayed`, `shots`): ranking
- `!map`: recarga el mapa custom desde disco

## Notas de precision de stats

- El goleador se estima por el ultimo `kick` antes del gol (ventana de 7s).
- Si el ultimo toque es del equipo rival, se cuenta como autogol.
- Para partidas reales, esto da un resultado util para MVP; luego puede mejorarse con reglas mas estrictas.
