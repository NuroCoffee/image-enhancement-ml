import json
from pathlib import Path
from src.utils.config import resolve_path

EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp"}


def image_files(path):
    return sorted(item for item in Path(path).iterdir() if item.is_file() and item.suffix.lower() in EXTENSIONS)


def check_raw_dataset(meta):
    root = resolve_path(meta["paths"]["raw_images"])
    counts = {}
    missing = []
    for split, source_name in meta["dataset"]["source_splits"].items():
        path = root / source_name
        if not path.is_dir():
            missing.append(str(path))
            continue
        count = len(image_files(path))
        expected = int(meta["dataset"]["expected_images"][split])
        if count < expected:
            raise RuntimeError(f"В {path} найдено {count} изображений, ожидается не менее {expected}")
        counts[split] = count
    if missing:
        homepage = meta["dataset"]["homepage"]
        expected = "\n".join(missing)
        raise FileNotFoundError(f"Не обнаружен BSDS500. Скачайте датасет: {homepage}\nОжидаемые директории:\n{expected}")
    return counts


def check_prepared_dataset(meta):
    pairs = resolve_path(meta["paths"]["pairs"])
    clean = resolve_path(meta["paths"]["clean_processed"])
    counts = {}
    for split in ("train", "valid", "test"):
        pair_file = pairs / f"{split}.json"
        split_dir = clean / split
        if not pair_file.is_file() or not split_dir.is_dir():
            raise FileNotFoundError("Подготовленные данные не найдены. Выполните: python -m src.preprocess")
        with pair_file.open("r", encoding="utf-8") as file:
            payload = json.load(file)
        if not payload.get("items"):
            raise RuntimeError(f"Пустой файл разбиения: {pair_file}")
        counts[split] = int(payload["count"])
    return counts
