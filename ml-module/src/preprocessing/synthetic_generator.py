import numpy as np
import tensorflow as tf

WEIGHTS = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)


def factors_numpy(parameters, config):
    scales = np.array([
        config["brightness_scale"],
        config["contrast_scale"],
        config["saturation_scale"],
    ], dtype=np.float32)
    return np.exp2(scales * np.asarray(parameters, dtype=np.float32))


def apply_correction_numpy(image, parameters, config, clip=True):
    brightness, contrast, saturation = factors_numpy(parameters, config)
    result = np.asarray(image, dtype=np.float32) * brightness
    result = (result - 0.5) * contrast + 0.5
    gray = np.sum(result * WEIGHTS, axis=-1, keepdims=True)
    result = gray + saturation * (result - gray)
    return np.clip(result, 0.0, 1.0) if clip else result


def degrade_numpy(image, parameters, config, clip=True):
    brightness, contrast, saturation = factors_numpy(parameters, config)
    result = np.asarray(image, dtype=np.float32)
    gray = np.sum(result * WEIGHTS, axis=-1, keepdims=True)
    result = gray + (result - gray) / saturation
    result = (result - 0.5) / contrast + 0.5
    result = result / brightness
    return np.clip(result, 0.0, 1.0) if clip else result


def sample_parameters_numpy(image, seed, config):
    rng = np.random.default_rng(int(seed))
    parameters = rng.uniform(
        float(config["parameter_min"]),
        float(config["parameter_max"]),
        size=3,
    ).astype(np.float32)
    threshold = float(config["clipping_threshold"])
    reduction = float(config["clipping_reduction"])
    for _ in range(int(config["max_attempts"])):
        degraded = degrade_numpy(image, parameters, config, clip=False)
        clipped = np.mean((degraded < 0.0) | (degraded > 1.0))
        if clipped <= threshold:
            break
        parameters *= reduction
    return parameters


def _tf_factors(parameters, config):
    scales = tf.constant([
        config["brightness_scale"],
        config["contrast_scale"],
        config["saturation_scale"],
    ], dtype=tf.float32)
    return tf.pow(2.0, tf.cast(parameters, tf.float32) * scales)


def _broadcast(values, image):
    if image.shape.rank == 4:
        return values[:, None, None, None]
    return values


def apply_correction_tf(image, parameters, config, clip=True):
    factors = _tf_factors(parameters, config)
    brightness = _broadcast(factors[..., 0], image)
    contrast = _broadcast(factors[..., 1], image)
    saturation = _broadcast(factors[..., 2], image)
    result = tf.cast(image, tf.float32) * brightness
    result = (result - 0.5) * contrast + 0.5
    weights = tf.constant(WEIGHTS, dtype=tf.float32)
    gray = tf.reduce_sum(result * weights, axis=-1, keepdims=True)
    result = gray + saturation * (result - gray)
    return tf.clip_by_value(result, 0.0, 1.0) if clip else result


def degrade_tf(image, parameters, config, clip=True):
    factors = _tf_factors(parameters, config)
    brightness = _broadcast(factors[..., 0], image)
    contrast = _broadcast(factors[..., 1], image)
    saturation = _broadcast(factors[..., 2], image)
    result = tf.cast(image, tf.float32)
    weights = tf.constant(WEIGHTS, dtype=tf.float32)
    gray = tf.reduce_sum(result * weights, axis=-1, keepdims=True)
    result = gray + (result - gray) / saturation
    result = (result - 0.5) / contrast + 0.5
    result = result / brightness
    return tf.clip_by_value(result, 0.0, 1.0) if clip else result


def training_example(clean, config):
    parameters = tf.random.uniform(
        [3],
        float(config["parameter_min"]),
        float(config["parameter_max"]),
        dtype=tf.float32,
    )
    threshold = tf.cast(config["clipping_threshold"], tf.float32)
    reduction = tf.cast(config["clipping_reduction"], tf.float32)
    for _ in range(int(config["max_attempts"])):
        degraded = degrade_tf(clean, parameters, config, clip=False)
        clipped = tf.reduce_mean(tf.cast((degraded < 0.0) | (degraded > 1.0), tf.float32))
        parameters = tf.where(clipped > threshold, parameters * reduction, parameters)
    return degrade_tf(clean, parameters, config), parameters
