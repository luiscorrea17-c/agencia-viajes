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

- Data access goes only through `src/api` (typed interfaces + mocks) so a FastAPI backend can replace mocks without touching screens.
- Shared UI primitives live in `src/components/app/`; screens compose them instead of restyling.
- Route access is defined once in `NAV_ITEMS.allowedRoles` (src/api/auth.ts); module routes live under `src/routes/_authenticated/` and call `requireAccess(path)` so menu and guard never drift.
- Request contracts, session-scoped mock records, ownership checks and audit mutations belong in `src/api/requests.ts`; screens must not access or persist records directly so the mock service can be replaced independently.
- Solicitudes and the Client home compose the same RequestsScreen and actor-keyed query options; this prevents duplicated UI and cross-role cache exposure.
- Client dossier contracts, ownership, edit authorization and audit mutations live in `src/api/clients.ts`; actor-keyed queries keep screens replaceable and role caches isolated.
- Quote contracts, totals, approval rules and status transitions live in `src/api/quotes.ts`; the editor and client screens only call those services so FastAPI can replace them.
- Booking and payment contracts, ownership, balances and lifecycle mutations live in `src/api/bookings.ts`; screens only call actor-scoped services so FastAPI can replace the mocks.
- User management stays in the authentication mock service and never exposes passwords in user lists; this keeps login and account administration consistent.
- Staff home summaries are aggregated through `src/api/dashboard.ts` with role-scoped queries; the Client home continues to compose RequestsScreen.
