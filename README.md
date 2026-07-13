# UMFL v1.0.0

A complete mobile-first static game for GitHub Pages.

## Root-level files

Upload all of these directly to the root of the repository:

- `index.html`
- `styles.css`
- `data.js`
- `app.js`
- `firebase.js`
- `firestore.rules`

## GitHub Pages

1. Open repository **Settings**
2. Open **Pages**
3. Select **Deploy from a branch**
4. Select `main`
5. Select `/ (root)`
6. Save

## Firebase setup

1. Authentication → Sign-in method → enable **Google**
2. Authentication → Sign-in method → enable **Email/Password**
3. Authentication → Settings → Authorized domains → add your GitHub Pages domain
4. Firestore Database → create database
5. Firestore Database → Rules → paste `firestore.rules` and publish

## Included game systems

- 25 primary animals
- 25 secondary animals
- 40 fixed starting mutations
- Animal-specific and secondary-specific move pools
- Deterministic layered SVG mutant portraits
- Opening wheel sequence with limited persistent-credit rerolls
- Qualifier, 8, 16, 32, 64, 128 and 256 brackets
- 1v1, 2v2 and 3v3 battles
- Action-gauge speed system
- Target selection
- Enemy AI
- Direct, area, guard, healing and utility moves
- Burn, poison, bleed, slow and weaken effects
- Crits, evasion, counters, reflection, lifesteal, revival and many mutation effects
- Exact defeated-mutant recruitment
- Five-mutant run roster with replacement decisions
- Career records, run history and discovery counters
- Firebase cloud saves
- Google and email authentication
- Online leaderboards
- Local offline save fallback
- Visible version number

The game uses Firebase's browser CDN modules, so no build command or package manager is required.
