# GYM & FOOD (`addome-piatto`)

App web italiana per allenamenti guidati, nutrizione, progressi e coaching.

## Produzione

- URL: https://addome-piatto.vercel.app/
- Progetto Vercel: `prj_d5YizMWCQOqmBzEnUl4afnptZ6bS`

## Cosa include ora

- Auth reale (registrazione / login) con password PBKDF2
- Persistenza IndexedDB per utente
- Navigazione URL (`/allenamenti`, `/alimentazione`, …)
- API Vercel:
  - `GET /api/health`
  - `POST /api/sync` (cloud sync via GitHub Contents API quando `GITHUB_TOKEN` + `GITHUB_REPO` sono impostati)

## Script utili

```bash
npm install
npm run build:vercel
npm run publish:github   # richiede GITHUB_TOKEN (+ opzionale VERCEL_TOKEN)
```

`publish:github` crea il repo GitHub, fa push su `main` e collega il progetto Vercel.

## Env Vercel per sync cloud

- `GITHUB_TOKEN` — PAT con scope `repo`
- `GITHUB_REPO` — es. `username/addome-piatto`
