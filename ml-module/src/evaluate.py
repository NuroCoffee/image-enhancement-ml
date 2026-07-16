import argparse
import json
import numpy as np
import tensorflow as tf
from src.data.dataset import build_dataset
from src.preprocessing.check_dataset import check_prepared_dataset, check_raw_dataset
from src.preprocessing.synthetic_generator import apply_correction_tf
from src.utils.config import PROJECT_ROOT, load_json, load_meta, resolve_path
from src.utils.logger import configure_logging
from src.utils.runtime import configure_runtime


def evaluate(model_path, training_config_path, model_config_path, synthesis_config_path):
    meta = load_meta()
    training_config = load_json(training_config_path)
    model_config = load_json(model_config_path)
    synthesis = load_json(synthesis_config_path)
    configure_runtime(False)
    dataset, count = build_dataset("test", meta, training_config, model_config, synthesis, include_clean=True)
    model = tf.keras.models.load_model(resolve_path(model_path), compile=False)
    predictions = []
    targets = []
    baseline_psnr = []
    baseline_ssim = []
    restored_psnr = []
    restored_ssim = []
    for degraded, labels, clean in dataset:
        predicted = model(degraded, training=False)
        restored = apply_correction_tf(degraded, predicted, synthesis)
        predictions.append(predicted.numpy())
        targets.append(labels.numpy())
        baseline_psnr.append(tf.image.psnr(clean, degraded, 1.0).numpy())
        baseline_ssim.append(tf.image.ssim(clean, degraded, 1.0).numpy())
        restored_psnr.append(tf.image.psnr(clean, restored, 1.0).numpy())
        restored_ssim.append(tf.image.ssim(clean, restored, 1.0).numpy())
    predictions = np.concatenate(predictions)
    targets = np.concatenate(targets)
    error = predictions - targets
    names = meta["labels"]["parameters"]
    metrics = {
        "count": count,
        "parameters": {
            "mae": float(np.mean(np.abs(error))),
            "rmse": float(np.sqrt(np.mean(np.square(error)))),
            "per_parameter": {
                name: {
                    "mae": float(np.mean(np.abs(error[:, index]))),
                    "rmse": float(np.sqrt(np.mean(np.square(error[:, index])))),
                }
                for index, name in enumerate(names)
            },
        },
        "images": {
            "baseline_psnr": float(np.mean(np.concatenate(baseline_psnr))),
            "baseline_ssim": float(np.mean(np.concatenate(baseline_ssim))),
            "restored_psnr": float(np.mean(np.concatenate(restored_psnr))),
            "restored_ssim": float(np.mean(np.concatenate(restored_ssim))),
        },
    }
    output = PROJECT_ROOT / "artifacts" / "evaluation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as file:
        json.dump(metrics, file, ensure_ascii=False, indent=2)
    return metrics


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="artifacts/keras/image_enhancement.keras")
    parser.add_argument("--training-config", default="config/training.json")
    parser.add_argument("--model-config", default="config/model.json")
    parser.add_argument("--synthesis-config", default="config/synthesis.json")
    args = parser.parse_args()
    logger = configure_logging()
    try:
        meta = load_meta()
        check_raw_dataset(meta)
        check_prepared_dataset(meta)
        metrics = evaluate(args.model, args.training_config, args.model_config, args.synthesis_config)
        logger.info("Оценка завершена: %s", metrics)
    except Exception as error:
        logger.error("%s", error)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
