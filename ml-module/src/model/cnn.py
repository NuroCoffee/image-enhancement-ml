import tensorflow as tf


def convolution_block(inputs, filters, stride):
    x = tf.keras.layers.Conv2D(filters, 3, strides=stride, padding="same", use_bias=False)(inputs)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.Activation("swish")(x)
    x = tf.keras.layers.Conv2D(filters, 3, padding="same", use_bias=False)(x)
    x = tf.keras.layers.BatchNormalization()(x)
    return tf.keras.layers.Activation("swish")(x)


def build_model(config):
    input_size = int(config["input_size"])
    inputs = tf.keras.Input((input_size, input_size, 3), name="image")
    x = inputs
    for index, filters in enumerate(config["filters"]):
        x = convolution_block(x, int(filters), 2 if index else 1)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dense(int(config["dense_units"]), activation="swish")(x)
    x = tf.keras.layers.Dropout(float(config["dropout"]))(x)
    outputs = tf.keras.layers.Dense(
        int(config["outputs"]),
        activation="tanh",
        dtype="float32",
        name="adjustments",
    )(x)
    return tf.keras.Model(inputs, outputs, name="synthetic_adjustment_cnn")
