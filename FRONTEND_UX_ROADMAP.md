# Frontend UX Roadmap

Updated: 2026-09-18

This document is written for a builder model to implement without further
design discussion. It continues the phase numbering in
[IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) (which ends at Phase
22) and follows the same convention: phases are self-contained,
forward-looking build instructions written before their code exists, each
with a goal, prerequisites, exact file paths, code sketches, and a
"Complete When" checklist. It does not contain narrative rationale beyond
what a builder needs to make correct decisions — the product rationale
lives in the UI/UX brief this roadmap implements (see note at the bottom).

**Scope boundary: this document does not build anything.** It is the spec
handed to whichever agent or engineer implements Phases 23–31. Each phase
is independently shippable and independently revertable; do not start a
phase whose prerequisites are unmet.

---

## Phase Summary

| Phase | Depends on | Description |
|-------|-----------|--------------|
| 23 | — | Command palette & grouped navigation |
| 24 | — | Global toast provider & notification center |
| 25 | — | User preferences: backend model + frontend store |
| 26 | 25 | Design system v2: Light theme, icon migration, accessibility |
| 27 | 24, 25 | DataTable power features: bulk actions, column control, saved views |
| 28 | 25 | Personalized, role-aware dashboard |
| 29 | 24 | Page restructuring: tabbed Genomics & Trial Manager, Germplasm view switcher |
| 30 | 29 | Master-detail panels & compare mode |
| 31 | 24 | Field-readiness: mobile action bar, barcode scan entry, offline conflict resolution |

Suggested build order: **23 → 24 → 25 → 26 → 27 → 28 → 29 → 30 → 31.**
23 and 24 have no dependencies and can be built in parallel by two agents.

---

## Cross-Cutting Architecture Decisions

Read this section before starting any phase. It fixes decisions that would
otherwise be re-litigated per phase and cause inconsistency between them.

### State placement

The app already draws a clean line between TanStack Query (server state,
`frontend/src/api/client.ts`) and Zustand (client/UI state,
`frontend/src/store/`). Keep it that way:

- **Zustand** (`store/uiStore.ts`, new `store/preferencesStore.ts`): theme,
  sidebar collapse state, table density, column visibility/order, saved
  view definitions, pinned records, dashboard widget layout. All of this
  is "how the UI is arranged," not domain data.
- **TanStack Query**: everything that comes from the API — germplasm,
  trials, observations, and (new in Phase 25) the user's preference record
  itself, fetched once and cached under `['preferences']`.
- Do not add Redux, Context-based global state, or a second data-fetching
  library. Do not put server data in Zustand or UI layout state in Query
  cache.

### New shared components live in `frontend/src/components/common/`

This directory already holds `DataTable.tsx`, `ContextMenu.tsx`,
`OfflineSyncBadge.tsx`, `OfflineSyncCenterModal.tsx`. Add to it, don't
create a parallel `components/ui/` or `components/shared/` directory.

### Offline-first persistence pattern for preferences

The app is offline-first (see `services/offlineStorage.ts`,
`services/syncManager.ts`). Preferences must follow the same pattern
already established for observations, not a new one:

1. Zustand `persist` middleware writes every preference change to
   `localStorage` immediately (instant, works offline, already the pattern
   `uiStore.ts` uses for theme).
2. A debounced mutation (500ms, via `useMutation` + a `setTimeout` guard —
   do not fire a network request per keystroke/drag) pushes the full
   preference blob to `PATCH /api/me/preferences/`.
3. On login, fetch `GET /api/me/preferences/` and merge server state over
   local state **only if** the server's `updated_at` is newer than the
   local copy's cached timestamp — last-write-wins, same conflict rule the
   sync queue already uses elsewhere. Never block first paint on this
   fetch; render with local/default state immediately, reconcile after.

### Icon library

Add `lucide-react` (tree-shakeable, no runtime CSS, MIT licensed) as the
only new runtime dependency across Phases 23–31 besides what individual
phases call out (barcode scanning in Phase 31). Do not add a component
framework (MUI, Ant, Chakra, Radix) — the existing hand-rolled CSS design
system in `index.css` is intentional and every phase below builds on its
token layer (`--bg-*`, `--text-*`, `--brand-*`, `--r-*`, `--space-*`)
rather than introducing a second styling system.

### Testing

Each phase adds or extends a Playwright spec under `frontend/tests/`,
matching the existing naming style (`kebab-case.spec.ts`, see
`breeding-cycle.spec.ts`). Run `npm run typecheck && npm run lint` before
considering any phase done — both are already wired as npm scripts.

### Backend conventions to follow exactly

New backend code in Phase 25 must match the existing `apps/core`
conventions or it will look foreign in review:

- `ModelViewSet` + `RoleBasedPermission` + `write_roles` set, as in
  `apps/core/viewsets.py`.
- `perform_create`/`perform_update` stamping `created_by`/`updated_by`.
- Serializers subclass `AuditSerializerMixin` where `created_by`/
  `updated_by` usernames are exposed (not needed for a single-owner
  preferences record, skip it there).
- New URLs registered in the existing `apps/core/urls.py` router, not a
  new app, since preferences are a `core` concern alongside `UserProfile`.

---

## Phase 23: Command Palette & Grouped Navigation

### Goal
Cut navigation to two keystrokes for any page or record. Replace the flat
12-item sidebar with labeled, collapsible sections.

### Prerequisites
None.

### 23.1 Grouped sidebar (2–3 hours)

Edit `frontend/src/components/Sidebar.tsx`. Replace the flat `NAV_ITEMS`
array with a grouped structure:

```ts
interface NavGroup {
  id: string
  label: string | null   // null = ungrouped, rendered at top (Dashboard)
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  { id: 'top', label: null, items: [
    { to: '/', label: 'Dashboard', icon: 'home', roles: null },
  ]},
  { id: 'breeding', label: 'Breeding', items: [
    { to: '/germplasm', label: 'Germplasm', icon: 'sprout', roles: null },
    { to: '/crosses', label: 'Crossing Block', icon: 'scissors', roles: new Set(['admin','breeder']) },
    { to: '/seed-inventory', label: 'Seed Inventory', icon: 'package', roles: null },
  ]},
  { id: 'trials', label: 'Field Trials', items: [
    { to: '/trials', label: 'Trial Manager', icon: 'layout-grid', roles: null },
    { to: '/observations', label: 'Observation Entry', icon: 'clipboard-edit', roles: null },
  ]},
  { id: 'analytics', label: 'Analytics', items: [
    { to: '/traits', label: 'Traits', icon: 'bar-chart-2', roles: new Set(['admin','breeder']) },
    { to: '/genomics', label: 'Genomics & MAS', icon: 'dna', roles: new Set(['admin','breeder']) },
    { to: '/analysis', label: 'Multi-Env Analysis', icon: 'trending-up', roles: new Set(['admin','breeder']) },
  ]},
  { id: 'admin', label: 'Admin', items: [
    { to: '/export', label: 'Data Export', icon: 'download', roles: null },
    { to: '/audit', label: 'Audit Trail', icon: 'shield', roles: new Set(['admin','breeder']) },
    { to: '/setup', label: 'Setup', icon: 'settings', roles: new Set(['admin','breeder']) },
  ]},
]
```

Collapse state per group persists in `uiStore.ts`:

```ts
// add to UiState in store/uiStore.ts
collapsedNavGroups: string[]
toggleNavGroup: (id: string) => void
```

Persisted automatically — `uiStore` already uses `zustand/middleware`
`persist`. A group defaults to expanded unless its id is in
`collapsedNavGroups`. Auto-collapse a group on mount if **none** of its
routes match the current location and the group was manually collapsed in
a prior session; never auto-collapse the group containing the active
route.

Icons: swap the `icon: '🏠'` emoji strings for the `icon:` string keys
above and render via `lucide-react` (see Phase 26.2 for the full icon
migration — Sidebar is the first component migrated, do it here rather
than twice):

```tsx
import { Home, Sprout, Scissors, Package, LayoutGrid, ClipboardEdit,
         BarChart2, Dna, TrendingUp, Download, Shield, Settings } from 'lucide-react'
const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  home: Home, sprout: Sprout, scissors: Scissors, package: Package,
  'layout-grid': LayoutGrid, 'clipboard-edit': ClipboardEdit,
  'bar-chart-2': BarChart2, dna: Dna, 'trending-up': TrendingUp,
  download: Download, shield: Shield, settings: Settings,
}
```

### 23.2 Command palette (5–7 hours)

New file: `frontend/src/components/common/CommandPalette.tsx`.

```ts
interface CommandItem {
  id: string
  group: 'Pages' | 'Records' | 'Actions'
  label: string
  sublabel?: string
  onSelect: () => void
}
```

**Registry pattern**, not a hardcoded list:

- `registerPageCommands()` — static, built once from `NAV_GROUPS` (Phase
  23.1). Every route becomes a `Pages`-group command that calls
  `navigate(to)`.
- `useRecordCommands(query: string)` — a hook that, only once the palette
  is open and `query.length >= 2`, fires lightweight React Query calls
  against endpoints that already exist (`germplasm.list`, `trials.list`,
  `crossingBlocks.list` in `api/client.ts`) filtered server-side by the
  existing `search=` param each list endpoint already supports (confirm
  against `SearchFilter` on the relevant viewset before wiring — germplasm
  and trials already have `search_fields` per `apps/*/viewsets.py`).
  Debounce 250ms. Cap 5 results per record type.
- `ACTION_COMMANDS` — static list wired to existing "create" entry points:
  New Observation → navigate to `/observations` + open its existing create
  flow; New Cross → `/crosses` + open modal; New Trial → `/trials` + open
  `TrialFormModal`; Import Field Book → `/trials` + open
  `ImportFieldBookModal`. Do not build new creation flows — the palette
  only needs to trigger modals/navigation that already exist.

**UI**: full-screen overlay, centered box, `<input>` at top, grouped
results below, keyboard nav (`ArrowUp`/`ArrowDown`/`Enter`/`Escape`),
highlighted match index. Style with existing tokens (`--bg-glass`,
`--r-lg`, `--shadow-lg`) so it looks native to the current theme
including Sunlight mode — do not hardcode dark-only colors.

**Global mount + shortcut**: mount `<CommandPalette />` once in `App.tsx`
inside `ProtectedLayout`. Register the `Ctrl+K` / `Cmd+K` listener at the
document level (`useEffect` + `keydown`, checking `e.metaKey || e.ctrlKey`)
in the same component, `e.preventDefault()` so it doesn't collide with
browser behavior. Also add a visible trigger button in `TopBar.tsx`
(magnifying-glass icon, `⌘K`/`Ctrl K` hint) for discoverability — keyboard
shortcuts that are never visually surfaced don't get adopted.

### 23.3 Breadcrumbs (2 hours)

New file: `frontend/src/components/common/Breadcrumbs.tsx`. Take a
`crumbs: { label: string; to?: string }[]` prop; render on drill-down
pages only (trial detail, cross detail, pedigree drill-in) — not on the
12 top-level pages, which already have a clear sidebar highlight. Add to
`TrialDetail.tsx` and `PedigreeTreeModal.tsx`'s parent context first,
since those are the deepest current drill paths.

### 23.4 Global program/season switcher (2–3 hours)

Move the program `<select>` currently local to `Dashboard.tsx` into
`TopBar.tsx`, backed by a new `uiStore` field:

```ts
activeProgramId: number | ''
setActiveProgramId: (id: number | '') => void
```

Every page-level list query that currently filters by a page-local
`selectedProgramId` state should read `activeProgramId` from `uiStore`
instead. This is a mechanical find-and-replace across
`GermplasmBrowser.tsx`, `TrialManager.tsx`, `CrossingBlock.tsx`,
`SeedInventory.tsx`, `Dashboard.tsx` — grep each for
`selectedProgramId`/`program` local state and redirect the read to the
store while leaving the query logic untouched.

### Phase 23 Complete When
- [ ] Sidebar renders 4 labeled, independently collapsible groups plus
      top-level Dashboard; collapse state survives reload.
- [ ] `Ctrl+K`/`Cmd+K` opens the palette from any authenticated page.
- [ ] Typing a page name, a germplasm accession code, or a trial code
      returns a relevant result within 300ms of the debounce firing.
- [ ] Selecting an Action command performs the same navigation+modal-open
      a user would get by hand.
- [ ] Program switcher in `TopBar` drives every page's data query;
      switching it updates Germplasm, Trials, Crosses, and Seed Inventory
      without a full reload.
- [ ] `npm run typecheck && npm run lint` pass.
- [ ] New spec `frontend/tests/command-palette.spec.ts` covers: open via
      shortcut, filter by query, navigate on select, close on Escape.

---

## Phase 24: Global Toast Provider & Notification Center

### Goal
One feedback system the whole app can call, replacing the toast logic
that currently exists only inside `PlotGrid.tsx`; a persistent
notification center for events that happen off-screen (sync, imports,
low stock).

### Prerequisites
None.

### 24.1 Extract the toast provider (2–3 hours)

`PlotGrid.tsx` (lines ~43, ~145–148 per the current file) already has
working toast state and a matching `.alert.alert-{type}` CSS class in
`index.css` — this is an extraction, not new design.

New file: `frontend/src/components/common/ToastProvider.tsx`:

```tsx
interface Toast { id: string; type: 'success' | 'error' | 'info'; text: string }
interface ToastContextValue { showToast: (text: string, type?: Toast['type']) => void }
const ToastContext = createContext<ToastContextValue | null>(null)
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const showToast = useCallback((text: string, type: Toast['type'] = 'info') => {
    const id = crypto.randomUUID()
    setToasts(t => [...t, { id, type, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000)
  }, [])
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map(t => <div key={t.id} className={`alert alert-${t.type}`}>{t.text}</div>)}
      </div>
    </ToastContext.Provider>
  )
}
```

Add `.toast-stack` to `index.css` (`position: fixed; bottom: var(--space-5);
right: var(--space-5); z-index: 1000; display: flex; flex-direction:
column; gap: var(--space-2);`) reusing the existing `.alert-*` classes
already styled for `PlotGrid`'s local toasts.

Mount `<ToastProvider>` once, wrapping `<ProtectedLayout>` in `App.tsx`
(inside the router so `useToast` composes with `useNavigate` if ever
needed). Then refactor `PlotGrid.tsx`'s local `showToast` calls to
`const { showToast } = useToast()` and delete its local `toastMessage`
state and the inline toast JSX (~lines 513–520) — behavior is unchanged,
implementation is shared.

Sweep the rest of the app for places that currently show feedback via
`window.alert`, silent failures, or nothing at all on
mutation success/error (check `ObservationEntry.tsx`,
`SendToTrialModal.tsx`, `ImportGermplasmModal.tsx`,
`ImportFieldBookModal.tsx` first — import/bulk operations are the most
common place users need confirmation) and route them through `useToast`.

### 24.2 Notification center (4–5 hours)

New file: `frontend/src/components/common/NotificationCenter.tsx` — a
bell icon in `TopBar.tsx` with an unread-count badge, opening a dropdown
panel.

This is **client-side aggregation only** in this phase — no new backend
model. Source events from what already exists:

- Sync queue events from `services/syncManager.ts` (sync started/
  completed/failed — check its current callback/event surface; if it only
  exposes state via polling today, add a minimal `EventTarget`-based emit
  so the notification center can subscribe instead of polling).
- Low seed stock — the Dashboard already queries
  `seedLots.getLowStock(50.0)`; move that query up to a shared location
  (a small `useLowStockAlerts()` hook in `components/common/`) so both the
  Dashboard widget and the Notification Center read the same cache key
  and don't double-fetch.
- Import completion — `ImportGermplasmModal` / `ImportFieldBookModal` call
  `showToast` today (per 24.1); also push a `Notification` entry so it's
  still visible after the toast's 5s auto-dismiss.

Keep notifications in a Zustand store (`store/notificationStore.ts`,
**not** `persist` — these are session-scoped, not saved preferences):

```ts
interface Notification { id: string; text: string; ts: number; read: boolean; kind: 'sync' | 'stock' | 'import' | 'qc' }
interface NotificationState {
  items: Notification[]
  push: (n: Omit<Notification, 'id' | 'ts' | 'read'>) => void
  markAllRead: () => void
  unreadCount: () => number
}
```

### Phase 24 Complete When
- [ ] `PlotGrid.tsx` has no local toast state; it calls `useToast()`.
- [ ] Any component can call `useToast().showToast(...)` and see a toast
      in the bottom-right stack, styled identically in Dark, Light
      (Phase 26), and Sunlight themes.
- [ ] Bell icon in `TopBar` shows an unread badge and a dropdown listing
      recent sync, stock, and import events.
- [ ] `frontend/tests/toast-notifications.spec.ts` covers: a toast
      appears and auto-dismisses; the notification bell badge increments
      on a low-stock event and clears on open.

---

## Phase 25: User Preferences — Backend Model + Frontend Store

### Goal
A single, versioned place to persist per-user UI preferences across
devices, laid under everything Phases 26–28 build on.

### Prerequisites
None (independent of 23/24, but blocks 26–28).

### 25.1 Backend model (2 hours)

`backend/apps/core/models.py` — add below `UserProfile`:

```python
class UserPreference(models.Model):
    """Free-form, versioned bag of per-user UI preferences.

    Deliberately a single JSONField rather than one column per
    preference: the frontend owns the shape of this blob (theme,
    table density, saved views, dashboard widget layout, pinned
    records, column config per table) and adds new keys without a
    migration. The backend only stores and returns it.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="preferences"
    )
    data = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Preferences({self.user.username})"
```

Run `python manage.py makemigrations core` and commit the generated
migration file.

### 25.2 Serializer + endpoint (1–2 hours)

`backend/apps/core/serializers.py`:

```python
class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = ["data", "updated_at"]
        read_only_fields = ["updated_at"]
```

`backend/apps/core/views.py` — a singleton "my own record"
endpoint, not a `ModelViewSet` (there is no list/detail-by-id concept
here, every user only ever sees their own row):

```python
class MyPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        pref, _ = UserPreference.objects.get_or_create(user=request.user)
        return Response(UserPreferenceSerializer(pref).data)

    def patch(self, request):
        pref, _ = UserPreference.objects.get_or_create(user=request.user)
        serializer = UserPreferenceSerializer(pref, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
```

`backend/apps/core/urls.py` — add alongside the existing `audit/*` paths:

```python
from .views import MyPreferencesView  # add to existing import line

urlpatterns = router.urls + [
    path("audit/recent_changes/", RecentChangesView.as_view(), name="recent-changes"),
    path("audit/entity_history/", EntityHistoryView.as_view(), name="entity-history"),
    path("me/preferences/", MyPreferencesView.as_view(), name="my-preferences"),
]
```

No `RoleBasedPermission`/`ProgramScopedQuerySetMixin` needed — this
endpoint is scoped to `request.user` directly and every authenticated
role may read/write their own preferences.

### 25.3 Frontend API client (30 min)

`frontend/src/api/client.ts` — add:

```ts
export interface UserPreferences {
  data: Record<string, unknown>
  updated_at: string
}
export const preferences = {
  get: (): Promise<UserPreferences> => request('/me/preferences/'),
  patch: (data: Record<string, unknown>): Promise<UserPreferences> =>
    request('/me/preferences/', { method: 'PATCH', body: JSON.stringify({ data }) }),
}
```
(match whatever the existing `request()` helper signature is in this
file — every other resource in `client.ts` follows the same shape.)

### 25.4 Frontend store (2–3 hours)

New file: `frontend/src/store/preferencesStore.ts`. Zustand + `persist`
(localStorage, instant, offline-safe) with a debounced push to the
backend:

```ts
interface PreferencesState {
  theme: 'dark' | 'light' | 'sunlight'
  tableDensity: 'comfortable' | 'compact'
  defaultLandingPage: string
  columnConfig: Record<string, ColumnConfig>   // keyed by table id
  savedViews: Record<string, SavedView[]>       // keyed by table id
  dashboardWidgets: DashboardWidgetConfig[]
  pinnedRecords: PinnedRecord[]
  _lastSyncedAt: string | null
  set: <K extends keyof PreferencesState>(key: K, value: PreferencesState[K]) => void
  hydrateFromServer: (data: UserPreferences) => void
}
```

`set()` updates local state (persisted instantly by the `persist`
middleware) **and** schedules the debounced `preferences.patch()` call
described in the Cross-Cutting section above. On app mount (in `App.tsx`,
once `isAuthenticated` is true), call `preferences.get()` once via
`useQuery(['preferences'], preferences.get)` and call
`hydrateFromServer()` in its `onSuccess`, applying the last-write-wins
rule against `_lastSyncedAt`.

Migrate the existing `theme` field out of `uiStore.ts` into
`preferencesStore.ts` in this phase (it's a preference, and Phase 26
adds a third theme option — better to move it once than touch
`toggleTheme` twice). Update every `useUiStore(s => s.theme)` call site
(`Sidebar.tsx`, `TopBar.tsx`) to `usePreferencesStore(s => s.theme)`.
Leave `mobileSidebarOpen` and the Phase 23 `collapsedNavGroups` in
`uiStore` — those are ephemeral/session UI state, not saved preferences.

### Phase 25 Complete When
- [ ] `GET /api/me/preferences/` returns `{data: {}, updated_at: ...}` for
      a fresh user; `PATCH` persists and returns the merged blob.
- [ ] Theme choice survives a full logout/login cycle on the same device
      **and** appears immediately (before the network round-trip) on a
      second device after that device's next load, once the fetch
      resolves.
- [ ] Preference writes work while offline (queued in localStorage,
      pushed once `navigator.onLine` is true again — reuse the online/
      offline detection already in `services/syncManager.ts` rather than
      writing a second one).
- [ ] `npm run typecheck && npm run lint` pass; backend
      `python manage.py test apps.core` passes with a new test file
      covering get/patch/permissions on the endpoint.

---

## Phase 26: Design System v2 — Light Theme, Icon Migration, Accessibility

### Goal
A third theme option, a real icon system, and an accessibility baseline —
the foundation every later phase's UI sits on.

### Prerequisites
Phase 25 (theme now lives in `preferencesStore`).

### 26.1 True Light theme (2–3 hours)

`index.css` already anchors every color to `--hue-brand` (142) and
`--hue-accent` (50) custom properties and demonstrates the pattern with
the existing `[data-theme="sunlight"]` block (~line 95). Add a third
block, `[data-theme="light"]`, as a normal-contrast counterpart to
Sunlight's high-contrast outdoor mode — same hue anchors, softer
lightness/saturation values than Sunlight, closer to typical office
screen brightness:

```css
[data-theme="light"] {
  --bg-base:      hsl(210, 20%, 97%);
  --bg-elevated:  hsl(0, 0%, 100%);
  --bg-card:      hsl(0, 0%, 100%);
  --bg-glass:     hsla(0, 0%, 100%, 0.85);
  --bg-hover:     hsl(210, 16%, 95%);
  --bg-input:     hsl(0, 0%, 100%);

  --text-primary:   hsl(220, 20%, 14%);
  --text-secondary: hsl(220, 12%, 38%);
  --text-muted:     hsl(220, 10%, 56%);
  --text-inverted:  hsl(0, 0%, 100%);

  --border-subtle:  hsla(220, 14%, 82%, 0.6);
  --border-default: hsla(220, 14%, 70%, 0.7);
  --border-brand:   hsla(var(--hue-brand), 55%, 40%, 0.7);

  --brand-300: hsl(var(--hue-brand), 55%, 40%);
  --brand-400: hsl(var(--hue-brand), 55%, 44%);
  --brand-500: hsl(var(--hue-brand), 55%, 36%);

  --shadow-sm: 0 1px 3px rgba(0,0,0,.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08);
  --shadow-lg: 0 8px 32px rgba(0,0,0,.10);
  --shadow-glow: 0 0 16px hsla(var(--hue-brand), 55%, 44%, 0.16);
}
```

Wire the toggle: `Sidebar.tsx`'s theme button and any new
Preferences-panel control (Phase 26.4) should cycle/select among
`'dark' | 'light' | 'sunlight'` and call
`document.documentElement.setAttribute('data-theme', value)` plus
`usePreferencesStore.getState().set('theme', value)`, exactly matching
the existing `toggleTheme` pattern in the (now-migrated, per 25.4)
preferences store.

### 26.2 Icon migration (4–6 hours)

`lucide-react` is already added in Phase 23.1 for the sidebar. Extend the
same `ICONS` map pattern to `TopBar.tsx` (menu, theme toggle, offline
badge, new command-palette trigger, new notification bell), `Modal.tsx`
(close button), `ConfirmDialog.tsx`, and the emoji used inside
`DataTable.tsx`'s export/sort affordances. Do **not** attempt every emoji
in the app in one pass — scope this phase to persistent chrome
(sidebar, topbar, modals, table controls); page-body emoji used as
one-off decoration (e.g., the 🌾 program-card icon in `Dashboard.tsx`) can
stay, since they're content accents, not interactive affordances that
need hover/disabled states.

### 26.3 Accessibility pass (4–6 hours)

Concrete, checkable items — not a general "improve a11y" instruction:

- Every icon-only `<button>` (sidebar collapse, topbar actions, modal
  close, DataTable sort/filter icons, command palette trigger) gets an
  `aria-label` describing the action, not the icon (`aria-label="Open
  command palette"`, not `aria-label="search icon"`).
- `Modal.tsx` and `ConfirmDialog.tsx`: confirm `role="dialog"` and
  `aria-modal="true"` are present (per the earlier audit, only these two
  files currently carry any `aria-*` — verify they're complete, not just
  present), add `aria-labelledby` pointing at the modal's heading id, and
  trap focus (`Tab`/`Shift+Tab` cycles within the modal, `Escape` closes,
  focus returns to the trigger element on close).
- Add a visible `:focus-visible` style in `index.css` for every
  interactive element (buttons, links, table rows with `onRowClick`,
  nav items) — check current CSS for `outline: none` rules and replace
  each with a token-based focus ring (`outline: 2px solid var(--brand-
  400); outline-offset: 2px;`) rather than removing focus indication.
- `DataTable.tsx` rows with `onRowClick` need `tabIndex={0}`,
  `role="button"`, and an `onKeyDown` handler firing on `Enter`/`Space` —
  currently only mouse click is wired.
- Add a skip-to-content link as the first focusable element in
  `App.tsx`'s `ProtectedLayout`, targeting the `.page-content` container.
- `prefers-reduced-motion`: wrap the `fade-in` animation class and any
  transition longer than 150ms in `index.css` with
  `@media (prefers-reduced-motion: no-preference) { ... }`.

### 26.4 Preferences panel page (2–3 hours)

New file: `frontend/src/pages/Preferences.tsx`, route `/preferences`
(link it from the user menu in `Sidebar.tsx`'s footer, not the main nav
groups — it's an account setting, not a workflow). Fields, all reading
from and writing to `usePreferencesStore`: theme (three-way selector,
replacing the current binary toggle button), table density, default
landing page (a `<select>` of the 12 routes), default program (reuses
the `Program` list query), date format. This is the first consumer of
`preferencesStore.columnConfig`/`savedViews`, so build it after 25.4 but
it can ship before 27 — those fields will simply be empty until Phase 27
starts writing to them.

### Phase 26 Complete When
- [ ] Three themes selectable, each rendering all existing pages
      correctly (spot-check Dashboard, Genomics, PlotGrid — the highest
      inline-style-density pages).
- [ ] Sidebar, TopBar, and modal controls render SVG icons, not emoji.
- [ ] Keyboard-only navigation (no mouse) can: open the command palette,
      navigate a DataTable's rows, open and close a modal, reach every
      sidebar link — verify manually, then encode the modal and table
      cases in `frontend/tests/accessibility.spec.ts` using Playwright's
      keyboard API.
- [ ] `/preferences` page saves and reloads every field correctly.

---

## Phase 27: DataTable Power Features

### Goal
Turn `DataTable`'s existing sort/filter/paginate/export/select
capabilities into a fully productive tool: bulk actions, persisted
column control, and saved views.

### Prerequisites
Phase 24 (toast feedback for bulk action results), Phase 25 (persistence
for column config and saved views).

### 27.1 Bulk action toolbar (3–4 hours)

`DataTable.tsx` already accepts `selectable`, `selectedIds`, and
`onSelectionChange`. Add a new prop:

```ts
bulkActions?: (selectedIds: (string | number)[], selectedItems: T[]) => React.ReactNode
```

When `selectedIds.length > 0`, render a toolbar row above the table
(replacing the default header actions row for that state) showing the
selection count and whatever `bulkActions` returns. Each page wires its
own actions — `GermplasmBrowser.tsx` passes tag/send-to-trial/export/
archive; `SeedInventory.tsx` passes bulk status change. Every bulk
action must call `useToast()` (Phase 24) on completion — "12 records
sent to trial" / "3 records failed: ..." — since a silent bulk operation
on a multi-hundred-row table is the worst case for user trust.

Bulk endpoints: check whether the target viewset already supports a
bulk operation (the roadmap's Phase 9.1 notes CSV bulk-import already
exists for germplasm) before adding a new bulk endpoint — prefer N
sequential `PATCH` calls via `Promise.allSettled` for actions with no
existing bulk endpoint, since breeding datasets here run in the
hundreds of rows, not tens of thousands, and a naive approach is fine
at this scale. Only add a dedicated bulk API endpoint if a page's bulk
action needs to touch more than ~500 rows at once.

### 27.2 Column control (4–5 hours)

Add to `DataTable.tsx`:

```ts
tableId?: string   // e.g. 'germplasm-browser' — required to enable persistence
enableColumnControl?: boolean
```

A "Columns" button (top-right of the table, near existing export button)
opens a small popover: checkbox per column to show/hide, drag handles
to reorder (use a minimal reorder implementation via HTML5 drag events —
do not add a drag-and-drop library for a list this short). On change,
call `usePreferencesStore.getState().set('columnConfig', { ...current,
[tableId]: newConfig })`. On mount, if `tableId` is set and a config
exists in the store, apply it to reorder/filter the `columns` prop
before rendering — this changes *presentation order and visibility*
only, never the underlying `data`.

### 27.3 Saved views (3–4 hours)

A "Views" dropdown next to the Columns button. A saved view captures the
table's current `columnFilters`, `sortKey`/`sortDirection`, and (if
column control is enabled) the current column config, under a
user-given name, written to
`preferencesStore.savedViews[tableId]`. Selecting a saved view from the
dropdown re-applies all three. Provide a "Default view" concept — one
saved view per table can be flagged default and auto-applied on table
mount instead of the current always-empty initial state.

Wire this into `DataTable.tsx` as an optional prop
(`enableSavedViews?: boolean`) so pages opt in per-table rather than
having it appear everywhere at once; start with `GermplasmBrowser.tsx`
and `TrialManager.tsx`'s table (the two highest-cardinality tables in
the app) and expand to others once the pattern is proven.

### Phase 27 Complete When
- [ ] Selecting rows in Germplasm Browser or Seed Inventory shows a bulk
      toolbar; a bulk action reports success/failure via toast.
- [ ] Hiding/reordering columns on a `tableId`-enabled table persists
      across reload and across devices (via Phase 25's sync).
- [ ] Saving a view, reloading the page, and selecting it from the Views
      dropdown reproduces the exact filter/sort/column state.
- [ ] `frontend/tests/datatable-power-features.spec.ts` covers bulk
      selection + a toast, and saved-view save/restore.

---

## Phase 28: Personalized, Role-Aware Dashboard

### Goal
Different default dashboards per role, and per-user customization on top
of the default.

### Prerequisites
Phase 25 (`dashboardWidgets` in `preferencesStore`).

### 28.1 Widget registry (3–4 hours)

Refactor `Dashboard.tsx`'s existing stat cards and charts
(`StatCard`, `ProgramCard`, the pipeline chart, low-stock list, recent
observations) into a registry of self-contained widget components under
a new `frontend/src/components/dashboard/` directory (mirrors the
existing `components/trials/`, `components/germplasm/` per-domain
grouping convention). Each widget is a component with no props beyond
`programId` — it fetches its own data via the query hooks already
present in `Dashboard.tsx` today (`useQuery(['programs'], ...)` etc.),
just relocated:

```
components/dashboard/
  ActiveTrialsWidget.tsx
  PendingObservationsWidget.tsx
  GenerationPipelineWidget.tsx
  LowStockWidget.tsx
  RecentCrossesWidget.tsx
  RecentObservationsWidget.tsx
```

`WIDGET_REGISTRY: Record<string, { component: React.ComponentType; label: string; defaultFor: Role[] }>`.

### 28.2 Role-based defaults + customization (3–4 hours)

`Dashboard.tsx` reads `preferencesStore.dashboardWidgets`. If empty
(first run), populate it from a per-role default map:

```ts
const ROLE_DEFAULTS: Record<string, string[]> = {
  technician: ['PendingObservationsWidget', /* offline queue status */],
  breeder:    ['GenerationPipelineWidget', 'RecentCrossesWidget', 'ActiveTrialsWidget'],
  admin:      ['ActiveTrialsWidget', 'LowStockWidget', 'GenerationPipelineWidget'],
  viewer:     ['ActiveTrialsWidget', 'RecentObservationsWidget'],
}
```

Add a "Customize" toggle in `Dashboard.tsx`'s `TopBar` actions slot. In
customize mode: each widget gets a remove (×) control and drag handle
(same minimal HTML5 drag approach as 27.2 — do not introduce a second
drag implementation), plus an "Add widget" tile listing anything in
`WIDGET_REGISTRY` not currently shown. Persist the resulting ordered
widget-id list to `preferencesStore.dashboardWidgets` on every change.

### Phase 28 Complete When
- [ ] A first-time technician login shows the technician default set; a
      first-time breeder login shows a different default set.
- [ ] Toggling Customize allows remove/reorder/add; the layout persists
      across reload.
- [ ] Every extracted widget renders identical output to what
      `Dashboard.tsx` produced before the refactor (no data or query
      regressions — this phase is a structural extraction plus a
      customization layer on top, not a data-model change).

---

## Phase 29: Page Restructuring — Tabs

### Goal
Break `Genomics.tsx` (~1,545 lines) and the Trial Manager detail view
(built around `PlotGrid.tsx`, ~1,209 lines) into tabbed shells, and give
`GermplasmBrowser.tsx` a List/Pedigree/Map view switcher.

### Prerequisites
Phase 24 (shared toast plumbing should exist before splitting these
files, since both currently have local feedback state worth
consolidating during the split rather than after).

### 29.1 Shared Tabs component (2 hours)

New file: `frontend/src/components/common/Tabs.tsx` — controlled
component, `tabs: { id: string; label: string; content: React.ReactNode
}[]`, `activeTab`, `onChange`. Sync active tab to the URL query string
(`?tab=field-map`) via `useSearchParams` from `react-router-dom` so a
direct link or browser-back lands on the right tab — this matters
specifically for Trial Manager, where a user coming from the Phase 23
command palette's record search should land on the right sub-view, not
always Overview.

### 29.2 Trial Manager (5–7 hours)

The sub-components already exist and are the right shape —
`components/trials/AdvancePlotsTab.tsx` and
`components/trials/GermplasmListTab.tsx` are already named as tabs, they
just aren't inside a tab shell yet. In `TrialDetail.tsx` (or wherever the
per-trial detail is currently assembled — confirm against
`pages/TrialManager.tsx`'s render tree), wrap the existing sections in
`<Tabs>`:

```
Overview        — existing trial metadata/summary section, unchanged
Field Map       — existing <PlotGrid /> usage, unchanged
Germplasm List  — existing <GermplasmListTab />, unchanged
Advancement     — existing <AdvancePlotsTab />, unchanged
Observations    — new: a filtered view of this trial's observations
                  (reuse ObservationGrid.tsx's read path if it supports
                  a trial filter; otherwise a simple filtered DataTable)
```

This phase should not change the behavior of any of the four
already-built sections — it relocates them under tab triggers. Budget
the majority of the time estimate for the "Observations" tab, which is
the one genuinely new piece.

### 29.3 Genomics & MAS (5–7 hours)

`Genomics.tsx` currently renders everything in one file/scroll. Split
into `components/genomics/` (new directory, mirrors `components/trials/`
convention) with one component per section identified by scanning the
current file's structure — expect roughly: `MarkerDataTab.tsx`, `
GebvSelectionTab.tsx`, `MasCrossesTab.tsx`, `DiversityAnalysisTab.tsx`.
`pages/Genomics.tsx` becomes a thin shell: shared page-level state
(selected dataset/program) plus `<Tabs>` wrapping the four extracted
components, each receiving the shared state as props. Follow the same
"relocate, don't rewrite" discipline as 29.2 — this phase is a structural
split of an already-working 1,545-line file, not a rebuild of its logic.
Given the size, do this section-by-section with a typecheck+lint pass
after each extraction rather than one large diff.

### 29.4 Germplasm Browser view switcher (3–4 hours)

`GermplasmBrowser.tsx` gets a view switcher (List / Pedigree / Trial
Locations) above the table, using the same `<Tabs>` component (or a
simpler segmented control if the three views don't share a content
shape — Pedigree and Trial Locations are not scrollable tables, so a
segmented-button switcher rather than an underline-tab bar may read
better here; use judgment, the shared `Tabs` component's job is state
management, not a mandated visual style). List is the existing table.
Pedigree reuses `components/pedigree/PedigreeTreeModal.tsx`'s rendering
logic inline instead of in a modal (check whether it's easily
de-modalized — if its internals assume modal-only lifecycle, wrap it in
a non-modal container rather than duplicating the tree logic). Trial
Locations is new: a simple list/map of trials containing the currently
filtered germplasm set.

### Phase 29 Complete When
- [ ] Trial Manager's detail view has 5 tabs; each renders what its
      pre-existing component rendered before, with no visual or
      functional regression, plus the new Observations tab.
- [ ] `Genomics.tsx` is under ~150 lines (a shell + tab wiring); each
      extracted tab component compiles and renders independently.
- [ ] Deep-linking to `/trials?tab=field-map` (or the Genomics
      equivalent) opens directly on that tab.
- [ ] Germplasm Browser's view switcher toggles between List and
      Pedigree without a page navigation.
- [ ] `npm run typecheck && npm run lint` pass after each of 29.2/29.3/
      29.4 individually, not just at the end.

---

## Phase 30: Master-Detail Panels & Compare Mode

### Goal
Inspect a record without losing the list's scroll position and filters;
compare multiple records side by side.

### Prerequisites
Phase 29 (detail views are now tab-shaped, which the detail panel below
reuses directly instead of building a second detail layout).

### 30.1 Detail drawer (4–5 hours)

New file: `frontend/src/components/common/DetailDrawer.tsx` — a panel
that slides in from the right (`position: fixed; right: 0; top:
var(--topbar-h); width: min(480px, 90vw); height: calc(100vh -
var(--topbar-h))`, using the same `--shadow-lg`/`--bg-elevated` tokens as
existing modals), not a full-screen modal, so the underlying list stays
visible and scrollable at its current position.

Add to `DataTable.tsx`:

```ts
detailPanel?: (item: T) => React.ReactNode
```

When set, `onRowClick` (if the page doesn't already override it) opens
`<DetailDrawer>{detailPanel(item)}</DetailDrawer>` instead of navigating
away. Wire this first on `GermplasmBrowser.tsx`, passing a lightweight
summary (name, pedigree, key trait values, a "View full record" link
that still navigates to the full page for anything the drawer doesn't
cover) — the drawer is for fast triage across many rows, not a
replacement for the full detail page.

### 30.2 Compare mode (5–6 hours)

Extend `DataTable.tsx`'s existing `selectable`/`selectedIds` (already
built in Phase 27.1 for bulk actions — reuse the same selection
mechanism, don't add a second one) with a "Compare" bulk action that
navigates to a new route, e.g. `/germplasm/compare?ids=142,143,145`.

New page: `frontend/src/pages/Compare.tsx` (or
`components/common/CompareView.tsx` mounted per-domain if germplasm,
trials, and crosses need different comparison columns — start with
germplasm only, generalize once that one is proven useful). Renders a
column per selected record, rows are the trait/attribute set — a
transposed table, effectively `DataTable` rotated, but simplest to
hand-build given the small, fixed row count (attribute comparison rarely
exceeds ~20 rows) rather than forcing `DataTable`'s row-oriented model
sideways.

### Phase 30 Complete When
- [ ] Clicking a Germplasm Browser row opens a detail drawer without
      losing table scroll/filter state; closing it (Escape or backdrop
      click) returns focus to the row that opened it.
- [ ] Selecting 2+ germplasm rows and choosing "Compare" from the bulk
      toolbar (Phase 27.1) opens a side-by-side view with pedigree and
      trait values per selected line.
- [ ] `frontend/tests/detail-and-compare.spec.ts` covers opening/closing
      the drawer and a 2-record compare flow.

---

## Phase 31: Field-Readiness

### Goal
Extend the app's existing offline-first and Sunlight-mode thinking
instead of treating mobile as a generic responsive afterthought.

### Prerequisites
Phase 24 (toast feedback for scan results and sync conflicts).

### 31.1 Mobile bottom action bar for Observation Entry (2–3 hours)

In `pages/ObservationEntry.tsx` / `components/ObservationGrid.tsx`, add a
`position: fixed; bottom: 0` action bar (Save, Next Plot) visible only
below the existing mobile breakpoint (`@media (max-width: 900px)`,
matching the breakpoint already used for `mobileSidebarOpen` behavior in
`Sidebar.tsx`). Ensure it doesn't overlap the last row of the entry
grid — add `padding-bottom` to the grid's scroll container equal to the
bar's height on mobile.

### 31.2 Barcode/QR scan entry (5–7 hours)

Add a scan-icon button next to plot/accession ID fields in
`ObservationEntry.tsx` and `SeedInventory.tsx`. Use the browser's native
`BarcodeDetector` API where available (Chrome/Edge on Android — check
`'BarcodeDetector' in window`); fall back to a JS-decoded approach via
`@zxing/browser` (loaded on demand, not in the main bundle — dynamic
`import()` when the scan button is first pressed, since most desktop
sessions will never use it and it shouldn't inflate the primary bundle).
On a successful scan, populate the associated ID field and call
`useToast().showToast('Scanned WB24-0142', 'success')` — give explicit
confirmation, since the user's attention is on the camera view, not the
form.

### 31.3 Offline conflict resolution UI (4–5 hours)

Extend the existing `components/common/OfflineSyncCenterModal.tsx`
(currently 243 lines — confirm its current conflict handling, if any,
before adding to it) with a per-record view for the case where a queued
observation's plot/trait was also edited server-side before the device
came back online. Show both versions side by side (Local / Server) with
a per-field "Keep local" / "Keep server" choice, defaulting the whole
record to whichever pattern the existing sync logic in
`services/syncManager.ts` already uses (if it's currently silent
last-write-wins, keep that as the pre-selected default and let this UI
be an override, not a mandatory step for every sync — most syncs have no
conflict and must not gain a new manual step).

### 31.4 Sunlight-mode touch targets (1–2 hours)

Add a `[data-theme="sunlight"]` override block in `index.css` increasing
minimum tap target size (`min-height: 44px` → `52px` on buttons and nav
items) and spacing between adjacent interactive elements, since Sunlight
mode is specifically the one-handed-outdoor-use mode. Do not change
target sizes in Dark/Light — this is scoped to Sunlight only.

### Phase 31 Complete When
- [ ] Observation Entry on a viewport ≤ 900px shows a fixed bottom action
      bar; entering data and scrolling never hides it.
- [ ] Scan button populates the ID field on a successful scan and shows
      a confirmation toast; gracefully falls back (or hides itself with
      a tooltip explaining why) on a device with no camera / no
      `BarcodeDetector` and a failed `@zxing/browser` load.
- [ ] A simulated offline-edit-then-server-edit conflict surfaces a
      Local/Server choice in the sync center instead of silently
      dropping one version.
- [ ] Sunlight mode's buttons and nav items measure ≥ 52px tall.
- [ ] `frontend/tests/field-readiness.spec.ts` covers the mobile action
      bar's visibility and the conflict-resolution UI rendering both
      versions.

---

## Reference

This roadmap implements the recommendations in the UI/UX brief
(command palette, grouped navigation, toast/notification layer,
personalization, tabbed restructuring, master-detail, field-readiness)
by turning each into buildable phases against the actual current
codebase (React 18 + Vite + TanStack Query + Zustand frontend; Django +
DRF backend with `apps/core`, `apps/germplasm`, `apps/trials`,
`apps/genomics`). It assumes no prior familiarity with that brief — every
phase here is self-contained and file-path-specific enough to build from
directly.
