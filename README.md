# rastro

Sigue las wallets de Solana de la gente que te interesa y te dice cuál es su **wallet activa**.

Cuando alguien se muda de wallet (manda su SOL/USDC a una nueva y empieza a comprar desde ahí),
rastro sigue el dinero, ve que la nueva wallet compra monedas y la marca como la activa. Repite
el proceso salto por salto (A → B → C …), incluso si el dinero pasa por una wallet puente que solo reenvía.

## Uso

```bash
node server.js                         # panel en http://localhost:4777 (revisa cada 5 min)
node cli.js add "alias" <wallet>       # seguir a alguien desde la terminal
node cli.js check                      # rastrear ahora
node cli.js watch 5                    # vigilar en bucle con notificaciones de macOS
```

## Cómo decide cuál es la activa

1. Lee las últimas 40 transacciones de la wallet actual: compras, ventas y envíos de SOL/USDC/USDT.
2. Toma los envíos de 0.2 SOL o 20 USD para arriba y revisa cada wallet que los recibió.
3. Si esa wallet **compró monedas después de recibir el dinero** y compró más recientemente que la actual, es la nueva activa.
4. Si el dinero regresa a una wallet anterior y esa vuelve a comprar, vuelve a ser la activa.
5. Si solo reenvió el dinero, la atraviesa (hasta 2 puentes). Si lo recibió pero no ha comprado, queda en "vigilar".
6. Ignora exchanges y bots (más de 200 tx por hora).

Los umbrales están en `DEFAULTS` de `lib/tracker.js`.

## Qué no se le escapa

- **Tiempo real:** cada wallet vigilada (activas, anteriores, las que también compran y las que acaban de recibir
  dinero) está suscrita por websocket de Helius. Una compra o un envío avisa en ~1–2 s, con notificación de macOS.
  Si alguien manda dinero a una wallet nueva, esa wallet se vigila al instante. Respaldo: revisión completa cada 5 min.
- **Ninguna mudanza perdida:** cada revisión lee todo lo ocurrido desde la anterior (hasta 3000 transacciones por wallet),
  aunque el panel haya estado apagado. La primera vez lee las últimas 24 h.
- **Sin polvo:** compras/ventas de menos de 0.01 SOL (y 1 USD) no cuentan.
- **Mudanzas vía exchange:** si el dinero entra a un exchange, busca retiros de ~la misma cantidad (90–101%) en las 6 h
  siguientes hacia wallets nuevas que después compraron. Si hay una sola coincidencia, es la nueva wallet; si hay varias,
  se marcan en rosa como "posibles" y tú decides. Solo depósitos de las últimas 72 h.
- **Tokens falsos:** un token que copia la dirección de USDT, USDC, SOL, JUP, BONK, WIF, etc., o que usa su símbolo
  y se hace pasar por él (nombre "USDT", "Tether USD"…), es una imitación: no avisa y no cuenta como compra.

## Qué cuenta como wallet que tradea

Solo las wallets que compran y venden memecoins son "wallets de la persona". Lo demás es el camino del dinero:

- **Imitaciones y estables no son trading.** Un "USDT" que copia la dirección del real, o comprar estables / SOL en staking, se lee como el envío de dinero que era. Una memecoin que solo comparte el símbolo (p. ej. una llamada "USDC") sí cuenta.
- **Puente**: solo reenvía. Si una wallet de la cadena no tiene ni una compra ni una venta, sale de la cadena y se dibuja como el puente entre las dos que sí tradean.
- **Depósito / servicio**: recibe de 6 o más wallets distintas y no compra. No se sigue ni se vigila.
- **Otra persona**: una wallet de alguien más que sigues nunca se le asigna a esta. Y pasando por puentes, una wallet que ya tradeaba antes de recibir el dinero tampoco (es otra persona que recibió un envío).
- **Mucho ritmo ≠ exchange**: si una wallet hace más de 200 tx/h pero la mayoría son compras firmadas por ella, es alguien que tradea mucho y se sigue normal.

## Buscar por CA

Pega el CA de una moneda en el buscador de arriba, en la pestaña 🔎 CA, o toca la 🔎 de una compra en la terminal. Revisa a fondo las wallets de cada persona y las de su red (anteriores, "también compra", "vigilar", posibles vía exchange, puentes) y dice quién la compró, con qué wallet, cuántas veces, cuánto gastó y recibió, la primera y la última vez, y si todavía tiene tokens.

No lee miles de transacciones: calcula la cuenta de ese token de cada wallet (ATA) y lee solo su historial, que queda aunque ya haya vendido todo. Si pegas una wallet en vez de un CA y es de la red de alguien, te lleva a ella. Las últimas búsquedas quedan como atajos.

## Coincidencias (convergencia)

Si 2 o más personas distintas compran la misma moneda en menos de 30 min, llega un aviso 🎯 en la Mac y en el panel, y la tarjeta queda en "Coincidencias · 24 h" (quién, con qué wallet, cuánto y a qué hora). Si se suma una tercera persona, vuelve a avisar. Una persona con dos wallets cuenta como una; las imitaciones no cuentan. La ventana se cambia con `CONVERGE_MIN=15 node server.js`.

## Panel

Red de wallets por persona (d3): la activa en verde, las anteriores en gris, puentes en violeta,
"vigilar" en ámbar, exchanges apagados. Mientras busca, la red se arma en vivo (stream SSE en
`/api/stream`) y un feed narra cada paso. La barra de búsqueda acepta un nombre o cualquier wallet
del historial y salta directo a ese nodo.

## Velocidad

Con Helius configurado una persona se revisa en segundos; con el RPC público tarda 1–3 min. En `.env`:

```
RPC_URL=https://mainnet.helius-rpc.com/?api-key=TU_LLAVE
```

Datos en `data/` (lista de seguidos, último resultado y caché de transacciones).
