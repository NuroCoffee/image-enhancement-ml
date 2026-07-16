import hashlib
import json
import numpy as np
from PIL import Image
from src.preprocessing.synthetic_generator import sample_parameters_numpy
from src.utils.config import resolve_path


def relative(path):
    return str(path.resolve().relative_to(resolve_path(".").resolve())).replace("\\", "/")


def fixed_seed(base_seed, split, image_id, index):
    value = f"{base_seed}:{split}:{image_id}:{index}".encode()
    digest = hashlib.blake2b(value, digest_size=8).digest()
    return int.from_bytes(digest, "little") & 0x7FFFFFFF


def read_image(path):
    with Image.open(path) as image:
        image = image.convert("RGB").resize((64, 64), Image.Resampling.BILINEAR)
        return np.asarray(image, dtype=np.float32) / 255.0


def build_splits(processed, meta, synthesis):
    base_seed = int(meta["dataset"]["seed"])
    names = meta["labels"]["parameters"]
    splits = {
        "train": [
            {"id": path.stem, "clean": relative(path)}
            for path in processed["train"]
        ]
    }
    for split in ("valid", "test"):
        count = int(synthesis[f"{split}_variants_per_image"])
        items = []
        for path in processed[split]:
            image = read_image(path)
            for index in range(count):
                seed = fixed_seed(base_seed, split, path.stem, index)
                values = sample_parameters_numpy(image, seed, synthesis)
                items.append({
                    "id": f"{path.stem}-{index:02d}",
                    "clean": relative(path),
                    "seed": seed,
                    "labels": {name: float(values[position]) for position, name in enumerate(names)},
                })
        splits[split] = items
    return splits


def write_splits(splits, meta, synthesis):
    directory = resolve_path(meta["paths"]["pairs"])
    directory.mkdir(parents=True, exist_ok=True)
    for split, items in splits.items():
        payload = {
            "split": split,
            "seed": int(meta["dataset"]["seed"]),
            "count": len(items),
            "train_variants_per_epoch": int(synthesis["train_variants_per_epoch"]) if split == "train" else None,
            "items": items,
        }
        with (directory / f"{split}.json").open("w", encoding="utf-8") as file:
            json.dump(payload, file, ensure_ascii=False, indent=2)
