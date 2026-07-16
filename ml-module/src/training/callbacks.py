from pathlib import Path
import tensorflow as tf


def build_callbacks(checkpoint_dir, log_dir, config):
    checkpoint_dir = Path(checkpoint_dir)
    log_dir = Path(log_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)
    return [
        tf.keras.callbacks.ModelCheckpoint(checkpoint_dir / "best.keras", monitor="val_loss", save_best_only=True),
        tf.keras.callbacks.ModelCheckpoint(checkpoint_dir / "last.keras", save_best_only=False),
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss",
            patience=int(config["early_stopping_patience"]),
            restore_best_weights=True,
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss",
            patience=int(config["reduce_lr_patience"]),
            factor=float(config["reduce_lr_factor"]),
            min_lr=float(config["min_learning_rate"]),
        ),
        tf.keras.callbacks.TensorBoard(log_dir=log_dir / "tensorboard"),
        tf.keras.callbacks.CSVLogger(log_dir / "history.csv"),
        tf.keras.callbacks.TerminateOnNaN(),
    ]
