# План работ (Roadmap)

**Проект:** SiteChat — self-hosted RAG-чатбот (FastAPI + MongoDB + LangChain/FAISS, vanilla JS).
**Дата составления:** 2026-11-08
**Основано на:** анализе состояния кодовой базы (см. раздел «Текущее состояние»).

---

## 1. Текущее состояние (краткая сводка)

| Аспект | Статус |
|---|---|
| Бэкенд (`backend/app/`) | Целостный: API аутентификации, сайтов, документов, чата, веб-виджета; MongoDB (Motor), JWT, загрузка/индексация документов через LangChain + FAISS |
| Фронтенд (`frontend/`) | Рабочий дашборд + встраиваемый виджет на vanilla JS; **техдолг: `app.js` ~8.6k строк — монолит** |
| Тесты | ~440+ тестов (`pytest`, `tests/`); **в текущем окружении зависимости не установлены — прогон невозможен** |
| CI / CD | **Отсутствует** (нет `.github/workflows`, нет сборки/деплоя) |
| Контейнеризация | **Отсутствует** (нет Dockerfile / docker-compose) |
| Git-гигиена | В репозиторий закоммичены бинарные артефакты; рабочее дерево чистое |
| Код | Замеченных TODO/FIXME нет; README актуален |

---

## 2. Приоритет СРОЧНО (этап 0–1 неделя)

### 2.1 Развернуть окружение и прогнать тесты ✅ верификация базы
- [x] Создать venv, `pip install -r requirements.txt` (зависимости установлены в системный interpreter; `requirements-dev.txt` пока нет)
- [x] Запустить `pytest` локально (с мок-БД / фикстурами) — **481 passed, 13 skipped, 0 failed** (запуск: `python -m pytest tests -p no:libtmux`)
- [x] Зафиксировать падающие тесты — исправлены по факту: атомарность `first_response_at`, валидация паролей (`app/core/security.py`), подключение `MongoDBProvider.connect()` (патч `motor.motor_asyncio.AsyncIOMotorClient`), миграция `ChatOllama` → пакет `langchain-ollama`

### 2.2 Чистка git
- [x] Выявить бинарные артефакты в истории (`git ls-files`): найдены `backend/data/chroma_db/faiss_index/index.faiss`, `index.pkl`
- [x] Дополнить `.gitignore` (`backend/data/`, `*.faiss`, `*.pkl`; остальное — `__pycache__/`, `.venv/`, `node_modules/` — уже было) и удалить артефакты из HEAD (`git rm --cached`)
- [x] Оценить необходимость Git LFS для остающихся медиафайлов (`docs/images/*`) — **LFS не требуется**: 6 файлов, суммарно 1.6 МБ, ни один не превышает 1 МБ

### 2.3 Настроить CI (GitHub Actions)
- [x] Workflow `.github/workflows/backend-tests.yml`: `pip install -r requirements-dev.txt` → `pytest --cov=app` (+ junit-отчёт, артефакт покрытия). Локально верифицировано: **481 passed, 13 skipped, покрытие app/ — 54%**
- [x] Workflow `.github/workflows/lint.yml`: `ruff check` (жёсткий гейт E9,F63,F7,F82; конфиг в `backend/pyproject.toml`) + `black --check` (advisory, continue-on-error до форматирования легаси)
- [x] Создан `backend/requirements-dev.txt` (ruff, black, pytest-cov)
- [x] Исправлена реальная ошибка, найденная ruff-гейтом: несуществующий тип `"MemoryCacheProvider"` в аннотации `_cache` (`app/core/dependencies.py`) → `BaseCacheProvider`
- [ ] Требовать зелёный CI для merge в основную ветку (branch protection — настройка на GitHub, недоступна из репозитория)

---

## 3. Короткосрочно (2–4 недели)

### 3.1 Контейнеризация и простой запуск
- [x] `.env.example` с полным списком конфигурации (секреты не коммитить) — очищен от реальных кредов, добавлены блоки LLM/embeddings/vector-store/PostgreSQL/S3/Redis; ⚠️ **пароль MongoDB Atlas, ранее присутствовавший в истории git (`backend/.env.example`, коммиты c58ef22…5c3e605), требует ротации вручную**
- [x] `Dockerfile` для бэкенда (`backend/Dockerfile`: multi-stage python:3.12-slim, non-root user, HEALTHCHECK, тома `/app/data`, `/app/logs`)
- [x] `docker-compose.yml`: `api` (FastAPI/uvicorn, порт 8000) + `mongo:7` (+ тома данных, healthcheck, `MONGODB_URL=mongodb://mongo:27017`, Ollama через host.docker.internal)
- [x] Инструкции быстрого старта в README (`docker compose up -d --build`)
- Примечание: сборка образа локально не проверялась (в песочнице нет Docker); YAML валиден, пути контекста/файлов верифицированы

### 3.2 Качество кода
- [x] Линтеры/форматтеры в pre-commit: `.pre-commit-config.yaml` (ruff --fix, black --check, детектор секретов/приватных ключей); `black` прогнан по всему backend (65 файлов отформатировано), CI lint-джоб теперь зелёный — **484 passed, 13 skipped**
- [ ] Мипинг/проверка типов критичных модулей (`pydantic`-схемы уже есть; опционально `mypy`)
- [x] Dependabot настроен (`.github/dependabot.yml`: pip /backend + github-actions, weekly). `pip-audit` как локальный скрипт — опционально

### 3.3 Безопасность
- [ ] Ротация секретов, попавших в историю git: пароль MongoDB Atlas в `backend/.env.example` (выполнить в Atlas → Database Access), затем проверить JWT_SECRET/ADMIN_PASSWORD в боевом `.env` — ⚠️ только вручную
- [ ] Ротация/проверка секретов: JWT-ключ, ключи шифрования API-токенов OpenAI — ⚠️ только вручную
- [ ] Настроить GitHub Secret Scanning push protection (на уровне организации/репозитория) — ⚠️ настройка на GitHub
- [x] Rate limiting на публичные эндпоинты виджета: чат POST /api/chat и /api/chat/stream (20/мин, slowapi), POST /api/leads (5/мин), GET /api/leads/check (30/мин, добавлено), POST /widget/{site}/triggers/event (60/мин, добавлено); плюс Origin-whitelist (`app/core/widget_security.py`) на чате и лидах
- [x] Проверка CORS-настроек по сайтам: глобальный CORS берётся из `settings.cors_origins_list`; для публичных widget-эндпоинтов добавлена пер-сайтовая проверка Origin/Referer по `allowed_domains` сайта (enforce_site_origin)

---

## 4. Среднесрочно (1–3 месяца)

### 4.1 Модулизация фронтенда (главный техдолг)
- [x] Первый шаг (безрисковый): разбит `frontend/js/app.js` (8593 строки) на 14 файлов-областей в `frontend/js/modules/` (core, analytics, customization, conversations, quick_prompts, triggers, handoffs, security, whitelabel, settings, team, crawling, leads, qa_training); добавлен генератор `frontend/build-dashboard.js` (`npm run build:dashboard`) — собирает обратно единый классический скрипт `app.js`, байт-в-байт эквивалентный оригиналу (проверено diff с git HEAD; `node --check` OK; jest 57 passed). Источником истины теперь являются модули, `app.js` — генерируемый артефакт.
- [ ] Дальнейшая декомпозиция: из core.js выделить auth/sites/documents/ui (следующий инкремент), затем переход к нативным ES-модулям (`<script type="module">`) с удалением конкатенатора и window-глобалов
- [ ] Сборка через esbuild/Vite без потери «vanilla» - простоты деплоя (статические файлы)
- [ ] Виджет (`widget/`) — отдельный минифицированный бандл + автоматизация сборки в CI
- [ ] Смоук-тесты фронтенда (Playwright) хотя бы для ключевых сценариев: логин → загрузка документа → вопрос в чате

### 4.2 Наблюдаемость и эксплуатация
- [ ] Структурированное логирование (JSON) + correlation id для запросов чата
- [ ] `/healthz` + метрики (`prometheus-fastapi-instrumentator`)
- [ ] Документ по развёртыванию в проде (systemd или контейнер + reverse proxy)

---

## 5. Долгосрочно (3–6 месяцев, план развития продукта)

- [ ] **Pluggable storage providers**: PostgreSQL (pgvector) как альтернатива MongoDB/FAISS
- [ ] **S3-совместимое хранилище** исходников документов вместо локальной ФС
- [ ] **Redis** для очередей индексации и кеша ответов
- [ ] Фоновые задачи индексации со progress-статусом (уже частично есть — вынести в очередь)
- [ ] Мультиязычность дашборда (RU/EN переключатель уже присутствует — завершить покрытие строк)
- [ ] Публичная документация API (OpenAPI уже генерируется FastAPI — опубликовать ссылку в README)

---

## 6. Принципы ведения плана

- Каждая задача этапа 2 — отдельный issue/PR с ссылкой на этот файл.
- Статус отмечается чекбоксами `[x]` прямо в `ROADMAP.md` (обновляется при merge PR).
- Пересмотр приоритетов — раз в месяц.
