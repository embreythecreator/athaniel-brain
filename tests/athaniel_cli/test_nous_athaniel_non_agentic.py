"""Tests for the Nous-athaniel-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"athaniel"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``athaniel-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "athaniel" tag namespace.

``is_nous_athaniel_non_agentic`` should only match the actual Athaniel
athaniel-3 / Athaniel-4 chat family.
"""

from __future__ import annotations

import pytest

from athaniel_cli.model_switch import (
    _ATHANIEL_MODEL_WARNING,
    _check_athaniel_model_warning,
    is_nous_athaniel_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "embreythecreator/athaniel-3-Llama-3.1-70B",
        "embreythecreator/athaniel-3-Llama-3.1-405B",
        "athaniel-3",
        "athaniel-3",
        "athaniel-4",
        "athaniel-4-405b",
        "athaniel_4_70b",
        "openrouter/athaniel3:70b",
        "openrouter/embreythecreator/athaniel-4-405b",
        "embreythecreator/athaniel3",
        "athaniel-3.1",
    ],
)
def test_matches_real_nous_athaniel_chat_models(model_name: str) -> None:
    assert is_nous_athaniel_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous Athaniel 3/4"
    )
    assert _check_athaniel_model_warning(model_name) == _ATHANIEL_MODEL_WARNING


