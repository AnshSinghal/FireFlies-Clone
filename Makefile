.DEFAULT_GOAL := help
.PHONY: help dev down logs migrate migrate-down migration seed seed-reset test test-backend \
        test-frontend e2e e2e-crossbrowser verify lint lint-frontend lint-backend lint-e2e typecheck format types \
        seed-demo seed-validate install clean

# ─────────────────────────────────────────────────────────────────────────────
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ── Running ──────────────────────────────────────────────────────────────────
dev: ## Start both apps via Docker Compose
	docker compose up --build

down: ## Stop everything
	docker compose down

logs: ## Tail logs from both services
	docker compose logs -f

# ── Data ─────────────────────────────────────────────────────────────────────
migrate: ## Apply database migrations
	cd backend && uv run alembic upgrade head

migrate-down: ## Roll back the most recent migration
	cd backend && uv run alembic downgrade -1

migration: ## Autogenerate a migration — make migration m="add x"
	cd backend && uv run alembic revision --autogenerate -m "$(m)"

# Depends on migrate so a fresh clone cannot seed into a database that has no
# tables, which fails with an unhelpful "no such table" rather than a hint.
seed: migrate ## Populate the demo database (idempotent)
	cd backend && uv run python -m app.seed.seed

seed-reset: migrate ## Drop and repopulate the demo database
	cd backend && uv run python -m app.seed.seed --reset

seed-demo: migrate ## Reset, seed, validate and print a summary table
	@cd backend && uv run python -m app.seed.seed --reset
	@cd backend && uv run python -m app.seed.validate
	@echo ""
	@cd backend && uv run python -c "from app.seed.seed import summary_table; print(summary_table())"
	@echo ""

seed-validate: ## Check seeded data satisfies every invariant
	cd backend && uv run python -m app.seed.validate

# ── Codegen ──────────────────────────────────────────────────────────────────
# Generated from the app object, not a running server, so this works from a cold
# clone. A backend field rename becomes a frontend TYPE ERROR rather than a
# runtime undefined — which is the whole point of committing the output.
types: ## Regenerate the TypeScript API client from OpenAPI
	cd backend && uv run python scripts/export_openapi.py > ../docs/openapi.json
	cd frontend && npx --yes openapi-typescript ../docs/openapi.json -o src/types/api.d.ts
	cd frontend && npx --yes prettier --write src/types/api.d.ts

# ── Tests ────────────────────────────────────────────────────────────────────
verify: lint typecheck test e2e ## Everything CI runs, in CI's order — use this before pushing
	@echo "✓ lint · typecheck · unit tests · end-to-end — all green"

test: test-backend test-frontend ## Run both unit test suites

test-backend:
	cd backend && uv run pytest -q

coverage: ## Backend tests with the T-43.12 coverage report (services/ai/parsers)
	cd backend && uv run pytest -q --cov --cov-report=term-missing

test-frontend:
	cd frontend && npm test

e2e: ## Run the Playwright end-to-end suite
	cd e2e && npm test

e2e-crossbrowser: ## Run the @crossbrowser cases in Firefox and WebKit (T-42.12)
	cd e2e && npm run test:crossbrowser

# ── Quality gates ────────────────────────────────────────────────────────────
lint: lint-backend lint-frontend lint-e2e ## Lint everything and check backend layering

lint-backend:
	cd backend && uv run ruff check .
	cd backend && uv run ruff format --check .
	python3 scripts/check_layering.py backend
	python3 scripts/check_design_tokens.py .

lint-frontend:
	cd frontend && npm run lint
	cd frontend && npm run format:check

lint-e2e:
	cd e2e && npm run lint

typecheck: ## Typecheck both apps
	cd backend && uv run mypy app
	cd frontend && npm run typecheck

format: ## Auto-format everything
	cd backend && uv run ruff format .
	cd backend && uv run ruff check --fix .
	cd frontend && npm run format

# ── Setup ────────────────────────────────────────────────────────────────────
install: ## Install dependencies for both apps (no Docker)
	cd backend && uv sync
	cd frontend && npm install

clean: ## Remove build artefacts and caches
	rm -rf frontend/.next frontend/node_modules
	rm -rf backend/.venv backend/.pytest_cache backend/.mypy_cache backend/.ruff_cache
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
