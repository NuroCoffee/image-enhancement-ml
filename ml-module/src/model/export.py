import json
import shutil
import subprocess
from pathlib import Path
from src.utils.config import PROJECT_ROOT


def export_tensorflowjs(saved_model=None, output=None, float16=True):
    saved_model = Path(saved_model or PROJECT_ROOT / "artifacts" / "saved_model")
    output = Path(output or PROJECT_ROOT / "artifacts" / "tensorflowjs")
    metadata = PROJECT_ROOT / "artifacts" / "model_metadata.json"
    if not (saved_model / "saved_model.pb").exists():
        raise FileNotFoundError(f"SavedModel не найден: {saved_model}")
    if not metadata.is_file():
        raise FileNotFoundError(f"Метаданные модели не найдены: {metadata}")
    executable = shutil.which("tensorflowjs_converter")
    if not executable:
        raise RuntimeError("Не установлен tensorflowjs. Выполните: pip install -r requirements-export.txt")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    command = [
        executable,
        "--input_format=tf_saved_model",
        "--output_format=tfjs_graph_model",
        "--signature_name=serving_default",
        "--saved_model_tags=serve",
    ]
    if float16:
        command.append("--quantize_float16=*")
    command.extend([str(saved_model), str(output)])
    subprocess.run(command, check=True)
    shutil.copy2(metadata, output / "model_metadata.json")
    files = [path for path in output.iterdir() if path.is_file()]
    size = sum(path.stat().st_size for path in files)
    result = {
        "output": str(output),
        "size_bytes": size,
        "size_megabytes": round(size / 1024 / 1024, 3),
        "files": sorted(path.name for path in files),
    }
    with (output / "export-info.json").open("w", encoding="utf-8") as file:
        json.dump(result, file, ensure_ascii=False, indent=2)
    return result
