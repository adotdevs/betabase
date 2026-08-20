# Betabase AI Help Center

Static help center served at **https://www.betabase.pro/help/**

## Update after client sends new files

1. Extract or replace `savings-plans-and-earn/` at the repo root.
2. Run:

```powershell
cd help-center
.\build-and-copy.ps1
```

This rebrands "Acme Exchange" → **Betabase**, fixes URLs, copies into `FE/public/help/`, and rebuilds the full-text search index.

3. Deploy the frontend.

## Search

Every help page has a search box in the header. It searches **all articles and category pages**, including full body text (not just titles).

Rebuild the index after adding or editing articles:

```powershell
node help-center/build-search-index.js
```

## Hostinger manual upload

Upload the contents of `FE/public/help/` to `public_html/help/` on Hostinger.

## Source folder

| Path | Role |
|------|------|
| `savings-plans-and-earn/` | Client's extracted help center (pre-built HTML) |
| `FE/public/help/` | Deployed copy (included in React build) |

If the client sends source with `config.json` + `build.js` instead, set `basePath` to `/help`, run `node build.js`, then point `rebrand-and-copy.js` at the `dist/` output.
