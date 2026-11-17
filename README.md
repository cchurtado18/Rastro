# Wallet Tracker · edición definitiva

Herramienta para seguirle la pista a wallets de Solana. Une dos proyectos:

- **Wallet Tracker** (KOL Wallet Hunter): encuentra la wallet detrás de un shill cruzando los compradores tempranos de varios tokens.
- **[Rastro](https://github.com/cchurtado18/Rastro)**: sigue a una persona, detecta cuándo se muda de wallet y avisa en tiempo real.

La app corre en el navegador, habla directo con Helius y guarda todo en `localStorage`. Un vigilante opcional en Node sigue avisando con el navegador cerrado.

## Cómo correrla

```bash
cp .env.example .env        # pon tu llave de Helius (https://helius.dev)
npm install
npm run dev                 # la app, en http://localhost:5173
npm test                    # pruebas del motor
npm run watch               # vigilante en segundo plano (ver abajo)
```

`.env` necesita una sola línea: `VITE_HELIUS_API_KEY=tu_llave`.

## Seguir (pantalla de inicio)

Pega la wallet de alguien y la app arma su red:

- **Mapa de flujo.** Quién le mandó SOL, a dónde mandó el suyo hasta 3 saltos, y qué es cada wallet: puente, depósito de exchange, distribuidor, candidata, hermana. Vista por capas o radial. El mapa se acumula: lo que un escaneo nuevo ya no alcanza se conserva 7 días.
- **Puntaje 1–99** de qué tan probable es que una wallet sea suya, con las razones a favor y en contra. Son heurísticas, no pruebas.
- **Tiempo real.** Cada wallet vigilada está suscrita por websocket: una compra o un envío aparece en 1–2 s en la pestaña *En vivo*, con aviso del navegador si lo activas. Si manda SOL a una wallet nueva, esa wallet queda vigilada 6 h.
- **Mudanzas.** Si una wallet recibió su SOL, compró después y su última compra es más reciente que la de sus wallets, avisa "posible mudanza" y la confirmas con un clic.
- **Vía exchange.** Si depositó SOL o USDC en un exchange en las últimas 72 h, busca retiros del 90–101 % del monto en las 6 h siguientes hacia wallets nuevas.
- **Tokens entre wallets.** Pasarle tokens a otra wallet sin recibir nada a cambio cuenta como señal de mismo dueño.
- **Coincidencias.** Si 2 o más personas que sigues compran la misma moneda en menos de 30 min, aparece en *Coincidencias · 24 h*.
- **Buscar por CA.** Pega el CA de una moneda y dice quién la compró, con qué wallet, cuántas veces, cuánto gastó y recibió, y si todavía tiene.
- **Rendimiento.** Ganancia realizada, valor de lo que sigue abierto, porcentaje de aciertos y tiempo medio de cada persona, sobre sus últimos 7 días.
- **Tus propios nombres.** Puedes nombrar cualquier wallet ("Coinbase", "banco de X") y el nombre aparece en el mapa.
- **Tokens falsos.** Las imitaciones de USDT, USDC, SOL, JUP, etc. no cuentan como compra; comprar estables o SOL en staking tampoco.
- **Respaldo.** *Exportar respaldo* descarga un archivo con a quién sigues, sus mapas, tus nombres y las listas de Cazar. *Importar* solo agrega, nunca pisa.

## Cazar

Ingresa 2 o más contratos de tokens lowcap y devuelve las wallets que compraron temprano en la mayoría. Tres modos: estándar, reverse (parte de un token chico y verifica el resto por wallet) y early (quién compró antes del pico de volumen). Detecta bundles, bots de volumen y direcciones vanity, y trae el rastreador de SOL/USDC.

Cada token se lee desde su primera transacción hacia adelante y sin filtrar por tipo. Helius etiqueta casi todas las compras hechas con bots como transferencias: con el filtro de "swaps" se perdía entre el 72 % y el 85 % de los compradores tempranos en tokens recientes.

Las dos vistas se conectan: desde un resultado de Cazar puedes seguir a esa wallet, y desde cualquier token o coincidencia de Seguir puedes mandarlo a Cazar.

## Vigilante en segundo plano

La app solo vigila con la pestaña abierta. Para que siga con el navegador cerrado:

1. En la app: *Seguir → Exportar respaldo*.
2. En la terminal: `npm run watch` (toma el respaldo más reciente de `~/Downloads`), o `npm run watch -- ruta/al/respaldo.json`.

Avisa en la terminal y con notificaciones de macOS cuando alguien compra, mueve SOL o coincide con otro. Para recibirlo también en Telegram, agrega a `.env`:

```
TELEGRAM_BOT_TOKEN=...      # te lo da @BotFather al crear un bot
TELEGRAM_CHAT_ID=...        # escríbele a tu bot y abre https://api.telegram.org/bot<TOKEN>/getUpdates
```

`npm run watch -- --prueba` manda un aviso de prueba por cada canal. Otras opciones: `--ventas` (avisar también ventas) y `--sin-mac`.

Si vuelves a exportar el respaldo al mismo archivo, el vigilante lo relee solo.

## Estructura

| Archivo | Qué tiene |
|---|---|
| `src/engine.js` | Los dos motores, sin interfaz. También corre en Node. |
| `src/follow-model.js` | Roles, textos, disposición del mapa y respaldo de Seguir. |
| `src/Follow.jsx` | La vista Seguir. |
| `src/App.jsx` | La vista Cazar y el armazón de la app. |
| `src/ui.jsx` | Íconos y controles compartidos. |
| `tests/engine.test.js` | Pruebas del motor con transacciones armadas a mano. |
| `watcher/watch.mjs` | El vigilante. |

## Qué vino de cada proyecto

| De Rastro | De Wallet Tracker |
|---|---|
| Tiempo real por websocket y avisos | Cazar: intersección, reverse, early, bundles |
| Detección de mudanza de wallet | Mapa de flujo con zoom y vista radial |
| Emparejar retiros de un exchange | Puntaje explicado de cada wallet |
| Coincidencias entre personas | Wallets hermanas por depósito compartido |
| Búsqueda por CA | Distribuidores y depósitos de exchange |
| Filtro de imitaciones y polvo | Rastreador de SOL/USDC y lista de vigiladas |
| "Otra persona" nunca se mezcla | Tabla de tokens, línea de tiempo, perfil |
| Historial acumulado del mapa | Rendimiento, nombres propios y respaldo |
| Vigilar con el navegador cerrado | Enlaces por tokens entre wallets |

Los dos proyectos ya leían las compras por cambio de balance, no por la etiqueta que les pone Helius.

## Lo que cambió respecto a Rastro

- **El panel es una app de navegador**, no un servidor. Lo que Rastro hacía en el servidor lo cubre el vigilante, que es más simple: avisa, pero no vuelve a escanear ni detecta mudanzas por su cuenta.
- **La mudanza no se asigna sola.** Rastro cambia la wallet activa automáticamente; aquí avisa y tú confirmas.
- **Pruebas propias.** Las de Rastro probaban su motor de Node; estas prueban el de esta app.
- **Se corrigió la dirección de USDT**: la que usa Rastro no existe en la cadena.

## Límites

- Un escaneo completo en Seguir hace entre 35 y 60 llamadas a Helius y tarda de 25 a 40 s. La búsqueda en un exchange es la parte cara.
- En Cazar, un token muy activo (cientos de transacciones por minuto al lanzarse) agota el tope de lectura en sus primeros minutos; la app avisa hasta dónde llegó.
- El rendimiento solo cuenta lo comprado y vendido en los últimos 7 días, y una posición abierta solo se valora si el token tiene un pool con precio.
- Los exchanges se reconocen por su comportamiento, no por nombre: la lista de direcciones conocidas es corta y no se amplió porque no se pudieron verificar etiquetas.
- La llave de Helius viaja en las peticiones del navegador: úsala solo en tu máquina.
