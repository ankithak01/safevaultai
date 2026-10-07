<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Signed-in pages live under `src/routes/_authenticated/` and share `AppShell`; data reads go through the browser client with owner-only access rules — keeps each user's documents private.
- AI document extraction and Q&A run in `src/lib/ai.functions.ts` server functions behind auth — the AI key never reaches the browser.
- Uploaded files go to the private `documents` bucket under a `<user_id>/` folder prefix — storage rules match on that folder.
