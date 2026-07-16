import argparse
from src.preprocessing.prepare_dataset import prepare_dataset
from src.utils.logger import configure_logging


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int)
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--synthesis-config", default="config/synthesis.json")
    args = parser.parse_args()
    logger = configure_logging()
    try:
        result = prepare_dataset(args.force, args.workers, args.check_only, args.synthesis_config)
        logger.info("Подготовка завершена: %s", result)
    except Exception as error:
        logger.error("%s", error)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
