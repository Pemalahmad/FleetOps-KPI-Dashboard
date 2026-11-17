"""fleetkpi command line.

  fleetkpi init [DIR]       create fleet.yml, data/input/, CSV templates and the data contract
  fleetkpi demo [DIR]       generate the demo fleet (BEV / PHEV / HEV / ICE) and build it
  fleetkpi contract         print the data contract
  fleetkpi validate         check your files against the contract; build nothing
  fleetkpi build [--force]  run the full pipeline into data/fleet.duckdb
  fleetkpi serve            open the dashboard
"""
from __future__ import annotations

import argparse
import csv
import os
import subprocess
import sys
import tempfile
from importlib import resources
from pathlib import Path

from . import __version__
from . import build as build_mod
from . import config as config_mod
from . import demo as demo_mod
from .contract import LOAD_ORDER, TABLES, contract_markdown


def cmd_init(args) -> int:
    root = Path(args.dir).resolve()
    (root / "data" / "input").mkdir(parents=True, exist_ok=True)
    tpl = root / "templates"
    tpl.mkdir(exist_ok=True)
    cfg = root / "fleet.yml"
    if not cfg.exists():
        cfg.write_text(resources.files("fleetkpi").joinpath("fleet.example.yml").read_text())
    for name in LOAD_ORDER:
        t = TABLES[name]
        with open(tpl / f"{name}.csv", "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow([c.name for c in t.columns])
            w.writerow([c.example for c in t.columns])
    (root / "DATA_CONTRACT.md").write_text(contract_markdown())
    print(f"Initialised {root}\n"
          f"  fleet.yml          settings (edit currency, intervals, targets, column mapping)\n"
          f"  templates/*.csv    one template per table, with an example row\n"
          f"  DATA_CONTRACT.md   every column, what it means, and the names we recognise\n"
          f"  data/input/        put your files here, then run: fleetkpi validate")
    return 0


def cmd_demo(args) -> int:
    root = Path(args.dir).resolve()
    cfg_path = demo_mod.generate(root)
    print(f"Demo data written to {root / 'data' / 'input'}")
    result = build_mod.run(config_mod.load(cfg_path))
    print(build_mod.summary(result))
    if result.ok:
        print(f"\nNext: cd {root} && fleetkpi serve")
    return 0 if result.ok else 1


def cmd_contract(args) -> int:
    print(contract_markdown())
    return 0


def cmd_validate(args) -> int:
    result = build_mod.run(config_mod.load(args.config), validate_only=True)
    print(build_mod.summary(result))
    errors = sum(i.severity == "error" for i in result.issues)
    print("\nReady to build." if not errors else f"\n{errors} error(s) to fix before building.")
    return 0 if not errors else 1


def cmd_build(args) -> int:
    result = build_mod.run(config_mod.load(args.config), force=args.force)
    print(build_mod.summary(result))
    return 0 if result.ok else 1


def cmd_serve(args) -> int:
    cfg = config_mod.load(args.config)
    if not cfg.database.exists():
        print("No warehouse yet: run `fleetkpi build` (or `fleetkpi demo`) first.")
        return 1
    app = resources.files("fleetkpi").joinpath("app", "dashboard.py")
    # Streamlit reads .streamlit/config.toml from the working directory: run from a temp dir that
    # carries the packaged light/dark theme, so the user's own folder is never touched.
    run_dir = Path(tempfile.mkdtemp(prefix="fleetkpi-"))
    (run_dir / ".streamlit").mkdir()
    (run_dir / ".streamlit" / "config.toml").write_text(
        resources.files("fleetkpi").joinpath("app", "theme.toml").read_text())
    env = {**os.environ, "FLEETKPI_CONFIG": str(cfg.path)}
    cmd = [sys.executable, "-m", "streamlit", "run", str(app), "--server.port", str(args.port),
           "--server.address", args.host, "--browser.gatherUsageStats", "false",
           # headless when there is no terminal (Docker, CI, background): skips Streamlit's first-run prompt
           "--server.headless", "false" if sys.stdin.isatty() else "true"]
    return subprocess.call(cmd, env=env, cwd=run_dir)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="fleetkpi", description="Plug-and-play fleet KPI warehouse and dashboard.")
    p.add_argument("--version", action="version", version=f"fleetkpi {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init", help="create a project with templates and settings")
    s.add_argument("dir", nargs="?", default=".")
    s.set_defaults(fn=cmd_init)

    s = sub.add_parser("demo", help="generate and build the demo fleet")
    s.add_argument("dir", nargs="?", default="fleetkpi-demo")
    s.set_defaults(fn=cmd_demo)

    s = sub.add_parser("contract", help="print the data contract")
    s.set_defaults(fn=cmd_contract)

    for name, fn, helptext in [("validate", cmd_validate, "check your data; build nothing"),
                               ("build", cmd_build, "run the full pipeline")]:
        s = sub.add_parser(name, help=helptext)
        s.add_argument("--config", "-c", default="fleet.yml")
        if name == "build":
            s.add_argument("--force", action="store_true", help="build even with validation errors")
        s.set_defaults(fn=fn)

    s = sub.add_parser("serve", help="open the dashboard")
    s.add_argument("--config", "-c", default="fleet.yml")
    s.add_argument("--port", type=int, default=8501)
    s.add_argument("--host", default="localhost")
    s.set_defaults(fn=cmd_serve)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
