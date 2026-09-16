from pathlib import Path


def test_windows_native_install_path_docs_match_installer() -> None:
    doc = Path("website/docs/user-guide/windows-native.md").read_text()
    install = Path("scripts/install.ps1").read_text()

    # The launchers live in the managed binary dir OUTSIDE the git checkout
    # (ATHANIEL_HOME\bin, next to the managed uv) — NOT the whole venv\Scripts
    # (which would shadow the user's python, #83797) and NOT a dir inside
    # the checkout (which `athaniel update`'s autostash swept off disk).
    assert "%LOCALAPPDATA%\\athaniel\\bin" in doc
    assert (
        "Get-Command athaniel        # should print "
        "C:\\Users\\<you>\\AppData\\Local\\athaniel\\bin\\athaniel.exe"
    ) in doc
    # Installer exposes $AthanielHome\bin, and must copy the launchers into it.
    assert '$athanielBin = "$AthanielHome\\bin"' in install
    assert "athaniel.exe" in install and "athaniel-acp.exe" in install
    # Guard against regressions to either legacy layout.
    assert '$athanielBin = "$InstallDir\\venv\\Scripts"' not in install
    assert '$athanielBin = "$InstallDir\\bin"' not in install
