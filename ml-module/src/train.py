import argparse
from src.preprocessing.check_dataset import check_prepared_dataset, check_raw_dataset
from src.training.trainer import train
from src.utils.config import load_meta
from src.utils.logger import configure_logging


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--training-config", default="config/training.json")
    parser.add_argument("--model-config", default="config/model.json")
    parser.add_argument("--synthesis-config", default="config/synthesis.json")
    parser.add_argument("--resume")
    args = parser.parse_args()
    logger = configure_logging()
    try:
        meta = load_meta()
        check_raw_dataset(meta)
        check_prepared_dataset(meta)
        result = train(args.training_config, args.model_config, args.synthesis_config, args.resume)
        logger.info("Обучение завершено: %s", result)
    except Exception as error:
        logger.error("%s", error)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
