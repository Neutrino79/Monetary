# Duevia 0.5.0

A personal expense tracker built on a double-entry ledger. The project provides:

- A FastAPI REST API
- A command-line interface (CLI)
- SQLite storage
- Single-owner authentication with bcrypt password hashing
- Expense, income, refund, transfer, split, settlement, budget, and reporting features

## Requirements

- Python 3.10 or newer
- `pip`

## Installation

### 1. Clone the project and open its directory

```bash
git clone <repository-url>
cd <repository-directory>
```

If the project is already on your computer, only run `cd` with the path to the
project directory:

```bash
cd /path/to/<repository-directory>
```

### 2. Create a virtual environment

macOS/Linux:

```bash
python3 -m venv .venv
```

Windows PowerShell:

```powershell
py -m venv .venv
```

### 3. Activate the virtual environment

macOS/Linux:

```bash
source .venv/bin/activate
```

Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

After activation, your terminal prompt should show `(.venv)`.

### 4. Install dependencies

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Start the application

The application is a FastAPI server. From the project root, with the virtual
environment activated, run:

```bash
export PYTHONPATH="$PWD"
python -m uvicorn duevia.presentation.api.app:app --reload --port 8000
```

On Windows PowerShell, set `PYTHONPATH` with:

```powershell
$env:PYTHONPATH = (Get-Location).Path
python -m uvicorn duevia.presentation.api.app:app --reload --port 8000
```

The server is now available at:

- Application: <http://localhost:8000>
- Health check: <http://localhost:8000/health>
- Swagger UI: <http://localhost:8000/docs>
- OpenAPI schema: <http://localhost:8000/openapi.json>

The SQLite database is created automatically at:

```text
~/.duevia_0.5/expense.db
```

To use another database file, set `DUEVIA_DB_PATH` before starting the
server:

```bash
export DUEVIA_DB_PATH="$PWD/data/expense.db"
python -m uvicorn duevia.presentation.api.app:app --reload --port 8000
```

Create the `data` directory first if it does not exist:

```bash
mkdir -p data
```

## Create the first owner

The first setup request creates the owner account and returns an access token.
You can make this request with `curl`:

```bash
curl -X POST http://localhost:8000/api/v0.5/setup/init \
  -H "Content-Type: application/json" \
  -d '{
    "name": "You",
    "email": "you@example.com",
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "password": "at least 8 characters",
    "security_question_id": 1,
    "security_answer": "Whiskers"
  }'
```

Alternatively, open <http://localhost:8000/docs>, call
`POST /api/v0.5/setup/init`, and use the Swagger UI to explore the API.

## Run the CLI

The CLI uses the same application and database layers as the API. Keep the API
server stopped, or use a separate terminal with the same virtual environment:

```bash
export PYTHONPATH="$PWD"
python -m duevia --help
```

Windows PowerShell:

```powershell
$env:PYTHONPATH = (Get-Location).Path
python -m duevia --help
```

Initialize the CLI database and owner:

```bash
python -m duevia init \
  --name "You" \
  --email you@example.com \
  --timezone Asia/Kolkata \
  --currency INR \
  --password "at least 8 characters" \
  --security-question 1 \
  --security-answer "Whiskers"
```

Example CLI commands:

```bash
python -m duevia account add --name "Bank" --type ASSET --currency INR
python -m duevia category add --name "Food" --type EXPENSE --budget 5000.00
python -m duevia friend add --name "Rahul" --email rahul@example.com
python -m duevia report dashboard
```

For the complete CLI command reference, see
[`docs/CLI_COMMANDS.md`](docs/CLI_COMMANDS.md). For the full API endpoint list
and authentication details, see [`docs/API_README.md`](docs/API_README.md). For
the system design, see
[`docs/ARCHITECTURE_PLAN.md`](docs/ARCHITECTURE_PLAN.md).

## Stop the application

Press `Ctrl+C` in the terminal running Uvicorn.

To leave the virtual environment:

```bash
deactivate
```
