import importlib
import os
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


@pytest.fixture()
def private(monkeypatch):
    """A scratch private/ folder so tests never touch real data."""
    d = tempfile.mkdtemp(prefix="jf-test-")
    monkeypatch.setenv("JOBFINDER_PRIVATE", d)
    from jobfinder import config
    importlib.reload(config)
    import jobfinder.store as store
    importlib.reload(store)
    yield Path(d)
