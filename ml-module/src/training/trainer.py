import json
import shutil
from datetime import datetime
import tensorflow as tf
from src.data.dataset import build_dataset
from src.model.cnn import build_model
from src.training.callbacks import build_callbacks
from src.training.metrics import brightness_mae, contrast_mae, saturation_mae
from src.utils.config import PROJECT_ROOT, load_json, load_meta, save_json
from src.utils.logger import configure_logging
from src.utils.reproducibility import set_seed
from src.utils.runtime import configure_runtime


def compile_model(model, config):
    model.compile(
        optimizer=tf.keras.optimizers.Adam(float(config["learning_rate"])),
        loss=tf.keras.losses.Huber(delta=0.1),
        metrics=[
            tf.keras.metrics.MeanAbsoluteError(name="mae"),
            tf.keras.metrics.RootMeanSquaredError(name="rmse"),
            brightness_mae,
            contrast_mae,
            saturation_mae,
        ],
        jit_compile=bool(config.get("jit_compile", False)),
        steps_per_execution=int(config.get("steps_per_execution", 1)),
    )


def export_saved_model(model, path):
    if path.exists():
        shutil.rmtree(path)
    if hasattr(model, "export"):
        model.export(path)
    else:
        tf.saved_model.save(model, path)


def build_metadata(meta, model_config, synthesis):
    return {
        "format": "tfjs_graph_model",
        "input": {
            "name": "image",
            "shape": [None, int(model_config["input_size"]), int(model_config["input_size"]), 3],
            "dtype": "float32",
            "range": [0.0, 1.0],
            "preprocessing": "center_square_crop_resize",
        },
        "output": {
            "name": "adjustments",
            "parameters": meta["labels"]["parameters"],
            "range": meta["labels"]["range"],
        },
        "correction": {
            "order": ["brightness", "contrast", "saturation"],
            "brightness_scale": synthesis["brightness_scale"],
            "contrast_scale": synthesis["contrast_scale"],
            "saturation_scale": synthesis["saturation_scale"],
            "factor_formula": "2^(scale*parameter)",
            "luma_weights": [0.2126, 0.7152, 0.0722],
        },
    }


def train(training_config_path, model_config_path, synthesis_config_path, resume=None):
    training_config = load_json(training_config_path)
    model_config = load_json(model_config_path)
    synthesis = load_json(synthesis_config_path)
    meta = load_meta()
    seed = int(meta["dataset"]["seed"])
    set_seed(seed, bool(training_config.get("deterministic", False)))
    gpus = configure_runtime(bool(training_config.get("mixed_precision", True)))
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    checkpoint_dir = PROJECT_ROOT / "checkpoints" / run_id
    log_dir = PROJECT_ROOT / "logs" / run_id
    logger = configure_logging(log_dir / "training.log")
    logger.info("Устройства GPU: %s", [gpu.name for gpu in gpus])
    train_dataset, train_count = build_dataset("train", meta, training_config, model_config, synthesis)
    valid_dataset, valid_count = build_dataset("valid", meta, training_config, model_config, synthesis)
    model = tf.keras.models.load_model(resume, compile=False) if resume else build_model(model_config)
    compile_model(model, training_config)
    callbacks = build_callbacks(checkpoint_dir, log_dir, training_config)
    log_dir.mkdir(parents=True, exist_ok=True)
    with (log_dir / "model_summary.txt").open("w", encoding="utf-8") as file:
        model.summary(print_fn=lambda line: file.write(f"{line}\n"))
    save_json(log_dir / "training_config.json", training_config)
    save_json(log_dir / "model_config.json", model_config)
    save_json(log_dir / "synthesis_config.json", synthesis)
    save_json(log_dir / "data_meta.json", meta)
    logger.info("Обучающие примеры за эпоху: %s, валидационные примеры: %s", train_count, valid_count)
    history = model.fit(
        train_dataset,
        validation_data=valid_dataset,
        epochs=int(training_config["epochs"]),
        callbacks=callbacks,
    )
    keras_path = PROJECT_ROOT / "artifacts" / "keras" / "image_enhancement.keras"
    saved_model_path = PROJECT_ROOT / "artifacts" / "saved_model"
    keras_path.parent.mkdir(parents=True, exist_ok=True)
    model.save(keras_path)
    export_saved_model(model, saved_model_path)
    save_json("artifacts/model_metadata.json", build_metadata(meta, model_config, synthesis))
    serializable_history = {name: [float(value) for value in values] for name, values in history.history.items()}
    with (log_dir / "history.json").open("w", encoding="utf-8") as file:
        json.dump(serializable_history, file, ensure_ascii=False, indent=2)
    return {
        "run_id": run_id,
        "keras_model": str(keras_path),
        "saved_model": str(saved_model_path),
        "metadata": str(PROJECT_ROOT / "artifacts" / "model_metadata.json"),
        "checkpoints": str(checkpoint_dir),
        "logs": str(log_dir),
    }
