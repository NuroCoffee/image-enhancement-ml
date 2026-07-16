import tensorflow as tf


def configure_runtime(mixed_precision=True):
    gpus = tf.config.list_physical_devices("GPU")
    for gpu in gpus:
        try:
            tf.config.experimental.set_memory_growth(gpu, True)
        except RuntimeError:
            pass
    policy = "mixed_float16" if mixed_precision and gpus else "float32"
    tf.keras.mixed_precision.set_global_policy(policy)
    return gpus
