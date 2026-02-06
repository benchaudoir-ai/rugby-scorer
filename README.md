# Rugby Scorer

Offline-first web app for scoring rugby matches: team setup, live scoring, cards, substitutions, and match log. Data is stored in the browser (IndexedDB via [Dexie](https://dexie.org)) so it works without a server.

**Database strategy:** See [docs/DATABASE_STRATEGY.md](docs/DATABASE_STRATEGY.md) for schema (teams, players, matches + log), offline behaviour, and implementation phases (players/rosters + stats, match history, new match flow).

**Admin:** A hidden admin screen is available at `/admin` (e.g. `http://localhost:5173/admin`). It is protected by a password. Set the environment variable `VITE_ADMIN_PASSWORD` to your chosen password (e.g. in a `.env` file); if unset, the default password is `admin` (for testing). From the admin screen you can clear all data or add demo data (Reeds team with sample players).

**Production /admin:** The build outputs `404.html` (copy of `index.html`) so that GitHub Pages serves the app for `/admin` and other client routes. Netlify uses `public/_redirects`; Vercel uses `vercel.json` rewrites. Redeploy after pulling these changes so `/admin` works in production.

### Deploy via Git

1. **Check the build**
   ```bash
   npm run build
   ```

2. **Commit and push**
   ```bash
   git add .
   git status
   git commit -m "Your message"
   git push origin main
   ```

3. **Hosting** – If the repo is connected to Vercel, Netlify, or GitHub Pages, a new deploy usually runs automatically on push to `main`. Set `VITE_ADMIN_PASSWORD` in the host’s environment variables for production.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
