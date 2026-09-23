# GYM & FOOD (`addome-piatto`)

App web italiana per allenamenti guidati, nutrizione, progressi e coaching.

## Link

- App: https://addome-piatto.vercel.app/
- Repo: https://github.com/Andrew231716/addome-piatto
- Vercel project: `prj_d5YizMWCQOqmBzEnUl4afnptZ6bS`
- Production branch: `main` (deploy automatico su push/PR)

## Funzionalità

- Auth reale (registrazione / login) con password PBKDF2
- Persistenza IndexedDB per utente
- Navigazione URL (`/allenamenti`, `/alimentazione`, `/progressi`, `/coach`, `/profilo`)
- API:
  - `GET /api/health`
  - `POST /api/sync` (backup cloud su GitHub Contents API)

## Sviluppo locale

```bash
npm install
npm run build:vercel
```

## Env Vercel

- `GITHUB_TOKEN` — usato da `/api/sync`
- `GITHUB_REPO` — `Andrew231716/addome-piatto`
