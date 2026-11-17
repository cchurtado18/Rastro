# Wallet Tracker · edición definitiva

Herramienta para seguirle la pista a wallets de Solana. Une dos proyectos:

- **Wallet Tracker** (KOL Wallet Hunter): encuentra la wallet detrás de un shill cruzando los compradores tempranos de varios tokens.
- **[Rastro](https://github.com/cchurtado18/Rastro)**: sigue a una persona, detecta cuándo se muda de wallet y avisa en tiempo real.

Es una sola app que corre en el navegador. No tiene servidor: habla directo con Helius y guarda todo en `localStorage`.

## Cómo correrla

```bash
cp .env.example .env        # pon tu llave de Helius (https://helius.dev)
npm install
npm run dev                 # http://localhost:5173
```

`.env` necesita una sola línea: `VITE_HELIUS_API_KEY=tu_llave`.

## Seguir (pantalla de inicio)

Pega la wallet de alguien y la app arma su red:

- **Mapa de flujo.** Quién le mandó SOL, a dónde mandó el suyo hasta 3 saltos, y qué es cada wallet: puente, depósito de exchange, distribuidor, candidata, hermana. Vista por capas o radial.
- **Puntaje 1–99** de qué tan probable es que una wallet sea suya, con las razones a favor y en contra. Son heurísticas, no pruebas.
- **Tiempo real.** Cada wallet vigilada está suscrita por websocket: una compra o un envío aparece en 1–2 s en la pestaña *En vivo*, con aviso del navegador si lo activas. Si manda SOL a una wallet nueva, esa wallet queda vigilada 6 h.
- **Mudanzas.** Si una wallet recibió su SOL, compró después y su última compra es más reciente que la de sus wallets, avisa "posible mudanza" y la confirmas con un clic.
- **Vía exchange.** Si depositó en un exchange en las últimas 72 h, busca retiros del 90–101 % del monto en las 6 h siguientes hacia wallets nuevas.
- **Coincidencias.** Si 2 o más personas que sigues compran la misma moneda en menos de 30 min, aparece en *Coincidencias · 24 h*.
- **Buscar por CA.** Pega el CA de una moneda y dice quién la compró, con qué wallet, cuántas veces, cuánto gastó y recibió, y si todavía tiene.
- **Tokens falsos.** Las imitaciones de USDT, USDC, SOL, JUP, etc. no cuentan como compra; comprar estables o SOL en staking tampoco.

## Cazar

Ingresa 2 o más contratos de tokens lowcap y devuelve las wallets que compraron temprano en la mayoría. Tres modos: estándar, reverse (parte de un token chico y verifica el resto por wallet) y early (quién compró antes del pico de volumen). Detecta bundles, bots de volumen y direcciones vanity, y trae el rastreador de SOL/USDC.

Las dos vistas se conectan: desde un resultado de Cazar puedes seguir a esa wallet, y desde cualquier token o coincidencia de Seguir puedes mandarlo a Cazar.

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

Los dos proyectos ya leían las compras por cambio de balance, no por la etiqueta que les pone Helius.

## Lo que cambió respecto a Rastro

- **Sin servidor ni CLI.** Rastro corre como proceso de Node y sigue vigilando con el navegador cerrado. Aquí la vigilancia funciona mientras la pestaña esté abierta; al volver a abrirla, lee todo lo que pasó desde la última revisión.
- **Los avisos son del navegador**, no notificaciones nativas de macOS.
- **La mudanza no se asigna sola.** Rastro cambia la wallet activa automáticamente; aquí avisa y tú confirmas.
- **Las pruebas de Rastro no se portaron**, porque prueban su motor de Node. El motor de esta app se verificó contra datos reales de la cadena.
- **Se corrigió la dirección de USDT**: la que usa Rastro no existe en la cadena.

## Límites

- Un escaneo completo hace entre 35 y 60 llamadas a Helius y tarda de 25 a 40 s. La búsqueda en un exchange es la parte cara.
- Helius etiqueta casi todos los trades hechos con bots como transferencias. *Seguir* los lee por cambio de balance; *Cazar* todavía filtra por "swap" y puede perder compradores.
- La llave de Helius viaja en las peticiones del navegador: úsala solo en tu máquina.
