import tensorflow as tf


def brightness_mae(y_true, y_pred):
    return tf.reduce_mean(tf.abs(y_true[:, 0] - y_pred[:, 0]))


def contrast_mae(y_true, y_pred):
    return tf.reduce_mean(tf.abs(y_true[:, 1] - y_pred[:, 1]))


def saturation_mae(y_true, y_pred):
    return tf.reduce_mean(tf.abs(y_true[:, 2] - y_pred[:, 2]))
