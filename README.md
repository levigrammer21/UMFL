# UMFL v1.2.1 hotfix

Upload every file directly to the repository root, replacing v1.2.0.

Fixed:
- Enter Qualifier button crash caused by the bracket builder calling a nonexistent `makeHandler()` function.
- Bracket handler data is now generated with the existing enemy-generation system.
- Existing v1.2.0 broken bracket data is automatically rebuilt.
- League-issued partner is generated once when the run is created and remains the same for that run.
- The Opening Team back button now returns Home instead of returning to the wheels and creating an accidental new run.
