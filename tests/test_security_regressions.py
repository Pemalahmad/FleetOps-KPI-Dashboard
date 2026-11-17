import duckdb
import pytest

from fleetkpi.ingest import _converter
from fleetkpi.webexport import _lit


@pytest.mark.parametrize("text", ["1e30", "Infinity", "-2147483649", "not a number"])
def test_out_of_range_integer_is_reportable_null(text):
    con = duckdb.connect()
    try:
        assert con.execute("SELECT " + _converter("INTEGER", "?"), [text]).fetchone()[0] is None
    finally:
        con.close()


def test_parquet_export_path_with_apostrophe_is_a_literal(tmp_path):
    out = tmp_path / "O'Brien.parquet"
    con = duckdb.connect()
    try:
        con.execute(f"COPY (SELECT 42 AS n) TO {_lit(str(out))} (FORMAT parquet)")
        assert con.execute("SELECT n FROM read_parquet(?)", [str(out)]).fetchone()[0] == 42
    finally:
        con.close()
