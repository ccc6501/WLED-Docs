"""Launcher utility for the MONKY local dashboard."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
SERVER_PATH = BASE_DIR / "server.py"


def load_config() -> Dict[str, Any]:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError("config.json missing")
    with CONFIG_PATH.open("r", encoding="utf-8") as fp:
        data = json.load(fp) or {}
    if not isinstance(data, dict):
        raise ValueError("config.json must contain an object")
    return data


def run_setup_wizard() -> None:
    wizard = BASE_DIR / "setup_wizard.py"
    if not wizard.exists():
        raise FileNotFoundError("setup_wizard.py not found")
    subprocess.Popen([sys.executable, str(wizard)], cwd=str(BASE_DIR))


def pythonw_executable() -> str:
    if sys.platform.startswith("win"):
        pythonw = Path(sys.executable).with_name("pythonw.exe")
        if pythonw.exists():
            return str(pythonw)
    return sys.executable


def start_server(port: int) -> subprocess.Popen:
    if not SERVER_PATH.exists():
        raise FileNotFoundError("server.py not found")

    env = os.environ.copy()
    env.setdefault("PROXY_HOST", "127.0.0.1")
    env.setdefault("PROXY_PORT", str(port))

    kwargs: Dict[str, Any] = {
        "cwd": str(BASE_DIR),
        "env": env,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }

    executable = pythonw_executable()
    args = [executable, str(SERVER_PATH)]

    if sys.platform.startswith("win"):
        CREATE_NO_WINDOW = 0x08000000
        DETACHED_PROCESS = 0x00000008
        kwargs["creationflags"] = CREATE_NO_WINDOW | DETACHED_PROCESS
        kwargs["close_fds"] = True

    return subprocess.Popen(args, **kwargs)


def wait_for_health(port: int, timeout: float = 30.0, process: Optional[subprocess.Popen] = None) -> bool:
    deadline = time.time() + timeout
    url = f"http://127.0.0.1:{port}/health"
    while time.time() < deadline:
        if process and process.poll() is not None:
            return False
        try:
            req = Request(url, headers={"Accept": "application/json"})
            with urlopen(req, timeout=5) as response:
                if 200 <= response.status < 300:
                    try:
                        payload = json.load(response)
                    except json.JSONDecodeError:
                        payload = {}
                    if payload.get("ok") is True:
                        return True
        except (HTTPError, URLError, OSError):
            pass
        time.sleep(1)
    return False


def open_dashboard(port: int) -> None:
    url = f"http://127.0.0.1:{port}/"
    webbrowser.open(url, new=1, autoraise=True)


def main() -> None:
    try:
        config = load_config()
    except FileNotFoundError:
        run_setup_wizard()
        return
    except Exception as exc:
        print(f"Failed to read config: {exc}")
        return

    port = int(config.get("HTTP_PORT", 5000))

    try:
        process = start_server(port)
    except Exception as exc:
        print(f"Failed to start server: {exc}")
        return

    if wait_for_health(port, timeout=30, process=process):
        open_dashboard(port)
    else:
        print("Server did not become ready within 30 seconds.")
        if process.poll() is None:
            process.terminate()


if __name__ == "__main__":  # pragma: no cover - script execution
    main()
