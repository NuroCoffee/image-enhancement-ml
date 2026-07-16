from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image, ImageOps
from src.preprocessing.check_dataset import image_files
from src.utils.config import resolve_path


def process_image(source, target, size, quality, force):
    if target.is_file() and not force:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, (size, size), method=Image.Resampling.LANCZOS)
        image.save(target, "JPEG", quality=quality, optimize=True)
    return target


def process_dataset(meta, force=False, workers=None):
    raw_root = resolve_path(meta["paths"]["raw_images"])
    output_root = resolve_path(meta["paths"]["clean_processed"])
    size = int(meta["processing"]["size"])
    quality = int(meta["processing"]["quality"])
    workers = int(workers or meta["processing"]["workers"])
    result = {}
    for split, source_name in meta["dataset"]["source_splits"].items():
        sources = image_files(raw_root / source_name)
        targets = [output_root / split / f"{source.stem}.jpg" for source in sources]
        with ThreadPoolExecutor(max_workers=workers) as executor:
            result[split] = list(executor.map(
                lambda pair: process_image(pair[0], pair[1], size, quality, force),
                zip(sources, targets),
            ))
    return result
