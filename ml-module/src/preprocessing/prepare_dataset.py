from datetime import datetime, timezone
from src.preprocessing.check_dataset import check_raw_dataset
from src.preprocessing.image_processor import process_dataset
from src.preprocessing.pair_builder import build_splits, write_splits
from src.utils.config import load_json, load_meta, save_json


def prepare_dataset(force=False, workers=None, check_only=False, synthesis_path="config/synthesis.json"):
    meta = load_meta()
    counts = check_raw_dataset(meta)
    if check_only:
        return counts
    synthesis = load_json(synthesis_path)
    processed = process_dataset(meta, force=force, workers=workers)
    splits = build_splits(processed, meta, synthesis)
    write_splits(splits, meta, synthesis)
    meta["prepared"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        "clean": {split: len(paths) for split, paths in processed.items()},
        "examples": {split: len(items) for split, items in splits.items()},
        "train_examples_per_epoch": len(splits["train"]) * int(synthesis["train_variants_per_epoch"]),
    }
    save_json("data/meta.json", meta)
    return meta["prepared"]
