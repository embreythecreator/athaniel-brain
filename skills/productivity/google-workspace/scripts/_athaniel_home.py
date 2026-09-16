"""Resolve ATHANIEL_HOME for standalone skill scripts.

Skill scripts may run outside the Athaniel process (e.g. system Python,
nix env, CI) where ``athaniel_constants`` is not importable.  This module
provides the same ``get_athaniel_home()`` and ``display_athaniel_home()``
contracts as ``athaniel_constants`` without requiring it on ``sys.path``.

When ``athaniel_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``athaniel_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``ATHANIEL_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from athaniel_constants import display_athaniel_home as display_athaniel_home
    from athaniel_constants import get_athaniel_home as get_athaniel_home
except (ModuleNotFoundError, ImportError):

    def get_athaniel_home() -> Path:
        """Return the Athaniel home directory (default: ~/.athaniel).

        Mirrors ``athaniel_constants.get_athaniel_home()``."""
        val = os.environ.get("ATHANIEL_HOME", "").strip()
        return Path(val) if val else Path.home() / ".athaniel"

    def display_athaniel_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``athaniel_constants.display_athaniel_home()``."""
        home = get_athaniel_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
