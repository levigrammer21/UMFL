# UMFL v1.1.0

Upload every file directly to the repository root.

## Firebase checklist for Google sign-in

1. Firebase Console → Authentication → Sign-in method → enable **Google**.
2. Enable **Email/Password** if desired.
3. Authentication → Settings → Authorized domains → add your exact GitHub Pages host, such as `levigrammer.github.io`.
4. Firestore Database → create the database.
5. Firestore Database → Rules → paste `firestore.rules` and publish.
6. Reload the GitHub Pages site after publishing.

The game now displays useful Firebase errors for disabled providers and unauthorized domains.

## v1.1.0 additions

- All three initial wheels begin hidden and require an explicit free spin.
- Longer spin and reroll animation.
- Synthesized click, wheel, combat, KO, victory, and defeat sounds.
- Synthesized underground fight music.
- Complete in-game field manual.
- Detailed scouting cards and full mutant inspection.
- Full horizontally scrollable tournament bracket.
- Clickable handlers with active rosters.
- More colorful visual treatment.
- Accuracy, misses, glancing blows, critical hits, evasion.
- Per-move accuracy display.
- Recovery explanation and action-timeline behavior.
- Move cooldowns to prevent repeatedly spamming strong attacks.
- Settings modal close button fixed.
- Automatic default target remains selected, including 1v1 fights.
- Firebase popup-first Google sign-in with redirect fallback.
