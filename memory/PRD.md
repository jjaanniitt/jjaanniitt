# PRD — Node Gestiune (Logistica Detergenti)

## Original problem statement
Aplicatie mobila de logistica pentru un distribuitor de detergenti (consignatie). Trebuie sa: scoata fise de partener, introduca comenzi, incarce stocurile colaboratorilor, tina fise de colaboratori cu comenzile lor, fise de clienti (persoane sub colaborator), si evidenta clara a clientilor incasati vs in asteptare. Primul colaborator: MOD SHOP. Branding: Powered by Node Intelligence (nodeintelligence.ro).

## User choices
- Colaborator = magazin cu stoc in consignatie; colaboratorii au si clienti finali (persoane) cu fise separate.
- Stocul scade la CREAREA comenzii, indiferent de status.
- Login cu parola simpla (un singur operator): detergentzilnic@gmail.com / Zilnic2026!
- Export PDF pentru fise partener/client.
- Date pre-populate (produse din Excel + MOD SHOP) la seed-ul contului.

## Architecture
- Backend: FastAPI + MongoDB (motor), JWT (HTTPBearer, bcrypt), rute sub /api, id-uri uuid string.
  - Colectii: users, products, collaborators (stoc ca dict pe document), clients, orders, counters, meta.
  - Seed la startup: user admin, 18 produse, colaborator MOD SHOP cu stoc initial de consignatie.
- Frontend: Expo Router, react-query, token in secure storage. Design brutalist (SpaceGrotesk + IBM Plex Mono, radius 0, borduri 1pt).
  - Taburi: Panou / Comenzi / Produse / Parteneri.

## Implemented (2026-06)
- [x] Autentificare JWT + ecran login cu branding Node Intelligence
- [x] Catalog 18 produse (Ocean/Floral/Lavanda/Vase/Universal/Sapun/Odorizant) cu preturi RON
- [x] Dashboard KPI: de incasat, incasat, comenzi, produse vandute, stoc total, parteneri + alerta stoc negativ
- [x] Comenzi: lista + filtre status, creare comanda (colaborator -> client -> steppere produse -> total auto -> status), detaliu comanda cu toggle status si stergere (restaureaza stoc)
- [x] Colaboratori: lista, adaugare, fisa colaborator cu taburi Stoc/Clienti, ajustare stoc, adaugare client
- [x] Clienti: fisa client cu comenzi + incasat/de incasat
- [x] Export PDF fisa partener + fisa client (expo-print/sharing)
- [x] Stoc scade la creare comanda, poate deveni negativ (semnalat)

## Backlog (P1/P2)
- P1: Rapoarte pe perioada (lunar) si grafic vanzari
- P1: Editare comanda existenta
- P2: Cautare/filtrare in liste; multi-colaborator cu import stoc bulk
- P2: Istoric miscari de stoc

## Next tasks
- La cerere: editare comanda, rapoarte lunare, cautare.
