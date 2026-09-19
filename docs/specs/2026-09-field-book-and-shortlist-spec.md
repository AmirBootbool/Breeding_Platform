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

## Final check

After all eight tickets: `cd backend; .\.venv\Scripts\python -m pytest -q` and `cd frontend; npx tsc --noEmit` must both be clean. Initiative 2 (genomics ↔ crossing) is intentionally not part of this spec — it's deferred to a later stage.
