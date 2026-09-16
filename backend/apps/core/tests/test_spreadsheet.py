import csv
import io

import openpyxl
import pytest

from apps.core.spreadsheet import (
    SpreadsheetReadError,
    build_csv_response,
    build_xlsx_response,
    is_xlsx_filename,
    read_spreadsheet_rows,
)


def make_xlsx_bytes(headers, rows):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def test_is_xlsx_filename():
    assert is_xlsx_filename("data.xlsx") is True
    assert is_xlsx_filename("DATA.XLSX") is True
    assert is_xlsx_filename("data.csv") is False
    assert is_xlsx_filename("") is False
    assert is_xlsx_filename(None) is False


def test_read_spreadsheet_rows_csv_matches_dictreader_shape():
    content = "name,species\nKAUZ,Triticum aestivum\nPASTOR,Triticum aestivum\n"
    file_obj = io.BytesIO(content.encode("utf-8"))

    headers, rows = read_spreadsheet_rows(file_obj, "germplasm.csv")

    assert headers == ["name", "species"]
    assert rows == [
        {"name": "KAUZ", "species": "Triticum aestivum"},
        {"name": "PASTOR", "species": "Triticum aestivum"},
    ]


def test_read_spreadsheet_rows_xlsx_matches_csv_shape_for_equivalent_content():
    buf = make_xlsx_bytes(
        ["name", "species"],
        [["KAUZ", "Triticum aestivum"], ["PASTOR", "Triticum aestivum"]],
    )

    headers, rows = read_spreadsheet_rows(buf, "germplasm.xlsx")

    assert headers == ["name", "species"]
    assert rows == [
        {"name": "KAUZ", "species": "Triticum aestivum"},
        {"name": "PASTOR", "species": "Triticum aestivum"},
    ]


def test_read_spreadsheet_rows_xlsx_skips_trailing_blank_rows():
    buf = make_xlsx_bytes(
        ["name", "species"],
        [["KAUZ", "Triticum aestivum"], [None, None], ["PASTOR", "Triticum aestivum"]],
    )

    headers, rows = read_spreadsheet_rows(buf, "germplasm.xlsx")

    assert len(rows) == 2
    assert rows[0]["name"] == "KAUZ"
    assert rows[1]["name"] == "PASTOR"


def test_read_spreadsheet_rows_xlsx_collapses_integer_valued_floats():
    # Excel stores a year typed as "2018" as a float internally; the reader
    # should hand back "2018", not "2018.0", so downstream int() parsing
    # behaves the same as it does for the equivalent CSV cell.
    buf = make_xlsx_bytes(["name", "year_developed"], [["KAUZ", 2018.0]])

    headers, rows = read_spreadsheet_rows(buf, "germplasm.xlsx")

    assert rows[0]["year_developed"] == "2018"


def test_read_spreadsheet_rows_xlsx_none_cells_become_empty_string():
    buf = make_xlsx_bytes(["name", "notes"], [["KAUZ", None]])

    headers, rows = read_spreadsheet_rows(buf, "germplasm.xlsx")

    assert rows[0]["notes"] == ""


def test_read_spreadsheet_rows_empty_xlsx_returns_empty():
    buf = make_xlsx_bytes([], [])
    headers, rows = read_spreadsheet_rows(buf, "empty.xlsx")
    assert headers == []
    assert rows == []


def test_read_spreadsheet_rows_corrupted_xlsx_raises_read_error_not_crash():
    # A .csv renamed to .xlsx is not a valid zip/OOXML container.
    bad_file = io.BytesIO(b"name,species\nKAUZ,wheat\n")
    with pytest.raises(SpreadsheetReadError):
        read_spreadsheet_rows(bad_file, "not_really.xlsx")


def test_read_spreadsheet_rows_truncated_xlsx_raises_read_error_not_crash():
    buf = make_xlsx_bytes(["name"], [["KAUZ"]])
    truncated = io.BytesIO(buf.getvalue()[:20])
    with pytest.raises(SpreadsheetReadError):
        read_spreadsheet_rows(truncated, "truncated.xlsx")


def test_read_spreadsheet_rows_csv_latin1_fallback():
    # A byte sequence that's invalid UTF-8 but valid Latin-1 (e.g. 'é' as
    # the single byte 0xE9), mirroring real-world Field Book / Excel CSV
    # exports that aren't UTF-8.
    raw = "name,notes\nKAUZ,caf\xe9\n".encode("latin-1")
    headers, rows = read_spreadsheet_rows(io.BytesIO(raw), "notes.csv")
    assert rows[0]["notes"] == "café"


def test_build_csv_response_round_trips():
    response = build_csv_response(["a", "b"], [[1, 2], [3, 4]], "myfile")
    assert response["Content-Disposition"] == 'attachment; filename="myfile.csv"'
    content = response.content.decode("utf-8")
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    assert rows == [["a", "b"], ["1", "2"], ["3", "4"]]


def test_build_xlsx_response_round_trips():
    response = build_xlsx_response(["a", "b"], [[1, 2], [3, 4]], "myfile")
    assert response["Content-Disposition"] == 'attachment; filename="myfile.xlsx"'
    wb = openpyxl.load_workbook(io.BytesIO(response.content))
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    assert rows == [("a", "b"), (1, 2), (3, 4)]
