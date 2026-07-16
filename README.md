# image-enhancement-ml
Улучшение изображения с помощью локальной CNN по 3-ём параметрам: яркость, контрастность и цветность.

## ML часть
Модель обучена на датасете [BSDS500](https://github.com/BIDS/BSDS500) путём искусственного порчи изображений. Данный датасет был выбран по причине его малого размера. В идеале надо использовать датасет [MIT-Adobe-FiveK](https://data.csail.mit.edu/graphics/fivek/), потому что там значительно больше данных и присутствуют метки нужных нам параметров в fivek.lrcat, НО его большой размер стал в совокупности с моими техническими возможностями стали основной причиной выбрать 1-ый вариант.
Тренировал модель, используя TensorFlow.

Запуск обучения ML модели:

```powershell
# в директории ml-module
docker compose build
docker compose run --rm ml python -c "import tensorflow as tf; print(tf.config.list_physical_devices('GPU'))"
docker compose run --rm ml python -m src.preprocess --check-only
docker compose run --rm ml python -m src.preprocess
docker compose run --rm ml python -m src.train
docker compose run --rm ml python -m src.evaluate
docker compose run --rm ml sh -lc "pip install -r requirements-export.txt && sed -i '/^import tensorflow_decision_forests$/d' /usr/local/lib/python3.10/dist-packages/tensorflowjs/converters/tf_saved_model_conversion_v2.py && rm -rf artifacts/tensorflowjs/* && python -m src.export"
```

## Web часть
В рамках учебного проекта в качестве хостинга идеально подойдёт Github Pages.
Интеграция ML модели через TensorFlow.js.

Запуск веб-части локально:

```powershell
# в директории web-module
npm install
npm run model:check
npm run dev
```