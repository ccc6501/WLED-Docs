"""Interactive first-run wizard for configuring the MONKY dashboard."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

CONFIG_SCHEMA = {
    "GENESIS_BASE_URL": "https://api.ai.us.lmco.com/v1",
    "GENESIS_API_KEY": "",
    "OPENROUTER_API_KEY": "",
    "OPENROUTER_MODEL": "meta-llama/llama-3.1-8b-instruct",
    "CORP_SSL_CERT_PATH": "",
    "VECTOR_INDEX_DIR": "./vectorstore",
    "DESKTOP_EXPORT_DIR": str(Path.home() / "Desktop"),
    "ICONS_DIR": "",
    "USER_AVATAR_PATH": "",
    "EMBEDDING_MODEL": "text-embedding-3-small",
    "HTTP_TIMEOUT": 300,
    "HTTP_PORT": 5000,
}

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"


def load_existing_config() -> dict:
    if not CONFIG_PATH.exists():
        return dict(CONFIG_SCHEMA)
    try:
        with CONFIG_PATH.open("r", encoding="utf-8") as fp:
            data = json.load(fp) or {}
        if not isinstance(data, dict):
            raise ValueError("Invalid configuration format")
        existing = dict(CONFIG_SCHEMA)
        existing.update({k: v for k, v in data.items() if v is not None})
        return existing
    except Exception as exc:
        messagebox.showwarning("MONKY Setup", f"Existing config could not be read: {exc}")
        return dict(CONFIG_SCHEMA)


class SetupWizard(ttk.Frame):
    def __init__(self, master: tk.Tk):
        super().__init__(master, padding=20)
        self.master = master
        self.grid(sticky="nsew")
        master.title("MONKY Setup Wizard")
        master.geometry("640x560")
        master.minsize(620, 520)

        self.columnconfigure(1, weight=1)
        master.columnconfigure(0, weight=1)
        master.rowconfigure(0, weight=1)

        self.vars = {
            "GENESIS_API_KEY": tk.StringVar(),
            "GENESIS_BASE_URL": tk.StringVar(value=CONFIG_SCHEMA["GENESIS_BASE_URL"]),
            "OPENROUTER_API_KEY": tk.StringVar(),
            "OPENROUTER_MODEL": tk.StringVar(value=CONFIG_SCHEMA["OPENROUTER_MODEL"]),
            "CORP_SSL_CERT_PATH": tk.StringVar(),
            "VECTOR_INDEX_DIR": tk.StringVar(value=CONFIG_SCHEMA["VECTOR_INDEX_DIR"]),
            "DESKTOP_EXPORT_DIR": tk.StringVar(value=CONFIG_SCHEMA["DESKTOP_EXPORT_DIR"]),
            "ICONS_DIR": tk.StringVar(),
            "USER_AVATAR_PATH": tk.StringVar(),
            "HTTP_PORT": tk.StringVar(value=str(CONFIG_SCHEMA["HTTP_PORT"])),
        }

        ttk.Label(self, text="Configure MONKY", font=("Segoe UI", 16, "bold")).grid(row=0, column=0, columnspan=3, pady=(0, 20), sticky="w")

        row = 1
        row = self._add_entry(row, "Genesis API key", "GENESIS_API_KEY")
        row = self._add_entry(row, "Genesis base URL", "GENESIS_BASE_URL")
        row = self._add_entry(row, "OpenRouter API key", "OPENROUTER_API_KEY")
        row = self._add_entry(row, "OpenRouter default model", "OPENROUTER_MODEL")
        row = self._add_file_chooser(row, "Corporate SSL cert", "CORP_SSL_CERT_PATH", filetypes=[("Certificate", "*.pem *.crt"), ("All files", "*.*")])
        row = self._add_directory_chooser(row, "Vector index directory", "VECTOR_INDEX_DIR")
        row = self._add_directory_chooser(row, "Desktop export directory", "DESKTOP_EXPORT_DIR")
        row = self._add_directory_chooser(row, "Custom icons directory", "ICONS_DIR", required=False)
        row = self._add_file_chooser(row, "User avatar image", "USER_AVATAR_PATH", filetypes=[("Images", "*.png *.jpg *.jpeg *.gif"), ("All files", "*.*")], required=False)
        row = self._add_entry(row, "HTTP port", "HTTP_PORT")

        note = ttk.Label(
            self,
            text="Configuration is stored locally in config.json. Secrets remain on your machine.",
            foreground="#5e6c94",
            wraplength=560,
            justify="left",
        )
        note.grid(row=row, column=0, columnspan=3, pady=(12, 6), sticky="w")

        button_frame = ttk.Frame(self)
        button_frame.grid(row=row + 1, column=0, columnspan=3, sticky="e", pady=(10, 0))
        ttk.Button(button_frame, text="Cancel", command=self.master.destroy).grid(row=0, column=0, padx=(0, 8))
        ttk.Button(button_frame, text="Finish", command=self.finish).grid(row=0, column=1)

        self._load_defaults()

    def _add_entry(self, row: int, label: str, key: str) -> int:
        ttk.Label(self, text=label).grid(row=row, column=0, sticky="w", pady=4)
        entry = ttk.Entry(self, textvariable=self.vars[key])
        entry.grid(row=row, column=1, columnspan=2, sticky="ew", padx=(8, 0))
        return row + 1

    def _add_file_chooser(self, row: int, label: str, key: str, *, filetypes=None, required: bool = True) -> int:
        ttk.Label(self, text=label).grid(row=row, column=0, sticky="w", pady=4)
        entry = ttk.Entry(self, textvariable=self.vars[key])
        entry.grid(row=row, column=1, sticky="ew", padx=(8, 0))
        ttk.Button(
            self,
            text="Browse…",
            command=lambda: self._browse_file(key, filetypes=filetypes, required=required),
        ).grid(row=row, column=2, padx=(8, 0))
        return row + 1

    def _add_directory_chooser(self, row: int, label: str, key: str, required: bool = True) -> int:
        ttk.Label(self, text=label).grid(row=row, column=0, sticky="w", pady=4)
        entry = ttk.Entry(self, textvariable=self.vars[key])
        entry.grid(row=row, column=1, sticky="ew", padx=(8, 0))
        ttk.Button(
            self,
            text="Browse…",
            command=lambda: self._browse_directory(key, required=required),
        ).grid(row=row, column=2, padx=(8, 0))
        return row + 1

    def _browse_file(self, key: str, *, filetypes=None, required: bool = True) -> None:
        initialdir = Path(self.vars[key].get() or Path.home()).expanduser()
        filename = filedialog.askopenfilename(parent=self.master, filetypes=filetypes, initialdir=initialdir)
        if filename:
            self.vars[key].set(filename)
        elif required:
            self.vars[key].set("")

    def _browse_directory(self, key: str, *, required: bool = True) -> None:
        initialdir = Path(self.vars[key].get() or Path.home()).expanduser()
        directory = filedialog.askdirectory(parent=self.master, initialdir=initialdir)
        if directory:
            self.vars[key].set(directory)
        elif required:
            self.vars[key].set("")

    def _load_defaults(self) -> None:
        config = load_existing_config()
        for key, var in self.vars.items():
            value = config.get(key, "")
            if value is None:
                value = ""
            var.set(str(value))

    def finish(self) -> None:
        values = {key: var.get().strip() for key, var in self.vars.items()}

        try:
            port = int(values["HTTP_PORT"] or CONFIG_SCHEMA["HTTP_PORT"])
            if not (1 <= port <= 65535):
                raise ValueError
        except ValueError:
            messagebox.showerror("MONKY Setup", "HTTP port must be a number between 1 and 65535.")
            return

        values["HTTP_PORT"] = port
        config = dict(CONFIG_SCHEMA)
        config.update(values)

        try:
            with CONFIG_PATH.open("w", encoding="utf-8") as fp:
                json.dump(config, fp, indent=2)
        except Exception as exc:
            messagebox.showerror("MONKY Setup", f"Failed to write config.json: {exc}")
            return

        if messagebox.askyesno("MONKY Setup", "Configuration saved. Launch MONKY now?", default=messagebox.YES):
            self.launch_monky()
        self.master.destroy()

    def launch_monky(self) -> None:
        launcher = BASE_DIR / "launch_monky.py"
        if not launcher.exists():
            messagebox.showerror("MONKY Setup", "launch_monky.py not found")
            return
        try:
            subprocess.Popen([sys.executable, str(launcher)], cwd=str(BASE_DIR))
        except Exception as exc:
            messagebox.showerror("MONKY Setup", f"Unable to start MONKY: {exc}")


def main() -> None:
    root = tk.Tk()
    try:
        ttk.Style().theme_use("clam")
    except tk.TclError:
        pass
    SetupWizard(root)
    root.mainloop()


if __name__ == "__main__":  # pragma: no cover - script execution
    main()
