import tensorflow as tf


def augment(image, input_size):
    image = tf.image.random_flip_left_right(image)
    return tf.image.random_crop(image, [input_size, input_size, 3])


def center_crop(image, input_size):
    return tf.image.resize_with_crop_or_pad(image, input_size, input_size)
