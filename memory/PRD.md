# PRD — Node Gestiune (Logistica Detergenti)

## Original problem statement
Aplicatie mobila de logistica (consignatie) pentru distribuitor de detergenti. Fise partener/client, comenzi, stocuri colaboratori, evidenta incasari. Branding Node Intelligence (nodeintelligence.ro).

## User choices (cumulate)
- Colaborator = magazin cu stoc in consignatie; are clienti finali cu fise separate.
- Stocul scade la crearea comenzii; intrarile se fac prin foi de consignatie (PV).
- Login parola simpla: detergentzilnic@gmail.com / Zilnic2026!
- Export PDF fise. Pre-populare produse din Excel.
- Partenerii incep de la 0; MOD SHOP resetat la 0.
- Abonamente Free/Basic(50)/Avansat(100)/Pro(200) cu limite stricte; activare manuala acum (plata reala la publicare).
- Poza profil in Object Storage. Scanare cod de bare la comenzi si procese verbale.

## Architecture
- Backend FastAPI + Mongo (motor), JWT auth, uuid ids, rute /api.
  - Colectii: users, products, collaborators, clients, orders, consignments, counters, meta.
  - Object Storage (Emergent) pentru avatar. Plans config + enforcement.
- Frontend Expo Router + react-query. Design brutalist (SpaceGrotesk + IBM Plex Mono, radius 0).
  - Taburi: Panou / Comenzi / Produse / Parteneri. Cont + Abonament accesibile din Panou.

## Implemented
- [x] (iter1) Auth, catalog 18 produse, dashboard KPI, comenzi + status + sum, parteneri, clienti, fise, PDF, stoc scade la comanda
- [x] (iter2) Editare comanda, cautare comenzi/clienti, prag stoc scazut, rapoarte lunare, adaugare produse
- [x] (iter3) Foaie de consignatie (PV, +stoc), tab Intrari + coloane Intrat/Iesit, dashboard pe perioada (azi/luna/tot) + vanzari pe categorii + totaluri pe produs (buc/litri/valoare), abonamente 4 planuri cu limite stricte + activare manuala, ecran Cont (poza profil Object Storage, nume, plan, usage, deconectare), scanare cod de bare (expo-camera) la comenzi/consignatie + alocare barcode pe produs

## Note importante
- Scanarea cod de bare + poza profil din camera functioneaza pe build real pe telefon (nu in web preview); in Expo Go pe telefon real camera merge.
- Plata reala abonament se leaga la publicare (RevenueCat). Acum activare manuala din ecranul Abonament.

## Implemented (continuare)
- [x] (iter4) Scanare cu prompt de cantitate la comenzi, editare/stergere produse, incasare partiala (paid/payments, status Partial), toate totalurile pe baza de paid/ramas
- [x] (iter5) Data proces verbal la consignatie, scanare cu cantitate la consignatie, stergere produse direct din tab-ul Stoc al colaboratorului

## NodeOne — rebuild pe faze (schimbare de directie)
- [x] FAZA 1: Rebrand NodeOne (logo nou, icon, splash, tema dark navy stil nodeintelligence.ro); arhitectura MULTI-TENANT:
      firma-mama (parent) + parteneri izolati; inregistrare partener prin cod de invitatie; depozit central;
      consignatia scade din central si creste la partener; vanzarile partenerului scad doar stocul lui;
      izolare completa pe organizatie; gating pe rol in UI. (testat: iteration_6, 12/12 + frontend)
- [~] FAZA 2: Dashboard imbogatit — KPI-uri + card FACTURARE (facturat/de incasat/TVA luna); grafice/tabele avansate PIMS raman de extins
- [x] FAZA 3: Facturare stil Oblio — profil firma, facturi din comanda, TVA, incasare partiala, PDF (model Oblio), editare/stergere factura
- [x] INTEGRARE OBLIO: conectare cont Oblio (email+API secret+CIF+serie) in Date firma; buton „Emite in Oblio" pe factura -> emite in contul Oblio al userului si deschide PDF-ul (token cache, per-organizatie). Netestat live (necesita credentiale reale Oblio de la user).
- [x] AUTOCOMPLETARE CUI: buton „Preia date după CUI" in Date firma -> completeaza automat denumire/adresa/reg.com/telefon. Sursa: ANAF v9 (merge din IP permis, productie RO) cu fallback VIES (UE, fara cheie, doar platitori TVA). ANAF e blocat din preview (401 IP), VIES merge.

## Backlog
- P1: Plata reala in-app (RevenueCat) la publicare
- P2: e-Factura ANAF/SPV (dupa Faza 3)
