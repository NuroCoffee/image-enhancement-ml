import argparse
from src.model.export import export_tensorflowjs
from src.utils.logger import configure_logging


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--saved-model")
    parser.add_argument("--output")
    parser.add_argument("--no-float16", action="store_true")
    args = parser.parse_args()
    logger = configure_logging()
    try:
        result = export_tensorflowjs(args.saved_model, args.output, not args.no_float16)
        logger.info("Экспорт завершён: %s", result)
    except Exception as error:
        logger.error("%s", error)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
