"""Resolve ATHANIEL_HOME for standalone skill scripts.

Skill scripts may run outside the Athaniel process (system Python, nix env,
CI) where ``athaniel_constants`` is not importable.  This module provides the
same ``get_athaniel_home()`` contract without requiring it on ``sys.path``.

When ``athaniel_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from athaniel_constants import get_athaniel_home as get_athaniel_home
except (ModuleNotFoundError, ImportError):

    def get_athaniel_home() -> Path:
        """Return the Athaniel home directory (default: ``~/.athaniel``)."""
        val = os.environ.get("ATHANIEL_HOME", "").strip()
        return Path(val) if val else Path.home() / ".athaniel"
