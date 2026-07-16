import json
import tensorflow as tf
from src.data.augmentation import augment, center_crop
from src.preprocessing.synthetic_generator import degrade_tf, training_example
from src.utils.config import resolve_path


def load_split(path):
    with resolve_path(path).open("r", encoding="utf-8") as file:
        return json.load(file)["items"]


def decode_image(path, processed_size):
    image = tf.io.decode_jpeg(tf.io.read_file(path), channels=3)
    image = tf.image.convert_image_dtype(image, tf.float32)
    return tf.ensure_shape(image, [processed_size, processed_size, 3])


def build_dataset(split, meta, training_config, model_config, synthesis, include_clean=False):
    items = load_split(f'{meta["paths"]["pairs"]}/{split}.json')
    paths = [str(resolve_path(item["clean"])) for item in items]
    input_size = int(model_config["input_size"])
    processed_size = int(meta["processing"]["size"])
    batch_size = int(training_config["batch_size"])
    if split == "train":
        dataset = tf.data.Dataset.from_tensor_slices(paths)
        dataset = dataset.map(
            lambda path: decode_image(path, processed_size),
            num_parallel_calls=tf.data.AUTOTUNE,
        )
        if training_config.get("cache_dataset", True):
            dataset = dataset.cache()
        dataset = dataset.shuffle(
            min(len(items), int(training_config["shuffle_buffer"])),
            reshuffle_each_iteration=True,
        )
        variants = int(synthesis["train_variants_per_epoch"])
        dataset = dataset.repeat(variants)
        dataset = dataset.map(
            lambda clean: training_example(augment(clean, input_size), synthesis),
            num_parallel_calls=tf.data.AUTOTUNE,
        )
        count = len(items) * variants
    else:
        names = meta["labels"]["parameters"]
        labels = [[item["labels"][name] for name in names] for item in items]
        dataset = tf.data.Dataset.from_tensor_slices((paths, labels))

        def transform(path, label):
            clean = center_crop(decode_image(path, processed_size), input_size)
            label = tf.cast(label, tf.float32)
            degraded = degrade_tf(clean, label, synthesis)
            return (degraded, label, clean) if include_clean else (degraded, label)

        dataset = dataset.map(transform, num_parallel_calls=tf.data.AUTOTUNE)
        if training_config.get("cache_dataset", True):
            dataset = dataset.cache()
        count = len(items)
    dataset = dataset.batch(batch_size, drop_remainder=False)
    options = tf.data.Options()
    options.deterministic = bool(training_config.get("deterministic", False) or split != "train")
    dataset = dataset.with_options(options)
    return dataset.prefetch(tf.data.AUTOTUNE), count
