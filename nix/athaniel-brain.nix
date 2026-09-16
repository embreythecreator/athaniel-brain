# nix/athaniel-brain.nix — Overridable Athaniel Brain package
#
# callPackage auto-wires nixpkgs args; flake inputs are passed explicitly.
# Users override via:
#   pkgs.athaniel-brain.override { extraPythonPackages = [...]; }
#   pkgs.athaniel-brain.override { extraDependencyGroups = [ "hindsight" ]; }
{
  lib,
  stdenv,
  makeWrapper,
  callPackage,
  python312,
  electron,
  ripgrep,
  git,
  openssh,
  ffmpeg,
  tirith,

  # linux-only deps
  wl-clipboard,
  xclip,

  # linux-only dev deps
  cage,

  # Flake inputs — passed explicitly by packages.nix and overlays.nix
  uv2nix,
  pyproject-nix,
  pyproject-build-systems,
  npm-lockfile-fix,
  # Locked git revision of the flake source — embedded so banner.py can
  # check for updates without needing a local .git directory. Null for
  # impure / dirty builds where flakes can't determine a rev.
  rev ? null,
  # Overridable parameters
  extraPythonPackages ? [ ],
  extraDependencyGroups ? [ ],
}:
let
  mkAthanielVenv =
    extraDependencyGroups:
    callPackage ./python.nix {
      inherit uv2nix pyproject-nix pyproject-build-systems;
      pythonSrc = athanielNpmLib.pythonSrc;
      dependency-groups = [ "all" ] ++ extraDependencyGroups;
    };

  athanielVenv = (mkAthanielVenv extraDependencyGroups).venv;

  athanielNpmLib = callPackage ./lib.nix {
    inherit npm-lockfile-fix;
  };

  athanielTui = callPackage ./tui.nix {
    inherit athanielNpmLib;
  };

  athanielWeb = callPackage ./web.nix {
    inherit athanielNpmLib;
  };

  bundledSkills = lib.cleanSourceWith {
    src = ../skills;
    filter = path: _type: !(lib.hasInfix "/index-cache/" path) && !(lib.hasInfix "/__pycache__/" path);
  };

  # Optional skills are NOT in the wheel (pythonSrc excludes them, see
  # lib.nix) — the wrapper exposes them via ATHANIEL_OPTIONAL_SKILLS, the
  # same mechanism Homebrew packaging uses.
  bundledOptionalSkills = lib.cleanSourceWith {
    src = ../optional-skills;
    filter = path: _type: !(lib.hasInfix "/index-cache/" path) && !(lib.hasInfix "/__pycache__/" path);
  };

  # Import bundled plugins (memory, context_engine, platforms/*).  Keeping
  # them out of the Python site-packages keeps import semantics identical
  # to a dev checkout — the loader reads them from ATHANIEL_BUNDLED_PLUGINS.
  bundledPlugins = lib.cleanSourceWith {
    src = ../plugins;
    filter = path: _type: !(lib.hasInfix "/__pycache__/" path);
  };

  # i18n locale catalogs (locales/*.yaml). Shipped into the store and pointed
  # at by ATHANIEL_BUNDLED_LOCALES so the wrapped binary always resolves human
  # strings instead of raw i18n keys (#23943 / #27632 / #35374).
  bundledLocales = lib.cleanSource ../locales;

  # Shipped MCP catalog (optional-mcps/<name>/manifest.yaml). Same bare-data-dir
  # case as locales: not a Python package, so it's symlinked into the store and
  # exposed via ATHANIEL_OPTIONAL_MCPS.
  bundledOptionalMcps = lib.cleanSourceWith {
    src = ../optional-mcps;
    filter = path: _type: !(lib.hasInfix "/__pycache__/" path);
  };

  runtimeDeps = [
    athanielNpmLib.nodejs
    ripgrep
    git
    openssh
    ffmpeg
    tirith
  ]
  ++ lib.optionals stdenv.isLinux [
    wl-clipboard
    xclip
  ];

  runtimePath = lib.makeBinPath runtimeDeps;

  sitePackagesPath = python312.sitePackages;

  # Walk propagatedBuildInputs to include transitive Python deps in PYTHONPATH.
  # Without this, a plugin listing e.g. requests as a dep would fail at runtime
  # if requests isn't already in the sealed uv2nix venv.
  allExtraPythonPackages = python312.pkgs.requiredPythonModules extraPythonPackages;

  pythonPath = lib.makeSearchPath sitePackagesPath allExtraPythonPackages;

  checkPackageCollisions = ''
    import pathlib, sys, re

    def canonical(name):
        return re.sub(r'[-_.]+', '-', name).lower()

    # Collect core venv package names
    core = set()
    venv_sp = pathlib.Path('${athanielVenv}/${sitePackagesPath}')
    for di in venv_sp.glob('*.dist-info'):
        meta = di / 'METADATA'
        if meta.exists():
            for line in meta.read_text().splitlines():
                if line.startswith('Name:'):
                    core.add(canonical(line.split(':', 1)[1].strip()))
                    break

    # Check each extra package for collisions
    extras_dirs = [${lib.concatMapStringsSep ", " (p: "'${toString p}'") allExtraPythonPackages}]
    for edir in extras_dirs:
        sp = pathlib.Path(edir) / '${sitePackagesPath}'
        if not sp.exists():
            continue
        for di in sp.glob('*.dist-info'):
            meta = di / 'METADATA'
            if not meta.exists():
                continue
            for line in meta.read_text().splitlines():
                if line.startswith('Name:'):
                    pkg = canonical(line.split(':', 1)[1].strip())
                    if pkg in core:
                        print(f'ERROR: plugin package \"{pkg}\" collides with a package in athaniel sealed venv', file=sys.stderr)
                        print(f'  from: {di}', file=sys.stderr)
                        print(f'  Remove this dependency from extraPythonPackages.', file=sys.stderr)
                        sys.exit(1)
                    break

    print('No collisions found.')
  '';
in
stdenv.mkDerivation (finalAttrs: {
  pname = "athaniel-brain";
  version = (fromTOML (builtins.readFile ../pyproject.toml)).project.version;

  dontUnpack = true;
  dontBuild = true;
  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    # Symlinks, not copies: these are all store paths already, and the
    # wrapper env vars just hold paths.  Symlinking keeps this derivation
    # near-instant when only the venv changed, with an identical closure.
    mkdir -p $out/share/athaniel-brain $out/bin
    ln -s ${bundledSkills} $out/share/athaniel-brain/skills
    ln -s ${bundledOptionalSkills} $out/share/athaniel-brain/optional-skills
    ln -s ${bundledPlugins} $out/share/athaniel-brain/plugins
    ln -s ${bundledLocales} $out/share/athaniel-brain/locales
    ln -s ${bundledOptionalMcps} $out/share/athaniel-brain/optional-mcps
    ln -s ${athanielWeb} $out/share/athaniel-brain/web_dist
    ln -s ${athanielTui}/lib/athaniel-tui $out/ui-tui

    ${lib.concatMapStringsSep "\n"
      (name: ''
        makeWrapper ${athanielVenv}/bin/${name} $out/bin/${name} \
          --suffix PATH : "${runtimePath}" \
          --set ATHANIEL_BUNDLED_SKILLS $out/share/athaniel-brain/skills \
          --set ATHANIEL_OPTIONAL_SKILLS $out/share/athaniel-brain/optional-skills \
          --set ATHANIEL_BUNDLED_PLUGINS $out/share/athaniel-brain/plugins \
          --set ATHANIEL_BUNDLED_LOCALES $out/share/athaniel-brain/locales \
          --set ATHANIEL_OPTIONAL_MCPS $out/share/athaniel-brain/optional-mcps \
          --set ATHANIEL_WEB_DIST $out/share/athaniel-brain/web_dist \
          --set ATHANIEL_TUI_DIR $out/ui-tui \
          --set-default ATHANIEL_BIN $out/bin/athaniel \
          --set ATHANIEL_PYTHON ${athanielVenv}/bin/python3 \
          --set ATHANIEL_NODE ${lib.getExe athanielNpmLib.nodejs}${
            # Fold the line continuation INTO the optionalString: a bare
            # `\` on the line above an empty expansion would dangle onto a
            # blank line, ending the makeWrapper command early and running
            # the next flag as its own shell command (`--suffix: command
            # not found`). Only reproduces when rev == null (dirty trees).
            lib.optionalString (rev != null) " \\\n          --set ATHANIEL_REVISION ${rev}"
          }${
            lib.optionalString (
              extraPythonPackages != [ ]
            ) " \\\n          --suffix PYTHONPATH : \"${pythonPath}\""
          }
      '')
      [
        "athaniel"
        "athaniel-brain"
        "athaniel-acp"
      ]
    }

    ${lib.optionalString (extraPythonPackages != [ ]) ''
      echo "=== Checking for plugin/core package collisions ==="
      ${athanielVenv}/bin/python3 -c "${checkPackageCollisions}"
      echo "=== No collisions ==="
    ''}

    runHook postInstall
  '';

  passthru =
    let
      devPython = (mkAthanielVenv (extraDependencyGroups ++ [ "dev" ])).editableVenv;
    in
    {
      inherit
        athanielTui
        athanielWeb
        athanielNpmLib
        athanielVenv
        ;

      # `athanielDesktop` references `finalAttrs.finalPackage` (this whole
      # derivation, after all overrides are applied) so the desktop wrapper
      # can prepend its `/bin` to PATH.  The desktop's resolver step 4
      # ("existing athaniel on PATH") then picks up the fully wrapped
      # `athaniel` binary — venv with all deps, bundled skills/plugins,
      # runtime PATH (ripgrep/git/ffmpeg/etc).  No re-implementation
      # of the agent resolution in the desktop wrapper.
      athanielDesktop = callPackage ./desktop.nix {
        inherit athanielNpmLib electron;
        athanielAgent = finalAttrs.finalPackage;
      };

      devShellHook = ''
        export ATHANIEL_PYTHON=${devPython}/bin/python3
      '';

      devDeps =
        runtimeDeps
        ++ [
          devPython
        ]
        ++ lib.optionals stdenv.isLinux [
          cage # for running e2e tests without popping windows
        ];
    };

  meta = with lib; {
    description = "AI agent with advanced tool-calling capabilities";
    homepage = "https://github.com/embreythecreator/athaniel-brain";
    mainProgram = "athaniel";
    license = licenses.mit;
    platforms = platforms.unix;
  };
})
