"""Create a consistent online backup of the study database."""

from __future__ import annotations

import os
import sqlite3
import sys
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path


data_dir = Path(os.environ.get("DATA_DIR", "/app/data"))
source = data_dir / "wyniki_badania.sqlite3"
default_name = f"wyniki_badania_{datetime.now(UTC):%Y%m%dT%H%M%SZ}.sqlite3"
destination = Path(sys.argv[1]) if len(sys.argv) > 1 else data_dir / "backups" / default_name

if not source.is_file():
    raise SystemExit(f"Brak bazy danych: {source}")

destination.parent.mkdir(parents=True, exist_ok=True)
temporary = destination.with_suffix(destination.suffix + ".tmp")
temporary.unlink(missing_ok=True)

with closing(sqlite3.connect(source)) as source_db:
    with closing(sqlite3.connect(temporary)) as backup_db:
        source_db.backup(backup_db)
        if backup_db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("Kopia nie przeszła kontroli integralności")

temporary.replace(destination)
print(destination)
