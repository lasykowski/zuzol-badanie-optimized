"""FastAPI backend for the time-reproduction study."""

from __future__ import annotations

import csv
import io
import json
import math
import os
import sqlite3
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from starlette.background import BackgroundTask

from format_excel import generate_styled_excel

HOST = "0.0.0.0"
PORT = 8080
MAX_BODY_BYTES = int(os.environ.get("MAX_BODY_BYTES", str(64 * 1024)))
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data"))).resolve()
DB_FILE = DATA_DIR / "wyniki_badania.sqlite3"
LEGACY_CSV_FILE = DATA_DIR / "wyniki_badania.csv"
CSV_DELIMITER = ";"
PUBLIC_PDFS = {"ASRS (1).pdf", "KWESTIONARIUSZ ZWLEKANIA.pdf"}
REVERSED_ITEMS = {1, 11, 13, 14, 16, 21, 23, 25, 27, 28, 29, 30, 32, 33, 36, 37, 38, 39}


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Demographic(StrictModel):
    age: int = Field(ge=18, le=99)
    gender: Literal["kobieta", "mezczyzna", "inna"]
    education: Literal[
        "podstawowe", "srednie", "wyzsze_licencjat", "wyzsze_magister", "wyzsze_doktor"
    ]
    adhdDiagnosis: Literal["tak", "nie"]
    adhdMedication: Literal["tak", "nie"]


class ASRS(StrictModel):
    answers: dict[str, int]
    partA: int = Field(ge=0, le=24)
    partB: int = Field(ge=0, le=48)
    total: int = Field(ge=0, le=72)

    @model_validator(mode="after")
    def validate_answers_and_totals(self) -> "ASRS":
        expected = {f"asrs_{i}" for i in range(1, 19)}
        if set(self.answers) != expected:
            raise ValueError("answers must contain exactly asrs_1 through asrs_18")
        if any(type(value) is not int or not 0 <= value <= 4 for value in self.answers.values()):
            raise ValueError("ASRS answers must be integers from 0 to 4")
        part_a = sum(self.answers[f"asrs_{i}"] for i in range(1, 7))
        part_b = sum(self.answers[f"asrs_{i}"] for i in range(7, 19))
        if (self.partA, self.partB, self.total) != (part_a, part_b, part_a + part_b):
            raise ValueError("ASRS totals do not match answers")
        return self


class Procrastination(StrictModel):
    rawAnswers: dict[str, int]
    scoredAnswers: dict[str, int]
    total: int = Field(ge=40, le=200)

    @model_validator(mode="after")
    def validate_answers_and_total(self) -> "Procrastination":
        raw_keys = {f"zwl_{i}" for i in range(1, 41)}
        scored_keys = {f"zwl_{i}_scored" for i in range(1, 41)}
        if set(self.rawAnswers) != raw_keys or set(self.scoredAnswers) != scored_keys:
            raise ValueError("procrastination answers must contain exactly 40 raw and scored items")
        expected_total = 0
        for item in range(1, 41):
            raw = self.rawAnswers[f"zwl_{item}"]
            scored = self.scoredAnswers[f"zwl_{item}_scored"]
            if type(raw) is not int or not 1 <= raw <= 5 or type(scored) is not int or not 1 <= scored <= 5:
                raise ValueError("procrastination answers must be integers from 1 to 5")
            if scored != (6 - raw if item in REVERSED_ITEMS else raw):
                raise ValueError(f"invalid scored answer for item {item}")
            expected_total += scored
        if self.total != expected_total:
            raise ValueError("procrastination total does not match scored answers")
        return self


class Trial(StrictModel):
    trialNumber: int = Field(ge=1, le=8)
    order: int = Field(ge=1, le=8)
    targetMs: int = Field(ge=100, le=120_000)
    actualStimulusMs: int = Field(ge=0, le=120_000)
    reproducedMs: int = Field(ge=0, le=300_000)
    errorMs: int = Field(ge=-120_000, le=300_000)
    absoluteErrorMs: int = Field(ge=0, le=300_000)
    relativeErrorPct: float = Field(ge=-100, le=300_000, allow_inf_nan=False)
    ratio: float = Field(ge=0, le=3_000, allow_inf_nan=False)
    tabHiddenDuringTrial: bool

    @model_validator(mode="after")
    def validate_derived_values(self) -> "Trial":
        if self.errorMs != self.reproducedMs - self.targetMs:
            raise ValueError("errorMs does not match reproducedMs - targetMs")
        if self.absoluteErrorMs != abs(self.errorMs):
            raise ValueError("absoluteErrorMs does not match errorMs")
        expected_relative = self.errorMs / self.targetMs * 100
        expected_ratio = self.reproducedMs / self.targetMs
        if not math.isclose(self.relativeErrorPct, expected_relative, abs_tol=0.05):
            raise ValueError("relativeErrorPct does not match trial values")
        if not math.isclose(self.ratio, expected_ratio, abs_tol=0.001):
            raise ValueError("ratio does not match trial values")
        return self


class StudyResult(StrictModel):
    participantId: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")
    timestamp: str
    demographic: Demographic
    asrs: ASRS
    zwlekanie: Procrastination
    experiment: list[Trial] = Field(min_length=8, max_length=8)

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise ValueError("timestamp must be ISO 8601") from exc
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("timestamp must include a timezone")
        return value

    @field_validator("experiment")
    @classmethod
    def validate_trial_numbers(cls, value: list[Trial]) -> list[Trial]:
        if sorted(trial.trialNumber for trial in value) != list(range(1, 9)):
            raise ValueError("experiment must contain trial numbers 1 through 8 exactly once")
        if sorted(trial.order for trial in value) != list(range(1, 9)):
            raise ValueError("experiment must contain order values 1 through 8 exactly once")
        return value


def db_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_FILE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")
    return connection


def initialize_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with db_connect() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA synchronous = NORMAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY,
                participant_id TEXT NOT NULL UNIQUE,
                timestamp TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS legacy_results (
                id INTEGER PRIMARY KEY,
                row_json TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS metadata (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS health_probe (
                id INTEGER PRIMARY KEY,
                checked_at TEXT NOT NULL
            );
            """
        )
        connection.execute("BEGIN IMMEDIATE")
        migrated = connection.execute(
            "SELECT 1 FROM metadata WHERE key = 'legacy_csv_migrated'"
        ).fetchone()
        count = connection.execute("SELECT COUNT(*) FROM results").fetchone()[0]
        legacy_count = connection.execute("SELECT COUNT(*) FROM legacy_results").fetchone()[0]
        if not migrated and count == 0 and legacy_count == 0 and LEGACY_CSV_FILE.is_file():
            with LEGACY_CSV_FILE.open("r", encoding="utf-8-sig", newline="") as handle:
                for row in csv.DictReader(handle, delimiter=CSV_DELIMITER):
                    connection.execute(
                        "INSERT INTO legacy_results(row_json) VALUES (?)",
                        (json.dumps(normalize_legacy_row(dict(row)), ensure_ascii=False),),
                    )
        connection.execute(
            "INSERT OR REPLACE INTO metadata(key, value) VALUES ('legacy_csv_migrated', CURRENT_TIMESTAMP)"
        )
        connection.commit()


def build_csv_headers(extra_headers: list[str] | None = None) -> list[str]:
    headers = [
        "participantId", "timestamp", "age", "gender", "education",
        "adhdDiagnosis", "adhdMedication",
    ]
    headers.extend(f"asrs_{item}" for item in range(1, 19))
    headers.extend(["asrs_partA", "asrs_partB", "asrs_total"])
    headers.extend(f"zwl_{item}_raw" for item in range(1, 41))
    headers.extend(f"zwl_{item}_scored" for item in range(1, 41))
    headers.append("zwlekanie_total")
    for trial in range(1, 9):
        headers.extend(
            [
                f"trial_{trial}_trialNumber",
                f"trial_{trial}_order",
                f"trial_{trial}_targetMs",
                f"trial_{trial}_actualStimulusMs",
                f"trial_{trial}_reproducedMs",
                f"trial_{trial}_errorMs",
                f"trial_{trial}_absErrorMs",
                f"trial_{trial}_relErrorPct",
                f"trial_{trial}_ratio",
                f"trial_{trial}_tabHiddenDuringTrial",
            ]
        )
    for header in extra_headers or []:
        if header not in headers:
            headers.append(header)
    return headers


def data_to_flat_row(data: dict) -> dict:
    flat: dict[str, object] = {
        "participantId": data["participantId"],
        "timestamp": data["timestamp"],
        **data["demographic"],
    }
    flat.update(data["asrs"]["answers"])
    flat.update(
        asrs_partA=data["asrs"]["partA"],
        asrs_partB=data["asrs"]["partB"],
        asrs_total=data["asrs"]["total"],
    )
    for item in range(1, 41):
        flat[f"zwl_{item}_raw"] = data["zwlekanie"]["rawAnswers"][f"zwl_{item}"]
        flat[f"zwl_{item}_scored"] = data["zwlekanie"]["scoredAnswers"][f"zwl_{item}_scored"]
    flat["zwlekanie_total"] = data["zwlekanie"]["total"]
    for trial in data["experiment"]:
        prefix = f"trial_{trial['trialNumber']}_"
        flat.update(
            {
                prefix + "trialNumber": trial["trialNumber"],
                prefix + "order": trial["order"],
                prefix + "targetMs": trial["targetMs"],
                prefix + "actualStimulusMs": trial["actualStimulusMs"],
                prefix + "reproducedMs": trial["reproducedMs"],
                prefix + "errorMs": trial["errorMs"],
                prefix + "absErrorMs": trial["absoluteErrorMs"],
                prefix + "relErrorPct": trial["relativeErrorPct"],
                prefix + "ratio": trial["ratio"],
                prefix + "tabHiddenDuringTrial": trial["tabHiddenDuringTrial"],
            }
        )
    return flat


def export_snapshot() -> tuple[list[str], list[dict]]:
    with db_connect() as connection:
        connection.execute("BEGIN")
        payloads = [
            data_to_flat_row(json.loads(row["payload_json"]))
            for row in connection.execute("SELECT payload_json FROM results ORDER BY id")
        ]
        legacy = [
            json.loads(row["row_json"])
            for row in connection.execute("SELECT row_json FROM legacy_results ORDER BY id")
        ]
        connection.commit()
    extra_headers = [key for row in legacy for key in row]
    return build_csv_headers(extra_headers), legacy + payloads


def safe_csv_value(value: object) -> object:
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def normalize_legacy_row(row: dict[str, str]) -> dict[str, object]:
    """Restore numeric CSV fields so negative measurements remain numbers."""
    normalized: dict[str, object] = dict(row)
    for key, value in row.items():
        is_numeric = (
            key == "age"
            or key.startswith(("asrs_", "zwl_", "trial_"))
            or key == "zwlekanie_total"
        )
        if not is_numeric or value == "":
            continue
        try:
            normalized[key] = float(value) if any(mark in value.lower() for mark in (".", "e")) else int(value)
        except ValueError:
            pass
    return normalized


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        try:
            content_length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            await JSONResponse({"detail": "Invalid Content-Length"}, status_code=400)(scope, receive, send)
            return
        if content_length > self.max_bytes:
            await JSONResponse({"detail": "Request body too large"}, status_code=413)(scope, receive, send)
            return
        messages = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > self.max_bytes:
                await JSONResponse({"detail": "Request body too large"}, status_code=413)(scope, receive, send)
                return
            messages.append(message)
            if not message.get("more_body", False):
                break

        async def replay():
            if messages:
                return messages.pop(0)
            return await receive()

        await self.app(scope, replay, send)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Badanie reprodukcji czasu",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
app.add_middleware(BodyLimitMiddleware, max_bytes=MAX_BODY_BYTES)


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; style-src 'self' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'"
    )
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith("/api/") or request.url.path == "/health":
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path in {"/", "/index.html"}:
        response.headers["Cache-Control"] = "no-cache"
    else:
        response.headers["Cache-Control"] = "public, max-age=3600"
    return response


@app.post("/api/save-results")
def save_results(result: StudyResult):
    payload = result.model_dump(mode="json")
    try:
        with db_connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "INSERT INTO results(participant_id, timestamp, payload_json) VALUES (?, ?, ?)",
                (
                    result.participantId,
                    result.timestamp,
                    json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                ),
            )
            connection.commit()
    except sqlite3.IntegrityError:
        return {
            "success": True,
            "status": "duplicate",
            "message": f"Wyniki uczestnika {result.participantId} były już zapisane.",
        }
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
    return {
        "success": True,
        "status": "saved",
        "message": f"Wyniki uczestnika {result.participantId} zapisane pomyślnie.",
    }


@app.get("/health")
def health():
    try:
        with db_connect() as connection:
            connection.execute("SELECT COUNT(*) FROM results").fetchone()
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("INSERT INTO health_probe(checked_at) VALUES (CURRENT_TIMESTAMP)")
            connection.rollback()
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="Database health check failed") from exc
    return {"status": "ok", "database": "read-write"}


@app.get("/api/download/csv")
def download_csv():
    headers, rows = export_snapshot()

    def stream():
        yield "\ufeff"
        output = io.StringIO()
        writer = csv.writer(output, delimiter=CSV_DELIMITER, lineterminator="\r\n")
        writer.writerow(headers)
        yield output.getvalue()
        for row in rows:
            output.seek(0)
            output.truncate(0)
            writer.writerow([safe_csv_value(row.get(header, "")) for header in headers])
            yield output.getvalue()

    return StreamingResponse(
        stream(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="wyniki_badania.csv"'},
    )


@app.get("/api/download/excel")
def download_excel():
    headers, rows = export_snapshot()
    handle = tempfile.NamedTemporaryFile(prefix="wyniki_", suffix=".xlsx", delete=False)
    path = Path(handle.name)
    handle.close()
    try:
        generate_styled_excel(rows=rows, headers=headers, excel_path=path)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="wyniki_badania_sformatowane.xlsx",
        background=BackgroundTask(path.unlink, missing_ok=True),
    )


def static_file(path: Path) -> FileResponse:
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(path)


@app.get("/")
@app.get("/index.html")
def index():
    return static_file(BASE_DIR / "index.html")


@app.get("/css/{filename}")
def css(filename: str):
    if "/" in filename or "\\" in filename or filename in {".", ".."}:
        raise HTTPException(status_code=404, detail="Not found")
    return static_file(BASE_DIR / "css" / filename)


@app.get("/js/{filename}")
def javascript(filename: str):
    if "/" in filename or "\\" in filename or filename in {".", ".."}:
        raise HTTPException(status_code=404, detail="Not found")
    return static_file(BASE_DIR / "js" / filename)


@app.get("/{filename}")
def public_pdf(filename: str):
    if filename not in PUBLIC_PDFS:
        raise HTTPException(status_code=404, detail="Not found")
    return static_file(BASE_DIR / filename)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host=HOST, port=PORT)
