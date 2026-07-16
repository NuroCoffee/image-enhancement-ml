import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


def resolve_path(value):
    path = Path(value)
    return path if path.is_absolute() else PROJECT_ROOT / path


def load_json(path):
    with resolve_path(path).open("r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path, data):
    target = resolve_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def load_meta():
    return load_json("data/meta.json")
