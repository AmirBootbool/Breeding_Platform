# Builder Execution Spec — Wheat Breeding Platform: Field Book Round Trip + Shortlist Loop

## Rules before you start

- Work through the tickets in the exact order given (A1 → A2 → A3 → B1 → B2 → B3 → B4 → B5). Do not reorder, skip, or combine tickets.
- Before editing any file, open it and confirm the quoted "current code" actually matches what's there. If it doesn't match, stop and report the mismatch — do not guess or improvise a fix.
- Change only what each ticket specifies. Do not refactor, rename, reformat, or "clean up" any other code in a file you touch.
- After each ticket, run the Verification command listed for it and confirm the stated result before starting the next ticket.
- If a step says "confirm X before proceeding," that is a hard gate, not a suggestion.

---

## Section A — Field Book round trip

### Ticket A1 — Unify the Field Book export and add the missing columns

**Goal:** Today two separate code paths generate the "Field Book" export file and they've drifted apart. Neither includes `row`/`column`-derived walking order or Field Book's native `unique_id` identifier column. Fix both by creating one shared function and adding three columns: `unique_id`, `walking_order_h_serpentine`, `walking_order_v_serpentine`. Reuse the existing, already-tested `compute_walking_orders` function — do not write new walking-order math.

**File 1: `backend/apps/trials/services.py`**

Insert this new function immediately after the existing `compute_walking_orders` function (which ends with `return h_order, v_order`):

```python
def prepare_fieldbook_export(trial):
    """Build (headers, plots, row_for) for a Field Book compatible export of
    a trial's plot layout. Shared by the export_fieldbook API action and the
    export_fieldbook management command so the two never drift. row_for is a
    per-plot function, not a materialized list, so the CSV path can keep
    streaming one row at a time instead of buffering the whole trial."""
    from .models import ObservationVariable, Plot

    plots = (
        Plot.objects.filter(trial=trial)
        .select_related("germplasm")
        .order_by("plot_number")
    )
    variables = list(ObservationVariable.objects.all().order_by("name"))
    var_names = [v.name for v in variables]
    headers = [
        "plot_id", "range", "plot", "entry", "unique_id",
        "walking_order_h_serpentine", "walking_order_v_serpentine",
    ] + var_names

    field_rows = trial.field_rows or max([p.row or 1 for p in plots] + [1])
    field_cols = trial.field_cols or max([p.column or 1 for p in plots] + [1])
    corner = trial.starting_corner or "BL"

    def row_for(plot):
        r = plot.row or 1
        c = plot.column or 1
        h_order, v_order = compute_walking_orders(r, c, field_rows, field_cols, corner)
        return [
            plot.plot_number, plot.rep, plot.plot_number, plot.germplasm.name,
            plot.plot_number, h_order, v_order,
        ] + [""] * len(variables)

    return headers, plots, row_for
```

**File 2: `backend/apps/trials/viewsets.py`**, lines 280–321. The current code is:

```python
    @action(detail=True, methods=["get"])
    def export_fieldbook(self, request, pk=None):
        """Download a Field Book compatible CSV (default) or XLSX file for this trial."""
        trial = self.get_object()
        plots = (
            Plot.objects.filter(trial=trial)
            .select_related("germplasm")
            .order_by("plot_number")
        )
        variables = list(ObservationVariable.objects.all().order_by("name"))
        var_names = [v.name for v in variables]
        headers = ["plot_id", "range", "plot", "entry"] + var_names

        def row_for(plot):
            return [
                plot.plot_number,
                plot.rep,
                plot.plot_number,
                plot.germplasm.name,
            ] + [""] * len(variables)

        filename_base = f"{trial.trial_code}_fieldbook"

        if request.query_params.get("output_format") == "xlsx":
            return build_xlsx_response(
                headers, [row_for(plot) for plot in plots], filename_base
            )

        def generate():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(headers)
            yield buf.getvalue()
            for plot in plots:
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(row_for(plot))
                yield buf.getvalue()

        response = StreamingHttpResponse(generate(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
        return response
```

Replace the whole method with:

```python
    @action(detail=True, methods=["get"])
    def export_fieldbook(self, request, pk=None):
        """Download a Field Book compatible CSV (default) or XLSX file for this trial."""
        from .services import prepare_fieldbook_export

        trial = self.get_object()
        headers, plots, row_for = prepare_fieldbook_export(trial)
        filename_base = f"{trial.trial_code}_fieldbook"

        if request.query_params.get("output_format") == "xlsx":
            return build_xlsx_response(
                headers, [row_for(plot) for plot in plots], filename_base
            )

        def generate():
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(headers)
            yield buf.getvalue()
            for plot in plots:
                buf = io.StringIO()
                writer = csv.writer(buf)
                writer.writerow(row_for(plot))
                yield buf.getvalue()

        response = StreamingHttpResponse(generate(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
        return response
```

Do not touch the method immediately after this one (`import_fieldbook`).

**File 3: `backend/apps/trials/management/commands/export_fieldbook.py`.** The current `handle` method contains this block (between fetching `trial` and the `if fmt == "xlsx":` check):

```python
        plots = (
            Plot.objects.filter(trial=trial)
            .select_related("germplasm")
            .order_by("plot_number")
        )
        variables = ObservationVariable.objects.all().order_by("name")

        headers = ["plot_id", "range", "plot", "entry"] + [
            var.name for var in variables
        ]

        def row_for(plot):
            # Field Book format maps plot_id & plot to plot_number,
            # range to rep, entry to name; empty columns for variables/traits.
            return [
                plot.plot_number,
                plot.rep,
                plot.plot_number,
                plot.germplasm.name,
            ] + [""] * len(variables)
```

Replace it with:

```python
        from apps.trials.services import prepare_fieldbook_export

        headers, plots, row_for = prepare_fieldbook_export(trial)
```

Leave everything else in the file (the `if fmt == "xlsx":` block and CSV-writing block, which already call `row_for(plot)`) unchanged.

**Test updates**, `backend/tests/test_api_trials.py`:
- In `test_export_fieldbook_returns_csv_download` (~line 239), add: `assert "unique_id" in content`, `assert "walking_order_h_serpentine" in content`, `assert "walking_order_v_serpentine" in content`.
- In `test_export_fieldbook_xlsx_format` (~line 256), add: `assert "unique_id" in rows[0]`, `assert "walking_order_h_serpentine" in rows[0]`. The existing `rows[0][:4] == ("plot_id", "range", "plot", "entry")` assertion stays unchanged and still passes — the new columns land after index 3.

**Verification:**
```
cd backend
.\.venv\Scripts\python -m pytest -q tests/test_api_trials.py -k fieldbook
.\.venv\Scripts\python -m pytest -q
```
Both must pass with zero failures and the same or higher total passed count as before your change.

### Ticket A2 — Accept `unique_id` on import

**File: `backend/apps/trials/services.py`, line 896.**

Current:
```python
    for col in ["plot_id", "plot", "plot_number", "plotnumber", "Plot"]:
```
New:
```python
    for col in ["plot_id", "plot", "plot_number", "plotnumber", "Plot", "unique_id"]:
```
This is the entire change. Do not touch any other line in this function.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q tests/test_api_trials.py -k import_fieldbook` — must still pass.

### Ticket A3 — Partial commit on import

**Goal:** Today one bad row rolls back the whole file. Add an opt-in `allow_partial` flag (default `False`, so nothing changes unless a caller explicitly asks) that commits valid rows and reports the rest as errors instead of discarding everything.

**File 1: `backend/apps/trials/services.py`.** Change the function signature (~line 857) from:
```python
def import_fieldbook_csv(
    trial: Trial, file_obj, filename: str = "", dry_run: bool = False, user=None
) -> dict:
```
to:
```python
def import_fieldbook_csv(
    trial: Trial, file_obj, filename: str = "", dry_run: bool = False,
    allow_partial: bool = False, user=None
) -> dict:
```

Near the end of the function (~line 1036), the code currently reads:
```python
        if dry_run or errors:
            transaction.set_rollback(True)

    return {
        "imported_count": imported_count if not (dry_run or errors) else 0,
        "updated_count": updated_count if not (dry_run or errors) else 0,
        "matched_variables": list({v.name for v in matched_cols.values()}),
        "errors": errors,
```
Re-read the live file to confirm this matches (there may be additional keys after `"errors": errors,` — leave any of those untouched). Change only the rollback condition and the two count lines:
```python
        if dry_run or (errors and not allow_partial):
            transaction.set_rollback(True)

    committed = not dry_run and (not errors or allow_partial)
    return {
        "imported_count": imported_count if committed else 0,
        "updated_count": updated_count if committed else 0,
        "matched_variables": list({v.name for v in matched_cols.values()}),
        "errors": errors,
```

**File 2: `backend/apps/trials/viewsets.py`, `import_fieldbook` method (lines 329–365).** Make exactly three changes:
1. Immediately after the existing `dry_run = request.data.get(...)` line, add:
   ```python
   allow_partial = request.data.get("allow_partial") in ("true", "True", "1", True)
   ```
2. In the `import_fieldbook_csv(...)` call, add `allow_partial=allow_partial,` as a new keyword argument.
3. Change:
   ```python
   if result.get("errors"):
   ```
   to:
   ```python
   if result.get("errors") and not (result.get("imported_count") or result.get("updated_count")):
   ```

**File 3: `frontend/src/api/client.ts`, `importFieldBook` function (~line 496).** Current:
```ts
  importFieldBook: async (trialId: number, file: File, dryRun: boolean = false): Promise<FieldBookImportResult> => {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Token ${token}`
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dry_run', dryRun ? 'true' : 'false')
```
New:
```ts
  importFieldBook: async (trialId: number, file: File, dryRun: boolean = false, allowPartial: boolean = false): Promise<FieldBookImportResult> => {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers['Authorization'] = `Token ${token}`
    }
    const formData = new FormData()
    formData.append('file', file)
    formData.append('dry_run', dryRun ? 'true' : 'false')
    formData.append('allow_partial', allowPartial ? 'true' : 'false')
```

**File 4: `frontend/src/components/trials/ImportFieldBookModal.tsx`.**
- Add state next to the existing `dryRun` state (line 19): `const [allowPartial, setAllowPartial] = useState(false)`.
- In `mutationFn` (line 32), change:
  ```ts
  return trials.importFieldBook(trial.id, file, dryRun)
  ```
  to:
  ```ts
  return trials.importFieldBook(trial.id, file, dryRun, allowPartial)
  ```
- After the existing "Dry Run" checkbox block (lines 172–181), add:
  ```tsx
  <div className="flex items-center gap-2 mt-1">
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input
        type="checkbox"
        checked={allowPartial}
        disabled={dryRun}
        onChange={(e) => setAllowPartial(e.target.checked)}
      />
      <span><strong>Import valid rows even if some rows have errors</strong> — otherwise the whole file is rejected together</span>
    </label>
  </div>
  ```
- Change the error banner text (line 219) from:
  ```tsx
  <span>Import failed with {result?.errors.length} error(s). All database changes were rolled back.</span>
  ```
  to:
  ```tsx
  <span>
    {(result?.imported_count || result?.updated_count)
      ? `Imported ${result?.imported_count} and updated ${result?.updated_count} rows; ${result?.errors.length} row(s) had errors and were skipped.`
      : `Import failed with ${result?.errors.length} error(s). All database changes were rolled back.`}
  </span>
  ```

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (full suite, no regressions). `cd frontend; npx tsc --noEmit` (0 errors).

---

## Section B — Shortlist loop (phenotype/MEA-only, no genomics dependency)

### Ticket B1 — Add `germplasm_id` to the ranking endpoint

**File: `backend/apps/trials/services.py`, function `compute_cross_environment_ranking`.** There are exactly three places that build a ranking dict (two fallback blocks and the main statistical-model path). Each already resolves `germ = Germplasm.objects.filter(name=name, program=analysis_set.program).first()` right before building its dict. In **all three places**, add one line immediately after `"germplasm": name,`:
```python
                    "germplasm_id": germ.id if germ else None,
```
`germplasm_id` must be allowed to be `None` (no Germplasm row matched the name in that program) — do not raise an error for that case. No other line in this function changes. No serializer class wraps this response (it's returned via plain `Response(compute_cross_environment_ranking(...))` in `viewsets.py`), so this dict change alone is sufficient on the backend.

**File: `frontend/src/api/client.ts`, `RankingEntry` interface (~line 660).** Add one field:
```ts
export interface RankingEntry {
  germplasm: string
  germplasm_id: number | null
  adjusted_mean: number
  raw_mean: number
  n_observations: number
  n_environments: number
  family_group: string | null
  raw_means_by_env: Record<string, number>
}
```

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q tests/test_api_trials.py -k ranking` — must pass. Add an assertion in the existing ranking test confirming `germplasm_id` is present and correct.

### Ticket B2 — `SelectionShortlist` model and API

**File 1: `backend/apps/germplasm/models.py`.** Change the top import line from:
```python
from apps.core.models import Location, Program
```
to:
```python
from apps.core.models import Location, Program, Season
```
Append this new model at the **end of the file** (after the existing `Cross` model):
```python
class SelectionShortlist(models.Model):
    """A germplasm marked as a candidate parent for an upcoming crossing
    season, sourced from a performance ranking (e.g. MultiEnvironmentAnalysis)
    or added manually. Presence of a row means "currently shortlisted" —
    there is at most one row per (germplasm, program)."""

    SOURCE_CHOICES = [
        ("mea", "Multi-Environment Ranking"),
        ("manual", "Manual"),
    ]

    germplasm = models.ForeignKey(
        Germplasm, on_delete=models.CASCADE, related_name="shortlist_entries"
    )
    program = models.ForeignKey(
        Program, on_delete=models.CASCADE, related_name="shortlist_entries"
    )
    season = models.ForeignKey(
        Season, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="shortlist_entries",
    )
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="manual")
    note = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("germplasm", "program")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.germplasm.name} shortlisted ({self.source})"
```
Uniqueness is on `(germplasm, program)`, not `(germplasm, season)` — a nullable `season` column would let duplicate rows slip past most databases' NULL-uniqueness handling. `season` is metadata here, not part of the row's identity.

**File 2: `backend/apps/germplasm/serializers.py`.** Add `SelectionShortlist` to the existing `from .models import ...` line at the top, then add:
```python
class SelectionShortlistSerializer(serializers.ModelSerializer):
    germplasm_name = serializers.CharField(source="germplasm.name", read_only=True)
    season_name = serializers.CharField(source="season.name", read_only=True, default=None)

    class Meta:
        model = SelectionShortlist
        fields = [
            "id", "germplasm", "germplasm_name", "program", "season", "season_name",
            "source", "note", "created_by", "created_at",
        ]
        read_only_fields = ["id", "program", "created_by", "created_at"]
```

**File 3: `backend/apps/germplasm/viewsets.py`.** Change line 9 from:
```python
from .models import Cross, Germplasm
```
to:
```python
from .models import Cross, Germplasm, SelectionShortlist
```
Change line 10 from:
```python
from .serializers import CrossSerializer, GermplasmSerializer
```
to:
```python
from .serializers import CrossSerializer, GermplasmSerializer, SelectionShortlistSerializer
```
Append this new viewset at the end of the file:
```python
class SelectionShortlistViewSet(ProgramScopedQuerySetMixin, viewsets.ModelViewSet):
    queryset = SelectionShortlist.objects.select_related(
        "germplasm", "program", "season"
    ).all()
    serializer_class = SelectionShortlistSerializer
    permission_classes = [RoleBasedPermission]
    write_roles = {"admin", "breeder"}
    filterset_fields = ["program", "season", "source"]

    def perform_create(self, serializer):
        germplasm_obj = serializer.validated_data["germplasm"]
        serializer.save(program=germplasm_obj.program, created_by=self.request.user)

    @action(detail=False, methods=["post"])
    def toggle(self, request):
        """Create the shortlist entry if it doesn't exist, delete it if it
        does. Body: {"germplasm": <id>, "source": "mea"|"manual"}."""
        germplasm_id = request.data.get("germplasm")
        if not germplasm_id:
            return Response({"detail": "germplasm is required."}, status=400)
        try:
            germplasm_obj = Germplasm.objects.get(pk=germplasm_id)
        except Germplasm.DoesNotExist:
            return Response({"detail": "Germplasm not found."}, status=404)

        # Fail closed, matching ProgramScopedQuerySetMixin.get_queryset():
        # a program-scoped user must not toggle a shortlist entry for
        # germplasm outside their own program, even by guessing an id.
        if not self._is_platform_admin() and germplasm_obj.program_id != self._user_program_id():
            return Response({"detail": "Germplasm not found."}, status=404)

        existing = SelectionShortlist.objects.filter(
            germplasm=germplasm_obj, program=germplasm_obj.program
        ).first()
        if existing:
            existing.delete()
            return Response({"shortlisted": False})

        SelectionShortlist.objects.create(
            germplasm=germplasm_obj,
            program=germplasm_obj.program,
            source=request.data.get("source", "manual"),
            created_by=request.user,
        )
        return Response({"shortlisted": True}, status=201)
```
The program check inside `toggle` is not optional — do not omit it.

**File 4: `backend/apps/germplasm/urls.py`.** Change line 5 from:
```python
from .viewsets import CrossViewSet, GermplasmViewSet
```
to:
```python
from .viewsets import CrossViewSet, GermplasmViewSet, SelectionShortlistViewSet
```
Add one line after the existing `router.register(r"crosses", ...)` line:
```python
router.register(r"selection-shortlist", SelectionShortlistViewSet, basename="selection-shortlist")
```

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations germplasm
.\.venv\Scripts\python manage.py migrate
```
Confirm exactly one new migration file is generated and it applies cleanly.

**Tests to add** (follow the existing germplasm API test file's fixture style): `POST /api/selection-shortlist/toggle/` with a valid germplasm creates a row and returns `{"shortlisted": true}`; calling it again on the same germplasm deletes the row and returns `{"shortlisted": false}`; a program-B user toggling a program-A germplasm gets 404.

**Verification:**
```
cd backend
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python manage.py spectacular --file openapi.yaml --validate
```
Both must pass with zero errors — this ticket adds a new endpoint, so the OpenAPI schema must regenerate cleanly per this repo's convention.

### Ticket B3 — Frontend API client

**File: `frontend/src/api/client.ts`.** Add, near `RankingEntry`:
```ts
export interface ShortlistEntry {
  id: number
  germplasm: number
  germplasm_name: string
  program: number
  season: number | null
  season_name: string | null
  source: 'mea' | 'manual'
  note: string
  created_by: number | null
  created_at: string
}

export const selectionShortlist = {
  list: (params = '') =>
    apiFetch<PaginatedResponse<ShortlistEntry>>(`/selection-shortlist/?page_size=200${params}`),
  toggle: (germplasmId: number, source: 'mea' | 'manual' = 'manual') =>
    apiFetch<{ shortlisted: boolean }>('/selection-shortlist/toggle/', {
      method: 'POST',
      body: JSON.stringify({ germplasm: germplasmId, source }),
    }),
}
```

### Ticket B4 — MultiEnvironmentAnalysis: persisted shortlist checkbox

**File: `frontend/src/pages/MultiEnvironmentAnalysis.tsx`.**
- Add `selectionShortlist` to the existing import block from `'../api/client'` (lines 3–12).
- This file already has `const queryClient = useQueryClient()` at line 35 inside the main component — reuse that variable, do not create a second one.
- Near the existing `rankingRes` query, add:
  ```ts
  const { data: shortlistRes } = useQuery({
    queryKey: ['selection-shortlist'],
    queryFn: () => selectionShortlist.list(),
  })
  const shortlistedIds = new Set((shortlistRes?.results ?? []).map(e => e.germplasm))

  const toggleShortlistMutation = useMutation({
    mutationFn: (germplasmId: number) => selectionShortlist.toggle(germplasmId, 'mea'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['selection-shortlist'] }),
  })
  ```
- In the ranking table header (~line 363), add a new first `<th>` with no label.
- In each row (~line 377), add a new first `<td>` before the existing rank cell:
  ```tsx
  <td>
    <input
      type="checkbox"
      disabled={row.germplasm_id == null}
      title={row.germplasm_id == null ? 'Not linked to a germplasm record' : undefined}
      checked={row.germplasm_id != null && shortlistedIds.has(row.germplasm_id)}
      onChange={() => row.germplasm_id != null && toggleShortlistMutation.mutate(row.germplasm_id)}
    />
  </td>
  ```
- Update the empty-state `colSpan={7}` (~line 407) to `colSpan={8}`.
- This ticket requires `germplasm_id` on `RankingEntry` (Ticket B1) — confirm B1 is done before starting this.

### Ticket B5 — CrossingBlock: shortlist filter and star badges

**File: `frontend/src/pages/CrossingBlock.tsx`.**
- Add `selectionShortlist` to the existing import block from `'../api/client'` (lines 3–7).
- In the main `CrossingBlock` component (starts at line 209), add, alongside the other `useQuery` calls:
  ```ts
  const { data: shortlistRes } = useQuery({
    queryKey: ['selection-shortlist'],
    queryFn: () => selectionShortlist.list(),
  })
  const shortlistedIds = new Set((shortlistRes?.results ?? []).map(e => e.germplasm))
  ```
- Pass `shortlistedIds={shortlistedIds}` as a new prop on both `<GermplasmPanel>` usages (female panel ~line 502, male panel ~line 514).
- In the `GermplasmPanel` component (lines 26–91):
  - Add `shortlistedIds: Set<number>` to the props type (lines 29–32) and destructure it in the function parameter list (line 27).
  - Add local state: `const [shortlistedOnly, setShortlistedOnly] = useState(false)`.
  - In the `filtered` `useMemo` (lines 34–40), extend the filter predicate with `&& (!shortlistedOnly || shortlistedIds.has(e.id))`, and add `shortlistedOnly, shortlistedIds` to its dependency array.
  - Next to the existing search bar (lines 49–54), add:
    ```tsx
    <label className="text-xs" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input type="checkbox" checked={shortlistedOnly} onChange={e => setShortlistedOnly(e.target.checked)} />
      ★ Shortlisted only
    </label>
    ```
  - In each row (lines 65–85), add a star marker right before the `germplasm_db_id` span:
    ```tsx
    {shortlistedIds.has(entry.id) && <span title="Shortlisted">★</span>}
    ```

**Verification:** `cd frontend; npx tsc --noEmit` — must report 0 errors. Manual check: toggle a checkbox in MultiEnvironmentAnalysis, open Crossing Block, confirm the same germplasm shows a ★ and appears when "Shortlisted only" is checked; toggle it off in MEA and confirm the star disappears in Crossing Block.

---

## Section C — Tier 1 platform improvements (do after A and B)

These four tickets come from a separate, broader season-workflow audit (not the Field Book/Shortlist work above). Work them in order C1 → C2 → C3 → C4. C2 depends on C1 landing first if you want the `purpose` field included in the clone payload — otherwise C2 can be done without it.

**Correction to note before starting:** an earlier version of this audit claimed no trial "clone/duplicate" feature existed. That was wrong — it was based on a backend-only search. `frontend/src/pages/TrialManager.tsx` already has a working `cloneMutation` (lines 142–157) and a clone button wired to `TrialCard`'s `onClone` prop. Ticket C2 below fixes the two real gaps in that existing feature — it does not rebuild it from scratch.

### Ticket C1 — Nursery-purpose tagging

**Goal:** `Trial` has no field distinguishing a yield trial from a screening nursery from an advancement nursery — every trial is stored identically regardless of purpose. Add a `purpose` field so trials can be tagged and filtered by what they're actually for.

**File 1: `backend/apps/trials/models.py`.** In the `Trial` class, immediately after the `STATUS_CHOICES` list (ends right before `name = models.CharField(max_length=255, db_index=True)`), add:
```python
    PURPOSE_CHOICES = [
        ("yield_trial", "Yield Trial"),
        ("screening_nursery", "Screening Nursery"),
        ("advancement_nursery", "Advancement Nursery"),
        ("other", "Other"),
    ]
```
Then, immediately after the `status` field definition (the field with `choices=STATUS_CHOICES, default="active", db_index=True`), add:
```python
    purpose = models.CharField(
        max_length=32, choices=PURPOSE_CHOICES, default="yield_trial", db_index=True
    )
```

**File 2: `backend/apps/trials/serializers.py`.** In `TrialSerializer.Meta.fields`, add `"purpose",` immediately after `"status",`.

**File 3: `backend/apps/trials/viewsets.py`.** Change:
```python
    filterset_fields = ["program", "season", "location", "design_type", "status", "generation"]
```
to:
```python
    filterset_fields = ["program", "season", "location", "design_type", "status", "generation", "purpose"]
```

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations trials
.\.venv\Scripts\python manage.py migrate
```

**File 4: `frontend/src/api/client.ts`.** In the `Trial` interface, add one field after `status: 'active' | 'completed' | 'archived'`:
```ts
  purpose: 'yield_trial' | 'screening_nursery' | 'advancement_nursery' | 'other'
```

**File 5: `frontend/src/pages/TrialManager.tsx`.**
- Add state next to the other filter states (after `filterGen`): `const [filterPurpose, setFilterPurpose] = useState('')`.
- Add it to the `params` array, after the `filterGen` line: `` filterPurpose ? `&purpose=${filterPurpose}` : '', ``.
- Add `filterPurpose` to the `activeFilters` count array (currently `[filterProgram, filterLocation, filterSeason, filterDesign, filterStatus, filterGen]`).
- Add `setFilterPurpose('')` to the filter-clearing button's onClick alongside the other `setFilter*('')` calls.
- Add a new `<select>` in the toolbar, right after the `filterGen` select:
  ```tsx
  <select className="select-input" value={filterPurpose} onChange={e => setFilterPurpose(e.target.value)} style={{ flex: '0 0 160px' }}>
    <option value="">All purposes</option>
    <option value="yield_trial">Yield Trial</option>
    <option value="screening_nursery">Screening Nursery</option>
    <option value="advancement_nursery">Advancement Nursery</option>
    <option value="other">Other</option>
  </select>
  ```
- Find the `TrialFormModal` component in this same file (used for both create and edit) and add a `purpose` select field to its form, mirroring its existing `design_type` select field's structure exactly, defaulting to `'yield_trial'`. This component was not read during this audit — locate its `design_type` field yourself and copy its pattern; do not guess at line numbers.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (no regressions). `cd frontend; npx tsc --noEmit` (0 errors). Manually confirm the new filter narrows the trial list and the create/edit form saves a `purpose` value.

### Ticket C2 — Fix trial "Clone" to support season rollover

**Goal:** The existing clone feature (`cloneMutation`, `frontend/src/pages/TrialManager.tsx` lines 142–157) silently copies the source trial's exact `season`/`location` instead of asking where the new season should be planted, and never copies `field_rows`, `field_cols`, `starting_corner`, `advancement_direction`, or `layout_schema`. Replace the plain confirmation dialog with a small form modal that asks for the target season/location and copies every design field.

**File 1: create `frontend/src/components/trials/CloneTrialModal.tsx`** (new file):
```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { trials, Trial, Location, Season, ApiError } from '../../api/client'

interface CloneTrialModalProps {
  trial: Trial
  locationList: Location[]
  seasonList: Season[]
  onClose: () => void
}

export default function CloneTrialModal({ trial, locationList, seasonList, onClose }: CloneTrialModalProps) {
  const qc = useQueryClient()
  const [location, setLocation] = useState(String(trial.location))
  const [season, setSeason] = useState(String(trial.season))
  const [error, setError] = useState('')

  const filteredSeasons = seasonList.filter(s => !s.program || s.program === trial.program)

  const cloneMutation = useMutation({
    mutationFn: () => trials.create({
      name: `${trial.name} (Copy)`,
      trial_code: `${trial.trial_code}-COPY`,
      program: trial.program,
      location: Number(location),
      season: Number(season),
      design_type: trial.design_type,
      num_reps: trial.num_reps,
      block_size: trial.block_size,
      prep_fraction: trial.prep_fraction,
      field_rows: trial.field_rows,
      field_cols: trial.field_cols,
      starting_corner: trial.starting_corner,
      advancement_direction: trial.advancement_direction,
      layout_schema: trial.layout_schema,
      purpose: trial.purpose,
      notes: trial.notes,
      status: 'active',
      generation: trial.generation,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trials'] })
      onClose()
    },
    onError: (err) => setError(err instanceof ApiError ? JSON.stringify(err.detail) : (err as Error).message),
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <p className="text-sm text-muted">
        Clone <strong>{trial.trial_code}</strong>'s design (reps, block size, field layout) into a new trial with no plots or observations. Pick the season and location for the new trial.
      </p>
      {error && <div className="alert alert-error"><span>⚠</span><span>{error}</span></div>}
      <div className="form-group">
        <label className="form-label">Location</label>
        <select className="form-input" value={location} onChange={e => setLocation(e.target.value)}>
          {locationList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Season</label>
        <select className="form-input" value={season} onChange={e => setSeason(e.target.value)}>
          {filteredSeasons.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year})</option>)}
        </select>
      </div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onClose} disabled={cloneMutation.isPending}>Cancel</button>
        <button className="btn btn-primary" onClick={() => cloneMutation.mutate()} disabled={cloneMutation.isPending}>
          {cloneMutation.isPending ? 'Cloning…' : 'Clone Trial'}
        </button>
      </div>
    </div>
  )
}
```
If `purpose` (Ticket C1) hasn't been done, remove the `purpose: trial.purpose,` line. Confirm `Location` and `Season` are exported interfaces from `client.ts` (they're used the same way in `frontend/src/components/SendToTrialModal.tsx`) before relying on this import.

**File 2: `frontend/src/pages/TrialManager.tsx`.**
- Remove the `cloneMutation` definition (lines 142–157) — its logic now lives in the new modal.
- Re-read the render block around `{/* Clone confirm */}` (currently using `ConfirmDialog` with a `message`/`onConfirm`/`onCancel` prop, guarded by `{cloneTrial && (...)}`) and replace its *contents* with:
  ```tsx
  {/* Clone into new season */}
  {cloneTrial && (
    <Modal title={`Clone "${cloneTrial.trial_code}"`} onClose={() => setCloneTrial(null)}>
      <CloneTrialModal
        trial={cloneTrial}
        locationList={locationList}
        seasonList={seasonList}
        onClose={() => setCloneTrial(null)}
      />
    </Modal>
  )}
  ```
  Keep the surrounding `{cloneTrial && ( ... )}` guard exactly as it already is — only the JSX inside changes.
- Add the import: `import CloneTrialModal from '../components/trials/CloneTrialModal'`.
- If `ConfirmDialog` is no longer referenced anywhere else in this file after this change, remove its now-unused import; if it's still used for the delete confirmation elsewhere in the file, leave it.

**Verification:** `cd frontend; npx tsc --noEmit` (0 errors). Manual check: clone a trial, pick a different season/location in the modal, confirm the new trial appears with the new season/location and the same `design_type`/`num_reps`/`field_rows`/`field_cols`/`starting_corner`/`advancement_direction` as the source, with zero plots.

### Ticket C3 — Proactive missing-observation alerts

**Goal:** No feature today flags a trial that should be underway but has no scoring data yet. `PendingObservationsWidget.tsx` on the Dashboard is misleadingly named — it currently only checks seed stock and crossing-block status, not observations at all. Add the rule: an active trial planted more than 21 days ago with zero recorded observations is flagged.

**File 1: `backend/apps/trials/viewsets.py`, inside `TrialViewSet`.** Add a new action:
```python
    @action(detail=False, methods=["get"], url_path="needs_attention")
    def needs_attention(self, request):
        """Active trials planted more than 21 days ago with zero recorded
        observations across any of their plots."""
        from datetime import timedelta
        from django.utils import timezone

        cutoff = timezone.now().date() - timedelta(days=21)
        qs = (
            self.get_queryset()
            .filter(status="active", planting_date__isnull=False, planting_date__lte=cutoff)
            .exclude(plots__observations__isnull=False)
            .distinct()
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)
```
This reuses `self.get_queryset()`, so `ProgramScopedQuerySetMixin` scoping applies automatically — do not bypass it by querying `Trial.objects` directly.

**File 2: `frontend/src/api/client.ts`.** In the `trials` object, add, after the `advancePlots` entry:
```ts
  needsAttention: () => apiFetch<Trial[]>('/trials/needs_attention/'),
```

**File 3: create `frontend/src/components/common/useNeedsAttentionTrials.ts`** (new file, mirrors `useLowStockAlerts.ts` in the same directory):
```ts
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { trials, Trial } from '../../api/client'
import { useNotificationStore } from '../../store/notificationStore'

export function useNeedsAttentionTrials() {
  const pushNotification = useNotificationStore((s) => s.push)
  const notifiedTrialIdsRef = useRef<Set<number>>(new Set())

  const query = useQuery<Trial[]>({
    queryKey: ['trials', 'needs-attention'],
    queryFn: () => trials.needsAttention(),
    staleTime: 60_000,
  })

  const staleTrials = query.data ?? []

  useEffect(() => {
    if (staleTrials.length > 0) {
      staleTrials.forEach((trial) => {
        if (!notifiedTrialIdsRef.current.has(trial.id)) {
          notifiedTrialIdsRef.current.add(trial.id)
          pushNotification({
            title: `No observations yet: ${trial.trial_code}`,
            text: `${trial.trial_code} (${trial.name}) was planted over 21 days ago but has no recorded observations.`,
            kind: 'qc',
          })
        }
      })
    }
  }, [staleTrials, pushNotification])

  return query
}
```
`kind: 'qc'` is already a valid `NotificationItem` kind in `frontend/src/store/notificationStore.ts` — do not add a new kind.

**File 4: `frontend/src/components/dashboard/PendingObservationsWidget.tsx`.**
- Add the import: `import { useNeedsAttentionTrials } from '../common/useNeedsAttentionTrials'`.
- Next to the existing `const { data: lowStockLots } = useLowStockAlerts()`, add: `const { data: staleTrials } = useNeedsAttentionTrials()`.
- In the `pendingTasks` `useMemo`, add a new task block right after the low-stock block:
  ```tsx
  if (staleTrials && staleTrials.length > 0) {
    tasks.push({
      icon: '📋',
      title: `${staleTrials.length} Trial(s) With No Observations Yet`,
      desc: `${staleTrials[0].trial_code} was planted over 21 days ago with no scoring recorded.`,
      actionText: 'Review Trial',
      path: '/trials',
      severity: 'warning',
    })
  }
  ```
- Add `staleTrials` to that `useMemo`'s dependency array (currently `[lowStockLots, crossingBlocksData]`).

**File 5:** open `frontend/src/components/common/NotificationCenter.tsx`, find its existing `useLowStockAlerts()` call, and add `useNeedsAttentionTrials()` on the next line (plus the corresponding import) so the new alert also feeds the notification bell, not just the dashboard widget.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (no regressions; add a test that a trial planted 30 days ago with zero observations appears in `/api/trials/needs_attention/`, and a trial with at least one observation does not). `cd frontend; npx tsc --noEmit` (0 errors).

### Ticket C4 — Inbreeding/relatedness warning in crossing

**Goal:** Nothing today warns you if two selected parents share a recent common ancestor. Add a check using pedigree data already on every `Germplasm` record, reusing the existing `build_pedigree_tree` traversal — no genomics involved.

**File 1: `backend/apps/germplasm/services.py`.** Add these two functions immediately after the existing `build_pedigree_tree` function (and its nested helpers) ends:
```python
def _flatten_ancestor_ids(tree_node):
    """Flatten a build_pedigree_tree(..., direction='ancestors') result into
    a flat {id: name} map covering the root and every ancestor node."""
    if not tree_node:
        return {}
    ids = {tree_node["id"]: tree_node["name"]}
    ids.update(_flatten_ancestor_ids(tree_node.get("parent_female")))
    ids.update(_flatten_ancestor_ids(tree_node.get("parent_male")))
    return ids


def check_parent_relatedness(female_id, male_id, depth=4):
    """Check whether two candidate parents share a common ancestor within
    `depth` generations, reusing the existing pedigree-tree traversal.
    Returns {"related": bool, "shared_ancestors": [{"id": int, "name": str}, ...]}.
    """
    female_tree = build_pedigree_tree(female_id, depth=depth, direction="ancestors")
    male_tree = build_pedigree_tree(male_id, depth=depth, direction="ancestors")

    female_ancestors = _flatten_ancestor_ids(female_tree)
    male_ancestors = _flatten_ancestor_ids(male_tree)

    shared_ids = set(female_ancestors) & set(male_ancestors)
    shared = [{"id": i, "name": female_ancestors[i]} for i in shared_ids]
    return {"related": len(shared) > 0, "shared_ancestors": shared}
```
Before adding this, re-read `build_pedigree_tree` to confirm its returned dict actually has `"id"`, `"name"`, `"parent_female"`, and `"parent_male"` keys — it did as of this audit, but confirm against the live file.

**File 2: `backend/apps/germplasm/viewsets.py`.** Add a new action to `GermplasmViewSet`:
```python
    @action(detail=False, methods=["post"], url_path="check_relatedness")
    def check_relatedness(self, request):
        """Body: {"pairs": [{"female": <id>, "male": <id>}, ...]}.
        Returns relatedness info for each pair, same order as submitted."""
        from apps.germplasm.services import check_parent_relatedness

        pairs = request.data.get("pairs", [])
        results = []
        for pair in pairs:
            female_id = pair.get("female")
            male_id = pair.get("male")
            if not female_id or not male_id:
                results.append({"female": female_id, "male": male_id, "related": False, "shared_ancestors": []})
                continue
            result = check_parent_relatedness(female_id, male_id)
            result["female"] = female_id
            result["male"] = male_id
            results.append(result)
        return Response(results)
```

**File 3: `frontend/src/api/client.ts`.** Add, near the other domain interfaces:
```ts
export interface RelatednessResult {
  female: number
  male: number
  related: boolean
  shared_ancestors: { id: number; name: string }[]
}
```
Locate the existing `germplasm` object in this file (it already has a `listAll` method) and add a method inside it, in the same style as its neighboring entries:
```ts
  checkRelatedness: (pairs: { female: number; male: number }[]) =>
    apiFetch<RelatednessResult[]>('/germplasm/check_relatedness/', {
      method: 'POST',
      body: JSON.stringify({ pairs }),
    }),
```

**File 4: `frontend/src/pages/CrossingBlock.tsx`.**
- Near where `crossPreview` is defined, add:
  ```ts
  const { data: relatednessResults } = useQuery({
    queryKey: ['relatedness', crossPreview.map(p => `${p.female.id}-${p.male.id}`).join(',')],
    queryFn: () => germplasm.checkRelatedness(crossPreview.map(p => ({ female: p.female.id, male: p.male.id }))),
    enabled: crossPreview.length > 0,
  })
  const relatedPairKeys = new Set(
    (relatednessResults ?? []).filter(r => r.related).map(r => `${r.female}-${r.male}`)
  )
  ```
  `germplasm` must already be imported from `'../api/client'` in this file (it is, for `germplasm.listAll()`) — no new import needed for the object itself, only for `checkRelatedness` being a member of it.
- In the Cross Preview table, change the last `<td>` in each row from:
  ```tsx
  <td>{pair.reciprocal && <span className="badge badge-amber">R</span>}</td>
  ```
  to:
  ```tsx
  <td>
    {pair.reciprocal && <span className="badge badge-amber">R</span>}
    {relatedPairKeys.has(`${pair.female.id}-${pair.male.id}`) && (
      <span className="badge badge-red" title="These parents share a common ancestor within 4 generations">⚠ Related</span>
    )}
  </td>
  ```

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test: two germplasm records sharing a grandparent return `related: True` with that grandparent in `shared_ancestors`; two unrelated germplasm records return `related: False`). `cd frontend; npx tsc --noEmit` (0 errors). Manual check: plan a cross between two lines with a known shared ancestor and confirm the "⚠ Related" badge appears in the Cross Preview table.

---

## Section D — Tier 2 (do after A, B, C)

Four more tickets from the same season-workflow backlog. D2 depends on Section B (`SelectionShortlist`) already existing — do Section B first if it isn't done yet. D1, D3, D4 have no dependency on earlier sections.

### Ticket D1 — Seed-requirement budgeting calculator

**Goal:** Before sending advanced lines to a new field, there's no check that enough seed actually exists. Add an availability check to the existing "Send to New Field" flow (`frontend/src/components/SendToTrialModal.tsx`), which already computes `estimatedPlots` for the selected germplasm (lines 79-90) but never checks seed stock against it.

**Scope note:** this ticket only wires the check into `SendToTrialModal.tsx` (the generation-advancement → new-trial flow). It does not add the same check to the general trial-creation form used elsewhere — that would be a separate follow-up ticket if wanted.

**File 1: `backend/apps/germplasm/seed_viewsets.py`, inside `SeedLotViewSet`.** Add a new action (e.g. after the existing `low_stock` action):
```python
    @action(detail=False, methods=["post"], url_path="check_availability")
    def check_availability(self, request):
        """Body: {"requirements": [{"germplasm": <id>, "grams_needed": <float>}, ...]}.
        Returns available/shortfall grams per germplasm, summed across that
        germplasm's available (non-quarantine, non-depleted) seed lots in the
        requester's own program. Uses quantity_grams - reserved_grams as the
        truly-free amount, which is a stricter definition than the existing
        is_low_stock check (that one only looks at raw quantity_grams) —
        this is intentional, do not "fix" it to match is_low_stock."""
        requirements = request.data.get("requirements", [])
        results = []
        for req in requirements:
            germplasm_id = req.get("germplasm")
            grams_needed = req.get("grams_needed") or 0
            lots = self.get_queryset().filter(germplasm_id=germplasm_id, status="available")
            available = sum((lot.quantity_grams - lot.reserved_grams) for lot in lots)
            results.append({
                "germplasm": germplasm_id,
                "grams_needed": grams_needed,
                "available_grams": available,
                "shortfall_grams": max(0, grams_needed - available),
            })
        return Response(results)
```
`self.get_queryset()` already applies `ProgramScopedQuerySetMixin` scoping — do not query `SeedLot.objects` directly.

**File 2: `frontend/src/api/client.ts`.** Add an interface near the other seed-related types:
```ts
export interface SeedAvailabilityResult {
  germplasm: number
  grams_needed: number
  available_grams: number
  shortfall_grams: number
}
```
Locate the existing `seedLots` object (it already has `getLowStock`) and add inside it:
```ts
  checkAvailability: (requirements: { germplasm: number; grams_needed: number }[]) =>
    apiFetch<SeedAvailabilityResult[]>('/seed-lots/check_availability/', {
      method: 'POST',
      body: JSON.stringify({ requirements }),
    }),
```

**File 3: `frontend/src/components/SendToTrialModal.tsx`.**
- Add a new form field to the `form` state (line 29-40): `grams_per_plot: '5',` (a reasonable default a breeder can override — this codebase has no existing per-crop seed-rate convention to draw from, so this default is a starting point, not a researched agronomic constant; flag it as adjustable, don't treat it as authoritative).
- Add a corresponding input in the form JSX, near the "Number of Replications" field (~line 254-260, not fully read in this audit — locate it and add a sibling field):
  ```tsx
  <div className="form-group">
    <label className="form-label">Grams of Seed per Plot</label>
    <input
      id="send-trial-grams-per-plot"
      className="form-input"
      type="number"
      step="0.1"
      value={form.grams_per_plot}
      onChange={e => set('grams_per_plot', e.target.value)}
    />
  </div>
  ```
- Add a query that recomputes whenever `germplasmIds` or `form.grams_per_plot`/`estimatedPlots` change:
  ```ts
  const plotsPerEntry = germplasmIds.length > 0 ? estimatedPlots / germplasmIds.length : 0
  const { data: availabilityResults } = useQuery({
    queryKey: ['seed-availability', germplasmIds.join(','), form.grams_per_plot, plotsPerEntry],
    queryFn: () => seedLots.checkAvailability(
      germplasmIds.map(id => ({ germplasm: id, grams_needed: plotsPerEntry * (parseFloat(form.grams_per_plot) || 0) }))
    ),
    enabled: germplasmIds.length > 0 && plotsPerEntry > 0,
  })
  const shortfalls = (availabilityResults ?? []).filter(r => r.shortfall_grams > 0)
  ```
  Add `seedLots` to the existing import from `'../api/client'` if it isn't already imported in this file (it wasn't seen in this file during this audit — check before assuming).
- Display the result somewhere before the submit button (exact placement wasn't fully read in this audit — locate the area just above the form's submit button and insert):
  ```tsx
  {shortfalls.length > 0 && (
    <div className="alert alert-warning mb-4">
      <span>⚠</span>
      <span>{shortfalls.length} of {germplasmIds.length} entries may not have enough seed (short by up to {Math.max(...shortfalls.map(s => s.shortfall_grams)).toFixed(1)}g). You can still proceed — this is a heads-up, not a block.</span>
    </div>
  )}
  ```
  This is a warning, not a submit-blocker — do not disable the submit button based on `shortfalls`.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test: a germplasm with one seed lot of 100g and 0 reserved, requirement of 150g, returns `shortfall_grams: 50`). `cd frontend; npx tsc --noEmit` (0 errors).

### Ticket D2 — Germplasm full-history timeline view

**Goal:** A line's story (pedigree, every trial it's been in, every cross it's part of, its shortlist status) is currently scattered across separate pages. Consolidate trial history, cross history, and shortlist status into one panel — reusing the existing pedigree tree feature rather than rebuilding it.

**Depends on Section B** (`SelectionShortlist` model) already being implemented.

**File 1: `backend/apps/germplasm/viewsets.py`, inside `GermplasmViewSet`.** Add a new action:
```python
    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        from .models import SelectionShortlist

        germplasm = self.get_object()

        plots = germplasm.plot_set.select_related(
            "trial", "trial__season", "trial__location"
        ).order_by("trial__season__year", "trial__planting_date")
        trial_history = [
            {
                "trial_id": p.trial_id,
                "trial_code": p.trial.trial_code,
                "trial_name": p.trial.name,
                "season_name": p.trial.season.name if p.trial.season else None,
                "location_name": p.trial.location.name if p.trial.location else None,
                "plot_number": p.plot_number,
                "status": p.status,
            }
            for p in plots
        ]

        cross_history = [
            {
                "cross_code": c.cross_code, "role": "female",
                "other_parent": c.male_parent.name, "status": c.status,
                "progeny_name": c.progeny.name if c.progeny else None,
            }
            for c in germplasm.crosses_as_female.select_related("male_parent", "progeny")
        ] + [
            {
                "cross_code": c.cross_code, "role": "male",
                "other_parent": c.female_parent.name, "status": c.status,
                "progeny_name": c.progeny.name if c.progeny else None,
            }
            for c in germplasm.crosses_as_male.select_related("female_parent", "progeny")
        ]

        shortlist_entry = SelectionShortlist.objects.filter(germplasm=germplasm).first()

        return Response({
            "germplasm_id": germplasm.id,
            "name": germplasm.name,
            "trial_history": trial_history,
            "cross_history": cross_history,
            "is_shortlisted": shortlist_entry is not None,
            "shortlist_source": shortlist_entry.source if shortlist_entry else None,
        })
```
`germplasm.plot_set` is Django's default reverse accessor for `Plot.germplasm` (no `related_name` was set on that field) — confirm this before relying on it; if a `related_name` has since been added, use that instead. `crosses_as_female`/`crosses_as_male` are the actual related names already on `Cross.female_parent`/`Cross.male_parent`.

**File 2: `frontend/src/api/client.ts`.** Add an interface near the other germplasm-related types:
```ts
export interface GermplasmHistory {
  germplasm_id: number
  name: string
  trial_history: { trial_id: number; trial_code: string; trial_name: string; season_name: string | null; location_name: string | null; plot_number: number; status: string }[]
  cross_history: { cross_code: string; role: 'female' | 'male'; other_parent: string; status: string; progeny_name: string | null }[]
  is_shortlisted: boolean
  shortlist_source: string | null
}
```
Add to the existing `germplasm` object:
```ts
  getHistory: (id: number) => apiFetch<GermplasmHistory>(`/germplasm/${id}/history/`),
```

**File 3: create `frontend/src/components/GermplasmHistoryPanel.tsx`** (new file, sibling to the existing `PedigreePanel` in `GermplasmBrowser.tsx` — read that component's structure first so the new one matches its visual style):
```tsx
import { useQuery } from '@tanstack/react-query'
import { germplasm, Germplasm } from '../api/client'

export default function GermplasmHistoryPanel({ entry }: { entry: Germplasm }) {
  const { data, isLoading } = useQuery({
    queryKey: ['germplasm-history', entry.id],
    queryFn: () => germplasm.getHistory(entry.id),
  })

  if (isLoading || !data) return null

  return (
    <div className="card" style={{ marginTop: 'var(--space-3)' }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        History
        {data.is_shortlisted && <span className="badge badge-blue">★ Shortlisted ({data.shortlist_source})</span>}
      </div>

      <p className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>Trials ({data.trial_history.length})</p>
      {data.trial_history.length === 0 ? (
        <p className="text-sm text-muted">Not yet placed in a trial.</p>
      ) : (
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {data.trial_history.map((t, i) => (
            <li key={i}>{t.trial_code} — {t.season_name ?? '—'} @ {t.location_name ?? '—'} (plot {t.plot_number}, {t.status})</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted" style={{ marginTop: 'var(--space-3)' }}>Crosses ({data.cross_history.length})</p>
      {data.cross_history.length === 0 ? (
        <p className="text-sm text-muted">Not part of any recorded cross.</p>
      ) : (
        <ul className="text-sm" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
          {data.cross_history.map((c, i) => (
            <li key={i}>{c.cross_code} (as {c.role}, with {c.other_parent}) — {c.status}{c.progeny_name ? ` → ${c.progeny_name}` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

**File 4: `frontend/src/pages/GermplasmBrowser.tsx`.** Add the import: `import GermplasmHistoryPanel from '../components/GermplasmHistoryPanel'`. There are two existing `<PedigreePanel .../>` usages in this file (one inside a `DataTable`'s `detailPanel` render prop, one in a sidebar shown when `selected` is set) — add `<GermplasmHistoryPanel entry={entry} />` / `<GermplasmHistoryPanel entry={selected} />` immediately after each, so both entry points show the new panel alongside the existing pedigree panel. Wrap the pair in a fragment (`<>...</>`) where the slot only accepted a single element before.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test that `/api/germplasm/{id}/history/` returns the expected trial and cross entries for a fixture germplasm). `cd frontend; npx tsc --noEmit` (0 errors).

### Ticket D3 — Season summary report

**Goal:** No generated summary exists for "what happened this season" beyond raw exports. Add a season-level summary endpoint and a printable report page.

**File 1: `backend/apps/core/viewsets.py`, inside `SeasonViewSet`.** Add a new action:
```python
    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        from apps.trials.models import Trial
        from apps.germplasm.models import Cross

        season = self.get_object()
        trials_qs = Trial.objects.filter(season=season).select_related("location")
        trial_summary = [
            {
                "trial_code": t.trial_code, "name": t.name,
                "location_name": t.location.name if t.location else None,
                "design_type": t.design_type, "status": t.status,
                "plot_count": t.plot_set.count(),
            }
            for t in trials_qs
        ]

        crosses_qs = Cross.objects.filter(crossing_block__season=season)
        cross_counts_by_status = {
            status_key: crosses_qs.filter(status=status_key).count()
            for status_key, _ in Cross.CROSS_STATUS_CHOICES
        }

        return Response({
            "season_id": season.id,
            "season_name": season.name,
            "year": season.year,
            "trial_count": trials_qs.count(),
            "trials": trial_summary,
            "cross_count": crosses_qs.count(),
            "cross_counts_by_status": cross_counts_by_status,
        })
```
`Trial.season` and `Plot.trial` both use Django's default reverse accessor (no `related_name` set on either) — `trial_set` and `plot_set` respectively; confirm against the live models before relying on this. `Cross.CROSS_STATUS_CHOICES` and `crossing_block__season` are both confirmed existing on the `Cross`/`CrossingBlock` models.

**File 2: `frontend/src/api/client.ts`.** Add an interface:
```ts
export interface SeasonSummary {
  season_id: number
  season_name: string
  year: number
  trial_count: number
  trials: { trial_code: string; name: string; location_name: string | null; design_type: string; status: string; plot_count: number }[]
  cross_count: number
  cross_counts_by_status: Record<string, number>
}
```
Add to the existing `seasons` object (starts at line 381):
```ts
  getSummary: (id: number) => apiFetch<SeasonSummary>(`/seasons/${id}/summary/`),
```

**File 3: create `frontend/src/pages/SeasonReport.tsx`** (new file):
```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { seasons } from '../api/client'
import TopBar from '../components/TopBar'

export default function SeasonReport() {
  const { seasonId } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['season-summary', seasonId],
    queryFn: () => seasons.getSummary(Number(seasonId)),
    enabled: !!seasonId,
  })

  if (isLoading || !data) {
    return <div className="page-shell"><div className="loading-spinner"><div className="spinner" /> Loading…</div></div>
  }

  return (
    <div className="page-shell">
      <TopBar
        title={`Season Report — ${data.season_name} (${data.year})`}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => navigate('/trials')}>← Back</button>
            <button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / Save PDF</button>
          </>
        }
      />
      <div className="card mb-6">
        <div className="card-title">Overview</div>
        <p>{data.trial_count} trial(s), {data.cross_count} cross(es) planned this season.</p>
        <div className="flex gap-2 mt-2">
          {Object.entries(data.cross_counts_by_status).map(([statusKey, count]) => (
            <span key={statusKey} className="badge badge-gray">{statusKey}: {count}</span>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Trials</div>
        <table className="data-table">
          <thead>
            <tr><th>Code</th><th>Name</th><th>Location</th><th>Design</th><th>Status</th><th>Plots</th></tr>
          </thead>
          <tbody>
            {data.trials.map(t => (
              <tr key={t.trial_code}>
                <td>{t.trial_code}</td><td>{t.name}</td><td>{t.location_name ?? '—'}</td>
                <td>{t.design_type}</td><td>{t.status}</td><td>{t.plot_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```
This uses the browser's native print (`window.print()`) rather than a new PDF-generation dependency — deliberate, to avoid adding a heavy library for a first version. If a real PDF file (not just print-to-PDF) is wanted later, that's a separate follow-up ticket, not part of this one.

**File 4: `frontend/src/App.tsx`.** Add the import (alongside the other page imports) and a new route inside the same `<Routes>` block that has `/trials` (currently line 71):
```tsx
<Route path="/seasons/:seasonId/report" element={<SeasonReport />} />
```

**File 5: `frontend/src/pages/TrialManager.tsx`.** Add an entry point: next to the existing season filter `<select>` (the one bound to `filterSeason`), add a button that's disabled until a season is picked:
```tsx
<button
  className="btn btn-secondary"
  disabled={!filterSeason}
  onClick={() => navigate(`/seasons/${filterSeason}/report`)}
>
  📊 Season Report
</button>
```
This requires `useNavigate` — check whether `TrialManager.tsx` already imports and calls it (it wasn't confirmed in this audit); if not, add `import { useNavigate } from 'react-router-dom'` and `const navigate = useNavigate()` near the top of the component.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test for `/api/seasons/{id}/summary/` against a fixture season with known trials/crosses). `cd frontend; npx tsc --noEmit` (0 errors). Manual check: pick a season in Trial Manager, click "Season Report," confirm the numbers match what's actually in that season, and that the print button produces a sane print layout.

### Ticket D4 — Variety-release status field

**Goal:** Lines that reach a "named variety" milestone are currently indistinguishable from any other germplasm record — this is tracked informally outside the platform today. Add a status field, following the exact same pattern as the existing `is_check` boolean.

**File 1: `backend/apps/germplasm/models.py`, in the `Germplasm` class.** Add, near the existing `is_check` field:
```python
    RELEASE_STATUS_CHOICES = [
        ("breeding_line", "Breeding Line"),
        ("release_candidate", "Release Candidate"),
        ("released", "Released Variety"),
        ("discontinued", "Discontinued"),
    ]
    release_status = models.CharField(
        max_length=20,
        choices=RELEASE_STATUS_CHOICES,
        default="breeding_line",
        db_index=True,
    )
```

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations germplasm
.\.venv\Scripts\python manage.py migrate
```

**File 2: `backend/apps/germplasm/serializers.py`.** In `GermplasmSerializer.Meta.fields`, add `"release_status",` immediately after `"is_check",`.

**File 3: `backend/apps/germplasm/viewsets.py`, `GermplasmViewSet`.** Add `"release_status"` to `filterset_fields` (currently `["program", "cross_type", "species", "is_archived"]`).

**File 4: `frontend/src/api/client.ts`.** In the `Germplasm` interface, add:
```ts
  release_status: 'breeding_line' | 'release_candidate' | 'released' | 'discontinued'
```

**File 5: `frontend/src/pages/GermplasmBrowser.tsx`.** Follow the exact existing `is_check` badge pattern (e.g. `{entry.is_check && <span className="badge badge-amber">CHECK</span>}`) and add a sibling badge, shown only when the status isn't the default:
```tsx
{entry.release_status === 'released' && <span className="badge badge-green">RELEASED</span>}
{entry.release_status === 'release_candidate' && <span className="badge badge-blue">CANDIDATE FOR RELEASE</span>}
```
Add this next to each existing `is_check` badge occurrence in the file (there are several — the germplasm creation/edit form should also gain a `release_status` select, mirroring the existing `is_check` checkbox field's form-state wiring in the same file).

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (no regressions). `cd frontend; npx tsc --noEmit` (0 errors). Manually confirm the badge renders correctly and the filter/status can be set via the edit form.

---

## Section E — Tier 3 (do after A, B, C, D)

Six tickets. No dependencies between them except where noted.

### Ticket E1 — Guided trial-design wizard (lightweight version)

**Goal:** Deliberately NOT a full wizard — a simple rule-of-thumb recommendation shown where the entry count is already known (`frontend/src/components/SendToTrialModal.tsx`), so a breeder picking a design type gets a plain-language starting point instead of choosing blind. This is a heuristic, not a statistically rigorous recommendation engine — phrase it as a suggestion the breeder can ignore, never auto-apply it.

**File: `frontend/src/components/SendToTrialModal.tsx`.**
- Add a pure helper function near the top of the file, after the `DESIGN_OPTIONS` array:
  ```ts
  function recommendDesignType(entryCount: number): { recommended: string; rationale: string } | null {
    if (entryCount <= 0) return null
    if (entryCount <= 20) {
      return { recommended: 'RCBD', rationale: `With ${entryCount} entries, full replication (RCBD) is usually manageable and simple to analyze.` }
    }
    if (entryCount <= 100) {
      return { recommended: 'alpha_lattice', rationale: `With ${entryCount} entries, alpha-lattice incomplete blocks typically control field variation better than plain RCBD at this scale.` }
    }
    return { recommended: 'prep', rationale: `With ${entryCount} entries, a partially-replicated (p-rep) design is often more seed- and space-efficient than full replication.` }
  }
  ```
- Near the "Experimental Design Type" field (the `<select>` bound to `form.design_type`), add, above it:
  ```tsx
  {(() => {
    const rec = recommendDesignType(germplasmIds.length)
    if (!rec || rec.recommended === form.design_type) return null
    return (
      <div className="alert alert-info mb-2" style={{ gridColumn: '1/-1' }}>
        <span>💡</span>
        <span>
          {rec.rationale}{' '}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('design_type', rec.recommended)}>
            Use {rec.recommended}
          </button>
        </span>
      </div>
    )
  })()}
  ```
  This is advisory only — it never changes `form.design_type` unless the breeder clicks the button.

**Verification:** `cd frontend; npx tsc --noEmit` (0 errors). Manual check: with 5 germplasm selected, RCBD is suggested; with 150 selected, p-rep is suggested; picking a different design type manually makes the banner disappear (since `rec.recommended === form.design_type` short-circuits).

### Ticket E2 — QC/outlier-review step post-import

**Goal:** No step today reviews imported data for likely errors before it feeds into ranking/analysis. Add a per-trial outlier check: for each numeric trait, flag observations more than 3 standard deviations from that trait's mean within the trial.

**Important:** compute mean/standard deviation in Python, not with a database aggregate. This project runs on SQLite in local dev (`USE_SQLITE=True` per the README) and SQLite has no built-in `STDDEV` function — Django's `StdDev`/`Variance` ORM aggregates would raise `OperationalError` there. Pulling the values into Python and using the standard library `statistics` module avoids this entirely and needs no new dependency.

**File 1: `backend/apps/trials/viewsets.py`, inside `TrialViewSet`.** Add:
```python
    @action(detail=True, methods=["get"], url_path="qc_flags")
    def qc_flags(self, request, pk=None):
        """Numeric observations more than 3 standard deviations from their
        trait's mean within this trial. Computed in Python (not a DB
        aggregate) because SQLite has no STDDEV function and this project
        runs on SQLite in local dev."""
        import statistics
        from .models import Observation, ObservationVariable

        trial = self.get_object()
        variable_ids = (
            Observation.objects.filter(plot__trial=trial, value_numeric__isnull=False)
            .values_list("variable_id", flat=True)
            .distinct()
        )
        flags = []
        for variable in ObservationVariable.objects.filter(id__in=variable_ids):
            observations = list(
                Observation.objects.filter(
                    plot__trial=trial, variable=variable, value_numeric__isnull=False
                ).select_related("plot")
            )
            if len(observations) < 3:
                continue
            values = [o.value_numeric for o in observations]
            mean = statistics.mean(values)
            try:
                stdev = statistics.stdev(values)
            except statistics.StatisticsError:
                continue
            if stdev == 0:
                continue
            for obs in observations:
                z = (obs.value_numeric - mean) / stdev
                if abs(z) > 3:
                    flags.append({
                        "plot_number": obs.plot.plot_number,
                        "variable_name": variable.name,
                        "value": obs.value_numeric,
                        "trial_mean": round(mean, 3),
                        "trial_stdev": round(stdev, 3),
                        "z_score": round(z, 2),
                    })
        return Response(flags)
```

**File 2: `frontend/src/api/client.ts`.** Add an interface and a client method on the existing `trials` object:
```ts
export interface QcFlag {
  plot_number: number
  variable_name: string
  value: number
  trial_mean: number
  trial_stdev: number
  z_score: number
}
```
```ts
  getQcFlags: (id: number) => apiFetch<QcFlag[]>(`/trials/${id}/qc_flags/`),
```

**File 3: create `frontend/src/components/trials/QcReviewTab.tsx`** (new file, sibling to `AdvancePlotsTab.tsx`):
```tsx
import { useQuery } from '@tanstack/react-query'
import { trials, Trial } from '../../api/client'

export default function QcReviewTab({ trial }: { trial: Trial }) {
  const { data, isLoading } = useQuery({
    queryKey: ['qc-flags', trial.id],
    queryFn: () => trials.getQcFlags(trial.id),
  })

  if (isLoading) return <div className="loading-spinner"><div className="spinner" /> Checking for outliers…</div>
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>
        <p>No statistical outliers found (values within 3 standard deviations of each trait's mean).</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-muted mb-3">{data.length} observation(s) are more than 3 standard deviations from their trait's mean in this trial. This is a statistical flag, not proof of an error — review before trusting them in analysis.</p>
      <table className="data-table">
        <thead>
          <tr><th>Plot</th><th>Trait</th><th>Value</th><th>Trial Mean</th><th>Trial Std Dev</th><th>Z-score</th></tr>
        </thead>
        <tbody>
          {data.map((f, i) => (
            <tr key={i}>
              <td>{f.plot_number}</td><td>{f.variable_name}</td>
              <td className="font-bold">{f.value}</td>
              <td className="text-muted">{f.trial_mean}</td>
              <td className="text-muted">{f.trial_stdev}</td>
              <td><span className="badge badge-amber">{f.z_score}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**File 4: `frontend/src/components/trials/TrialDetail.tsx`.** Add the import: `import QcReviewTab from './QcReviewTab'`. In the `tabs={[...]}` array passed to `<Tabs>` (starts around the `germplasm`/`field-map`/`observations`/`selections` tab objects), add a new tab object, e.g. after the `observations` tab:
```tsx
          {
            id: 'qc',
            label: '🔍 QC Review',
            content: (
              <div className="card">
                <QcReviewTab trial={trial} />
              </div>
            ),
          },
```

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test: a trial with 10 observations of value ~10 and one observation of value 1000 for the same trait flags exactly that one observation). `cd frontend; npx tsc --noEmit` (0 errors).

### Ticket E3 — Scoring-consistency / calibration guide for technicians

**Goal:** No formal method exists today to keep subjective trait scoring (disease severity, visual ratings) consistent across technicians. Add an optional reference-guide field to each trait definition, so at minimum the guide lives in the platform next to the trait it describes.

**Scope note:** this does not modify the external Field Book app itself (out of scope — that's a separate open-source project) — it only makes the guide visible in this platform's own trait management and trial views.

**File 1: `backend/apps/trials/models.py`, in the `ObservationVariable` class.** Add, near the existing `description` field:
```python
    scoring_guide = models.TextField(
        blank=True,
        help_text="Reference text, scale definitions, or a URL to a photo standard, for keeping scoring consistent across technicians.",
    )
```

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations trials
.\.venv\Scripts\python manage.py migrate
```

**File 2: `backend/apps/trials/serializers.py`.** Find `ObservationVariableSerializer` and add `"scoring_guide",` to its `Meta.fields` list, in the same style as the existing `description` field.

**File 3: `frontend/src/api/client.ts`.** Find the `ObservationVariable` interface and add: `scoring_guide: string`.

**File 4: `frontend/src/pages/Traits.tsx`.** This file manages `ObservationVariable` records but was not read during this audit. Locate its create/edit form (it will already have a `description` field, following this model's existing pattern) and add a `scoring_guide` textarea alongside it, plus display it in whatever read-only detail/list view already shows `description`.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (no regressions). `cd frontend; npx tsc --noEmit` (0 errors). Manually confirm a scoring guide can be saved on a trait and is visible when reviewing that trait.

### Ticket E4 — Photo attachment on observations

**Goal:** `Observation` has no image field at all today (only `value_text`/`value_numeric`/`value_date`/`notes`) — a field photo can't be attached to a plot's record. This is a bigger, genuinely new piece of infrastructure (file storage), not a small field addition — treat it with more care than the other tickets in this section.

**New dependency:** Django's `ImageField` requires Pillow, which is not currently in this project's dependencies.

**File 1: `backend/requirements/base.txt`.** Add a new line:
```
Pillow>=10.0,<11.0
```
Then run `pip install -r requirements/base.txt` (or reinstall however this project's venv is normally updated) before running migrations.

**File 2: `backend/config/settings.py`.** Confirm whether `MEDIA_ROOT` and `MEDIA_URL` are already defined (they were not found anywhere in this codebase during this audit). If absent, add:
```python
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
```
Match whatever `BASE_DIR` convention this settings file already uses (it's a standard Django setting that should already exist near the top of the file).

**File 3: `backend/config/urls.py`.** In `DEBUG` mode, Django doesn't serve uploaded media files by default. Add, near the bottom of the file (this project already imports `settings` — confirm the exact existing import before adding a duplicate):
```python
if settings.DEBUG:
    from django.conf.urls.static import static
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
```
Production (behind Nginx, per `docker-compose.prod.yml`) will need its own media-serving configuration — that reverse-proxy config was not read during this audit, so do not assume this line alone is sufficient in production; flag that as a separate, explicit follow-up rather than silently declaring this ticket "done" for production use.

**File 4: `backend/apps/trials/models.py`.** Add a new model at the end of the file:
```python
class ObservationPhoto(models.Model):
    observation = models.ForeignKey(
        Observation, on_delete=models.CASCADE, related_name="photos"
    )
    image = models.ImageField(upload_to="observation_photos/%Y/%m/")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )

    def __str__(self):
        return f"Photo for {self.observation}"
```
Confirm `settings` is already imported at the top of this file (it is, per the existing `created_by`/`updated_by` fields elsewhere in this module).

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations trials
.\.venv\Scripts\python manage.py migrate
```

**File 5: `backend/apps/trials/serializers.py`.** Add:
```python
class ObservationPhotoSerializer(serializers.ModelSerializer):
    uploaded_by_username = serializers.CharField(source="uploaded_by.username", read_only=True, default=None)

    class Meta:
        model = ObservationPhoto
        fields = ["id", "observation", "image", "uploaded_at", "uploaded_by", "uploaded_by_username"]
        read_only_fields = ["id", "uploaded_at", "uploaded_by"]
```
Add `ObservationPhoto` to this file's `from .models import ...` line.

**File 6: `backend/apps/trials/viewsets.py`, inside `ObservationViewSet`.** Add an upload action:
```python
    @action(
        detail=True, methods=["post"],
        parser_classes=[MultiPartParser], url_path="upload_photo",
    )
    def upload_photo(self, request, pk=None):
        from .models import ObservationPhoto
        from .serializers import ObservationPhotoSerializer

        observation = self.get_object()
        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"detail": "image file is required (form key 'image')."}, status=400)

        photo = ObservationPhoto.objects.create(
            observation=observation, image=image_file, uploaded_by=request.user,
        )
        return Response(ObservationPhotoSerializer(photo).data, status=201)
```
Confirm `MultiPartParser` is already imported in this file (it is, used by `bulk_import`/`import_fieldbook`).

**File 7: `frontend/src/api/client.ts`.** Add an interface and a method — locate the section handling `Observation`-related calls and add nearby:
```ts
export interface ObservationPhoto {
  id: number
  observation: number
  image: string
  uploaded_at: string
  uploaded_by: number | null
  uploaded_by_username: string | null
}
```
```ts
  uploadObservationPhoto: (observationId: number, file: File) => {
    const formData = new FormData()
    formData.append('image', file)
    const token = getToken()
    return fetch(`${BASE}/observations/${observationId}/upload_photo/`, {
      method: 'POST',
      headers: token ? { Authorization: `Token ${token}` } : {},
      body: formData,
    }).then(res => {
      if (!res.ok) throw new Error('Photo upload failed.')
      return res.json() as Promise<ObservationPhoto>
    })
  },
```
Match this to wherever `Observation`-related client functions already live in this file, and confirm `getToken`/`BASE` are accessible in that scope the same way `importFieldBook` already uses them.

**File 8: frontend UI.** This project's per-plot observation entry UI (`ObservationGrid`, referenced from `TrialDetail.tsx`, and/or `frontend/src/pages/ObservationEntry.tsx`) was not read during this audit. Locate wherever a single observation's value is entered/edited and add a small "📷 Attach Photo" button that opens a file picker and calls `observations.uploadObservationPhoto(observationId, file)` (add this method to whichever domain object in `client.ts` already wraps `/observations/` calls), then displays any existing `photos` thumbnails for that observation. Do not guess at this component's exact structure — read it first.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test uploading a small in-memory test image via `upload_photo` and asserting a 201 and that `ObservationPhoto` row exists). `cd frontend; npx tsc --noEmit` (0 errors). Manual check: upload a photo to an observation and confirm it's retrievable via its `image` URL.

### Ticket E5 — Daily cross-nursery task agenda

**Goal:** `PendingObservationsWidget` (fixed in Ticket C3) is a small dashboard card — useful, but limited to a couple of lines. Build a full page that assembles the same underlying signals (low stock, trials needing attention, crossing blocks ready for action) with more detail, for a breeder who wants one place to check every morning across every active nursery.

**Depends on Ticket C3** (`useNeedsAttentionTrials`) already existing.

**File 1: create `frontend/src/pages/TodaysTasks.tsx`** (new file):
```tsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { crossingBlocks } from '../api/client'
import { useLowStockAlerts } from '../components/common/useLowStockAlerts'
import { useNeedsAttentionTrials } from '../components/common/useNeedsAttentionTrials'
import TopBar from '../components/TopBar'

export default function TodaysTasks() {
  const navigate = useNavigate()
  const { data: lowStockLots } = useLowStockAlerts()
  const { data: staleTrials } = useNeedsAttentionTrials()
  const { data: crossingBlocksData } = useQuery({
    queryKey: ['crossing-blocks-dashboard'],
    queryFn: () => crossingBlocks.list(),
  })
  const activeBlocksWithCrosses = (crossingBlocksData?.results ?? []).filter(b => b.cross_count > 0)

  const totalTasks = (lowStockLots?.length ?? 0) + (staleTrials?.length ?? 0) + activeBlocksWithCrosses.length

  return (
    <div className="page-shell">
      <TopBar title="Today's Tasks" subtitle={`${totalTasks} item(s) across all active nurseries`} />

      {totalTasks === 0 ? (
        <div className="empty-state"><div className="empty-icon">✓</div><p>Nothing needs attention right now.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {staleTrials && staleTrials.length > 0 && (
            <div className="card">
              <div className="card-title">📋 Trials With No Observations Yet ({staleTrials.length})</div>
              <ul>
                {staleTrials.map(t => (
                  <li key={t.id}>
                    <a onClick={() => navigate('/trials')} style={{ cursor: 'pointer' }}>{t.trial_code} — {t.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {lowStockLots && lowStockLots.length > 0 && (
            <div className="card">
              <div className="card-title">⚠️ Low Seed Stock ({lowStockLots.length})</div>
              <ul>
                {lowStockLots.map(lot => (
                  <li key={lot.id}>
                    <a onClick={() => navigate('/seed-inventory')} style={{ cursor: 'pointer' }}>{lot.lot_code} — {lot.germplasm_name} ({lot.quantity_grams}g)</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activeBlocksWithCrosses.length > 0 && (
            <div className="card">
              <div className="card-title">✂️ Crossing Blocks Ready ({activeBlocksWithCrosses.length})</div>
              <ul>
                {activeBlocksWithCrosses.map(b => (
                  <li key={b.id}>
                    <a onClick={() => navigate('/crosses')} style={{ cursor: 'pointer' }}>{b.name}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

**File 2: `frontend/src/App.tsx`.** Add the import and a new route alongside the others (e.g. after `/trials`):
```tsx
<Route path="/tasks" element={<TodaysTasks />} />
```

**File 3:** add a link to this new page somewhere in the app's main navigation (the sidebar/nav component wasn't read during this audit — locate it and add a `/tasks` entry following the same pattern as the existing nav links).

**Verification:** `cd frontend; npx tsc --noEmit` (0 errors). Manual check: the page loads and shows the same underlying items as the Dashboard's `PendingObservationsWidget`, just with more detail and one item per line.

### Ticket E6 — Multi-year historical performance in the crossing picker

**Goal:** `CrossingBlock.tsx`'s parent pickers show no performance data at all today. Add a lightweight historical average — explicitly a simple raw average across whatever observations exist for a trait, across all seasons a line has been in, not a re-run of the MEA mixed-model (that computation is too expensive to trigger for every germplasm shown in a picker list).

**File 1: `backend/apps/germplasm/viewsets.py`, inside `GermplasmViewSet`.** Add:
```python
    @action(detail=False, methods=["post"], url_path="observation_summary")
    def observation_summary(self, request):
        """Body: {"germplasm_ids": [...], "variable_id": <id>}.
        Returns a simple historical average per germplasm — a raw mean
        across every recorded observation for that trait, across every
        season/trial the germplasm has appeared in. This is NOT the
        environment-adjusted BLUE/BLUP from MultiEnvironmentAnalysis —
        it's a cheap approximation suitable for a picker list, not a
        substitute for the real ranking analysis."""
        from apps.trials.models import Observation

        germplasm_ids = request.data.get("germplasm_ids", [])
        variable_id = request.data.get("variable_id")
        if not variable_id or not germplasm_ids:
            return Response({"detail": "germplasm_ids and variable_id are required."}, status=400)

        results = []
        for gid in germplasm_ids:
            obs = Observation.objects.filter(
                plot__germplasm_id=gid, variable_id=variable_id, value_numeric__isnull=False
            ).select_related("plot__trial__season")
            values = [o.value_numeric for o in obs]
            seasons = {o.plot.trial.season_id for o in obs if o.plot.trial.season_id}
            results.append({
                "germplasm": gid,
                "avg_value": round(sum(values) / len(values), 3) if values else None,
                "observation_count": len(values),
                "season_count": len(seasons),
            })
        return Response(results)
```

**File 2: `frontend/src/api/client.ts`.** Add an interface and a method on the existing `germplasm` object:
```ts
export interface ObservationSummary {
  germplasm: number
  avg_value: number | null
  observation_count: number
  season_count: number
}
```
```ts
  getObservationSummary: (germplasmIds: number[], variableId: number) =>
    apiFetch<ObservationSummary[]>('/germplasm/observation_summary/', {
      method: 'POST',
      body: JSON.stringify({ germplasm_ids: germplasmIds, variable_id: variableId }),
    }),
```

**File 3: `frontend/src/pages/CrossingBlock.tsx`.**
- Add state for the selected trait, and fetch the observation-variable list, near the other top-level state in the main `CrossingBlock` component: `const [perfVariableId, setPerfVariableId] = useState<number | ''>('')`. Fetch the variable list the same way this app fetches it elsewhere (via `observationVariables.list()` — confirm the exact import path/client object name against `frontend/src/api/client.ts` before using it, it wasn't re-verified in this ticket).
- Fetch the summary for whichever germplasm entries are currently visible in the picker(s):
  ```ts
  const { data: perfResults } = useQuery({
    queryKey: ['observation-summary', allGermplasm.map(g => g.id).join(','), perfVariableId],
    queryFn: () => germplasm.getObservationSummary(allGermplasm.map(g => g.id), Number(perfVariableId)),
    enabled: !!perfVariableId && allGermplasm.length > 0,
  })
  const perfByGermplasmId = new Map((perfResults ?? []).map(r => [r.germplasm, r]))
  ```
- Add a trait-selector `<select>` above the two `<GermplasmPanel>` components, and pass `perfByGermplasmId` down as a new prop to `GermplasmPanel`.
- In `GermplasmPanel`'s row rendering (the `filtered.map(entry => (...))` block), add, next to the existing `germplasm_db_id` span:
  ```tsx
  {perfByGermplasmId?.get(entry.id) && (
    <span className="text-xs text-muted" title={`${perfByGermplasmId.get(entry.id)!.observation_count} observations across ${perfByGermplasmId.get(entry.id)!.season_count} season(s)`}>
      avg {perfByGermplasmId.get(entry.id)!.avg_value ?? '—'}
    </span>
  )}
  ```
  Add `perfByGermplasmId?: Map<number, { avg_value: number | null; observation_count: number; season_count: number }>` to `GermplasmPanel`'s props type.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test: a germplasm with observations of a trait across 2 different seasons returns the correct average and `season_count: 2`). `cd frontend; npx tsc --noEmit` (0 errors).

---

## Section F — Tier 4

Four items. F1 is a discovery task, not a code ticket — do not write speculative code against an unknown external format. F2–F4 have real specs where this audit found enough to ground them, with explicit callouts where a decision or further reading is still needed.

### Ticket F1 — External reporting to funders/certification bodies (discovery, not implementation)

**Do not write code for this yet.** The concrete requirement is unknown — which specific certification body or funder, what format they require (a specific CSV column layout? A PDF form? A BrAPI submission?), and how often. Writing an export against a guessed format would very likely be wrong and wasted effort.

**Before this becomes a ticket:** get the actual answer to: (1) name the specific certifying body/funder and their submission format, (2) get a sample of the exact file/form they expect, (3) confirm whether this is a one-time need or recurring every season. Once that exists, check whether the platform's existing generic exports (`frontend/src/pages/DataExport.tsx`, and BrAPI v2 endpoints already implemented per `apps.brapi`) already satisfy it before building anything new — a lot of "external reporting" needs are just a specific column selection on data that's already exportable.

### Ticket F2 — Shareable read-only report link

**Goal:** Let a breeder share a specific Season Report (Ticket D3) with an external stakeholder (funder, certification reviewer) via a link, without giving them a full account. This is genuinely security-sensitive — read the caveats below before building it.

**Security note (do not skip):** the shared link must use a long, cryptographically random token (not a guessable sequential ID), must be scoped to exactly one resource (a season summary, nothing else reachable from the same token), and should expire. This exposes program data outside authentication entirely for anyone holding the link — that's an explicit product decision, not just an implementation detail; flag it to the user again before this ships if it wasn't already discussed at the point of building it.

**File 1: `backend/apps/core/models.py`.** Add a new model:
```python
class ShareLink(models.Model):
    TARGET_TYPE_CHOICES = [
        ("season_summary", "Season Summary"),
    ]
    token = models.CharField(max_length=64, unique=True, db_index=True)
    target_type = models.CharField(max_length=32, choices=TARGET_TYPE_CHOICES)
    target_id = models.PositiveIntegerField()
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def is_valid(self):
        from django.utils import timezone
        return timezone.now() < self.expires_at
```
`target_type` only supports `"season_summary"` for now, deliberately — do not generalize this to "share anything" without deciding the access-control implications for each new target type first.

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations core
.\.venv\Scripts\python manage.py migrate
```

**File 2: `backend/apps/core/viewsets.py`, inside `SeasonViewSet`.** Add an action to create a share link for a season's summary:
```python
    @action(detail=True, methods=["post"], url_path="create_share_link")
    def create_share_link(self, request, pk=None):
        import secrets
        from datetime import timedelta
        from django.utils import timezone
        from .models import ShareLink

        season = self.get_object()
        days_valid = int(request.data.get("days_valid", 30))
        link = ShareLink.objects.create(
            token=secrets.token_urlsafe(32),
            target_type="season_summary",
            target_id=season.id,
            expires_at=timezone.now() + timedelta(days=days_valid),
            created_by=request.user,
        )
        return Response({"token": link.token, "expires_at": link.expires_at})
```

**File 3: `backend/apps/core/urls.py` (or wherever this app's non-router URL patterns live — check the existing pattern before adding).** Add a public, unauthenticated endpoint:
```python
from django.urls import path
from .public_views import public_season_summary

urlpatterns += [
    path("public/shared/<str:token>/", public_season_summary, name="public-season-summary"),
]
```

**File 4: create `backend/apps/core/public_views.py`** (new file):
```python
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import ShareLink


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_season_summary(request, token):
    try:
        link = ShareLink.objects.get(token=token)
    except ShareLink.DoesNotExist:
        return Response({"detail": "Link not found."}, status=404)
    if not link.is_valid():
        return Response({"detail": "This link has expired."}, status=410)
    if link.target_type != "season_summary":
        return Response({"detail": "Unsupported link type."}, status=400)

    from apps.trials.models import Trial
    from apps.germplasm.models import Cross
    from .models import Season

    try:
        season = Season.objects.get(pk=link.target_id)
    except Season.DoesNotExist:
        return Response({"detail": "Season no longer exists."}, status=404)

    trials_qs = Trial.objects.filter(season=season).select_related("location")
    trial_summary = [
        {"trial_code": t.trial_code, "name": t.name, "status": t.status, "plot_count": t.plot_set.count()}
        for t in trials_qs
    ]
    crosses_qs = Cross.objects.filter(crossing_block__season=season)

    return Response({
        "season_name": season.name,
        "year": season.year,
        "trial_count": trials_qs.count(),
        "trials": trial_summary,
        "cross_count": crosses_qs.count(),
    })
```
Note this deliberately returns a smaller, coarser payload than the authenticated `/seasons/{id}/summary/` from Ticket D3 (no location names, no per-status cross breakdown) — an external viewer should see less detail than an authenticated program member, not the same amount. Do not just proxy the D3 endpoint here.

**File 5: `frontend/src/pages/SeasonReport.tsx`.** Add a "Share" button next to the existing Print button, calling a new `seasons.createShareLink(seasonId)` client method (add it to the `seasons` object in `client.ts`, following the same POST pattern as other actions in this spec), then show the resulting public URL (`${window.location.origin}/shared/{token}`) in a copyable text box.

**File 6: create a new public page** at a route like `/shared/:token` (add to `App.tsx`, **outside** the authenticated `ProtectedLayout` route tree — check how `/login` is registered outside that tree and mirror it) that fetches `GET /api/public/shared/{token}/` directly (no auth token attached) and renders a read-only version of the season summary.

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add tests: a valid token returns data; an expired token returns 410; a nonexistent token returns 404; confirm the public endpoint requires no `Authorization` header). `cd frontend; npx tsc --noEmit` (0 errors).

### Ticket F3 — Map/GIS view of active nurseries

**Goal:** `Location` already has `latitude`/`longitude` fields (confirmed in this audit — no schema change needed there). Add a map view plotting every location that has at least one active trial.

**New frontend dependency:** this project has no map library today. Add `leaflet` and `react-leaflet`, using free OpenStreetMap tiles — no API key required, no external account to set up.

**File 1: `frontend/package.json`.** Add dependencies (check current React version compatibility before picking exact versions — `react-leaflet` v4 requires React 18+):
```
npm install leaflet react-leaflet
npm install --save-dev @types/leaflet
```

**File 2: create `frontend/src/pages/NurseryMap.tsx`** (new file):
```tsx
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { trials, locations } from '../api/client'
import TopBar from '../components/TopBar'

export default function NurseryMap() {
  const navigate = useNavigate()
  const { data: locationsData } = useQuery({ queryKey: ['locations-all'], queryFn: () => locations.list() })
  const { data: trialsData } = useQuery({ queryKey: ['trials-all-active'], queryFn: () => trials.list('&status=active&page_size=500') })

  const locationList = (locationsData?.results ?? []).filter(l => l.latitude != null && l.longitude != null)
  const activeTrialsByLocation = new Map<number, number>()
  ;(trialsData?.results ?? []).forEach(t => {
    activeTrialsByLocation.set(t.location, (activeTrialsByLocation.get(t.location) ?? 0) + 1)
  })

  const plottedLocations = locationList.filter(l => activeTrialsByLocation.has(l.id))
  const center: [number, number] = plottedLocations.length > 0
    ? [plottedLocations[0].latitude!, plottedLocations[0].longitude!]
    : [0, 0]

  return (
    <div className="page-shell">
      <TopBar title="Nursery Map" subtitle={`${plottedLocations.length} active location(s)`} />
      {plottedLocations.length === 0 ? (
        <div className="empty-state"><div className="empty-icon">🗺️</div><p>No active locations have coordinates set yet. Add latitude/longitude on a Location to see it here.</p></div>
      ) : (
        <div className="card" style={{ height: 500, padding: 0, overflow: 'hidden' }}>
          <MapContainer center={center} zoom={5} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {plottedLocations.map(l => (
              <Marker key={l.id} position={[l.latitude!, l.longitude!]}>
                <Popup>
                  <strong>{l.name}</strong><br />
                  {activeTrialsByLocation.get(l.id)} active trial(s)
                  <br />
                  <a onClick={() => navigate(`/trials?location=${l.id}`)} style={{ cursor: 'pointer' }}>View trials →</a>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  )
}
```
Confirm `locations.list()` and the `Location`/`Trial` TypeScript interfaces already expose `latitude`/`longitude`/`location` the way this snippet assumes — cross-check against `client.ts` before relying on it.

**File 3: `frontend/src/App.tsx`.** Add the import and a new route alongside the others:
```tsx
<Route path="/nursery-map" element={<NurseryMap />} />
```

**File 4:** add a nav link to `/nursery-map`, same caveat as Ticket E5 — the nav component wasn't read in this audit, locate it and match its existing pattern.

**Verification:** `cd frontend; npx tsc --noEmit` (0 errors). Manual check: set lat/long on at least one Location with an active trial, confirm a marker appears at roughly the right place on the map, and the popup's "View trials" link works.

### Ticket F4 — Weather data linked to trial locations (CSV import v1; live API fetch deferred)

**Goal:** scoped deliberately narrow for a first version: store weather data per location/date and let the breeder see it against a trial's timeline, via **manual CSV import** — not a live weather-API integration. A live API integration needs a provider choice (NOAA, a commercial weather API, a local ag-met network) and credentials that only the user can decide on; don't invent one. CSV import needs no such decision and reuses this project's existing import infrastructure.

**File 1: `backend/apps/core/models.py`.** Add:
```python
class WeatherObservation(models.Model):
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name="weather_observations")
    date = models.DateField()
    temp_min_c = models.FloatField(null=True, blank=True)
    temp_max_c = models.FloatField(null=True, blank=True)
    precipitation_mm = models.FloatField(null=True, blank=True)
    source = models.CharField(max_length=100, blank=True, default="manual import")

    class Meta:
        unique_together = ("location", "date")
        ordering = ["-date"]
```

**Migration:**
```
cd backend
.\.venv\Scripts\python manage.py makemigrations core
.\.venv\Scripts\python manage.py migrate
```

**File 2: `backend/apps/core/models.py` / `serializers.py` / `viewsets.py` / `urls.py`.** Add a standard `WeatherObservationSerializer` + `WeatherObservationViewSet(ProgramScopedQuerySetMixin, viewsets.ModelViewSet)` — **note:** `WeatherObservation` has no direct `program` field, only `location`; set `program_lookup = "location__program_id"` on the viewset if `Location` has a `program` FK, or check how `Location` is scoped elsewhere in this codebase first (it wasn't confirmed program-scoped in this audit) before assuming that lookup path is correct. Register it in `apps/core/urls.py`'s router as `router.register(r"weather", WeatherObservationViewSet, basename="weather")`, following the exact pattern already used for `seasons`/other core routes in that file.

**File 3:** CSV import. Reuse `apps.core.spreadsheet` (the shared CSV/Excel reader already used for Field Book import, per this project's own engineering convention: "Spreadsheet import/export goes through `apps.core.spreadsheet`... rather than ad hoc `csv`/`openpyxl` calls"). Add an import endpoint or management command accepting columns `location, date, temp_min_c, temp_max_c, precipitation_mm` — mirror `import_fieldbook_csv`'s structure (column matching, per-row validation errors, dry-run) rather than writing a new ad hoc parser. This file wasn't fully re-read for this specific ticket — follow the exact per-row error-collection pattern established in `import_fieldbook_csv` (`backend/apps/trials/services.py`) when implementing this.

**File 4: frontend.** A simple read-only table (not a chart, for v1) added as a new tab in `TrialDetail.tsx`'s `Tabs` array (same pattern as Ticket E2's QC tab), showing `WeatherObservation` rows for the trial's `location` between `planting_date` and `harvest_date` (or today, if not yet harvested).

**Explicitly deferred, do not build without a follow-up decision from the user:** live weather-API auto-fetching. That needs: which provider, an API key/credential storage decision, and a fetch-scheduling mechanism (cron/Celery — check whether this project has any background-job infrastructure at all before assuming one is available).

**Verification:** `cd backend; .\.venv\Scripts\python -m pytest -q` (add a test for the CSV import path: valid rows create `WeatherObservation` records, an invalid date is reported as a row error). `cd frontend; npx tsc --noEmit` (0 errors).

---

## Final check

After all twenty-six tickets (A1–A3, B1–B5, C1–C4, D1–D4, E1–E6, F2–F4 — F1 is discovery only, not a code ticket): `cd backend; .\.venv\Scripts\python -m pytest -q` and `cd frontend; npx tsc --noEmit` must both be clean. Initiative 2 (genomics ↔ crossing) is intentionally not part of this spec — it's deferred to a later stage.
