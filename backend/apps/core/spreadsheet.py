import csv
import io
import zipfile

from openpyxl import Workbook, load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from django.http import HttpResponse

XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


class SpreadsheetReadError(Exception):
    """A CSV/XLSX file couldn't be parsed - malformed workbook, truncated
    upload, or a mismatched extension. Callers should catch this and
    return a clean 400 rather than letting the underlying parser error
    (openpyxl's InvalidFileException, a zipfile.BadZipFile, csv errors)
    surface as a 500.
    """


def is_xlsx_filename(filename: str) -> bool:
    return (filename or "").lower().endswith(".xlsx")


def _cell_to_str(value) -> str:
    """Stringify one openpyxl cell value to match what a human typed.

    Excel stores whole numbers (e.g. a year typed as 2018) as floats
    internally, so a naive str(value) would produce "2018.0" and break
    downstream int() parsing that works fine for the equivalent CSV cell.
    Collapse an integer-valued float back to its plain integer string.
    """
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def read_spreadsheet_rows(file_obj, filename: str) -> tuple[list[str], list[dict]]:
    """Read a CSV or XLSX file-like object into (headers, rows), where
    each row is a dict keyed by the header row with every value coerced to
    a string (or "" for empty/None cells) - matching csv.DictReader's
    string-only output so downstream int()/float()/strip() parsing behaves
    identically regardless of which format was uploaded.

    `headers` is always returned, even when there are zero data rows below
    it, so callers can validate "does this file have the required
    column(s)" independently of whether it has any data.
    """
    if is_xlsx_filename(filename):
        try:
            wb = load_workbook(filename=file_obj, data_only=True, read_only=True)
        except (InvalidFileException, KeyError, zipfile.BadZipFile) as exc:
            raise SpreadsheetReadError(f"Could not read XLSX file: {exc}") from exc

        try:
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)
            try:
                header_row = next(rows_iter)
            except StopIteration:
                return [], []
            headers = [str(h).strip() if h is not None else "" for h in header_row]

            rows = []
            for raw_row in rows_iter:
                if raw_row is None or all(v is None for v in raw_row):
                    continue
                row = {}
                for i, value in enumerate(raw_row):
                    key = headers[i] if i < len(headers) else f"col_{i}"
                    row[key] = _cell_to_str(value)
                rows.append(row)
            return headers, rows
        finally:
            wb.close()

    raw = file_obj.read()
    if isinstance(raw, str):
        text = raw
    else:
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            # Field Book and older spreadsheet tools sometimes export
            # Latin-1 rather than UTF-8; fall back instead of rejecting an
            # otherwise-valid file outright.
            text = raw.decode("latin-1")

    try:
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        return list(reader.fieldnames or []), rows
    except csv.Error as exc:
        raise SpreadsheetReadError(f"Could not read CSV file: {exc}") from exc


def build_csv_response(headers: list[str], rows: list[list], filename_base: str) -> HttpResponse:
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
    writer = csv.writer(response)
    writer.writerow(headers)
    writer.writerows(rows)
    return response


def build_xlsx_response(headers: list[str], rows: list[list], filename_base: str) -> HttpResponse:
    wb = Workbook(write_only=True)
    ws = wb.create_sheet()
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    response = HttpResponse(buf.getvalue(), content_type=XLSX_CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename_base}.xlsx"'
    return response


def build_spreadsheet_response(
    fmt: str, headers: list[str], rows: list[list], filename_base: str
) -> HttpResponse:
    if fmt == "xlsx":
        return build_xlsx_response(headers, rows, filename_base)
    return build_csv_response(headers, rows, filename_base)
