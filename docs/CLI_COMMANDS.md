# Duevia CLI Commands

This document describes every command supported by the Duevia CLI.
The CLI uses the same SQLite database and application services as the FastAPI
application.

## Before running commands

From the project root, activate the virtual environment and set
`PYTHONPATH`:

```bash
source .venv/bin/activate
export PYTHONPATH="$PWD"
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
$env:PYTHONPATH = (Get-Location).Path
```

Run the CLI with:

```bash
python -m duevia <command> [options]
```

Show the top-level help:

```bash
python -m duevia --help
```

## Database path

By default, the CLI uses:

```text
~/.duevia_0.5/expense.db
```

To use a different database, place `--db-path` before the subcommand:

```bash
python -m duevia --db-path ./data/expense.db report dashboard
```

Create the directory first when necessary:

```bash
mkdir -p data
```

The CLI connects directly to the database and does not require an API login.
The email, password, and security question created during `init` are used by
the API authentication and password-recovery flows.

## 1. Initialize the owner

Initialization is required before using commands that need an owner profile.
It creates the single application owner and the initial database records.

```bash
python -m duevia init \
  --name "Your Name" \
  --email you@example.com \
  --timezone Asia/Kolkata \
  --currency INR \
  --password "at least 8 characters" \
  --security-question 1 \
  --security-answer "Whiskers"
```

Arguments:

| Option | Required | Description |
|---|---:|---|
| `--name` | Yes | Owner's display name |
| `--email` | Yes | Owner's email address |
| `--timezone` | No | IANA timezone, such as `Asia/Kolkata` or `America/New_York` |
| `--currency` | Yes | Home currency code, such as `INR`, `USD`, or `EUR` |
| `--password` | Yes | Password for API login; minimum length is 8 characters |
| `--security-question` | Yes | Question number from `1` to `5` |
| `--security-answer` | Yes | Answer used for API password recovery |

Security-question numbers:

1. First pet
2. Mother's maiden name
3. First school
4. City born in
5. Childhood nickname

## 2. Owner commands

### Show owner details

```bash
python -m duevia owner show
```

Displays the owner name, email, timezone, home currency, and ledger mode.

### Rename the owner

```bash
python -m duevia owner rename --name "New Name"
```

### Change the timezone

```bash
python -m duevia owner set-timezone --timezone America/New_York
```

Use an IANA timezone name. Dates entered in transaction commands are
interpreted in the configured owner timezone.

### Set the ledger mode

```bash
python -m duevia owner set-ledger-mode --mode DIRECT
python -m duevia owner set-ledger-mode --mode STRICT
```

`DIRECT` is the default:

- Edits and deletes modify existing records in place.
- It is convenient for personal use.
- No reversal history is kept for the changed record.

`STRICT` is audit-oriented:

- Posted entries are never changed or removed directly.
- `edit` creates a reversal and a replacement entry.
- `delete` creates a reversal entry.
- The original history remains available.

Both modes enforce the same validation and double-entry balancing rules.

### Change the password

```bash
python -m duevia owner change-password \
  --current-password "old password" \
  --new-password "new password"
```

This also invalidates existing API sessions.

## 3. Account commands

Accounts represent real financial accounts, such as a bank account, wallet,
cash account, credit card, or loan.

### Add an account

```bash
python -m duevia account add \
  --name "Bank" \
  --type ASSET \
  --currency INR
```

Account types:

- `ASSET`: cash, bank accounts, wallets, and money owned
- `LIABILITY`: credit cards, loans, and money owed

### List active accounts

```bash
python -m duevia account list
```

Include inactive accounts:

```bash
python -m duevia account list --all
```

### Deactivate an account

```bash
python -m duevia account deactivate 1
```

Deactivation preserves existing ledger history while preventing the account
from being used as an active account.

### Show account balances

Show all active account balances:

```bash
python -m duevia account balance
```

Include inactive accounts:

```bash
python -m duevia account balance --all
```

Show one account:

```bash
python -m duevia account balance 1
```

The account ID is shown by `account list`.

## 4. Category commands

Categories classify expenses and income. Categories can optionally have a
monthly budget and a parent category.

### Add an expense category

```bash
python -m duevia category add \
  --name "Food" \
  --type EXPENSE \
  --budget 5000.00 \
  --currency INR
```

### Add an income category

```bash
python -m duevia category add \
  --name "Salary" \
  --type INCOME \
  --currency INR
```

Options:

| Option | Required | Description |
|---|---:|---|
| `--name` | Yes | Category name |
| `--type` | Yes | `EXPENSE` or `INCOME` |
| `--parent` | No | ID of an existing parent category |
| `--budget` | No | Monthly budget amount, normally used for expense categories |
| `--currency` | No | Currency; defaults to the owner's home currency |

Example with a parent category:

```bash
python -m duevia category add \
  --name "Restaurants" \
  --type EXPENSE \
  --parent 1 \
  --budget 2500.00
```

### List categories

```bash
python -m duevia category list
python -m duevia category list --all
```

### Deactivate a category

```bash
python -m duevia category deactivate 1
```

## 5. Friend commands

Friends are represented internally as `DUE` accounts. A positive friend
balance means the friend owes you; a negative balance means you owe the
friend.

### Add a friend

```bash
python -m duevia friend add \
  --name "Rahul" \
  --email rahul@example.com \
  --currency INR
```

`--currency` is optional and defaults to the owner's home currency.

### List friends

```bash
python -m duevia friend list
```

### Rename a friend

```bash
python -m duevia friend rename 1 --name "Rahul Sharma"
```

### Delete a friend

```bash
python -m duevia friend delete 1
```

The friend ID is shown by `friend list`. Existing ledger relationships may
prevent deletion when they would compromise ledger history.

## 6. Transaction commands

Transactions record ordinary expenses, income, refunds, and manual
adjustments. Amounts must be positive decimal values, for example `125.50`.

Dates are optional. When provided, use the local date/time format accepted by
the application, for example:

```text
2026-09-26
2026-09-26T18:30:00
```

### Record an expense

```bash
python -m duevia transaction expense \
  --account 1 \
  --category 1 \
  --amount 500.00 \
  --title "Dinner" \
  --date 2026-09-26 \
  --note "Dinner with family"
```

Required options are `--account`, `--category`, `--amount`, and `--title`.
`--date` and `--note` are optional.

### Record income

```bash
python -m duevia transaction income \
  --account 1 \
  --category 2 \
  --amount 50000.00 \
  --title "September salary" \
  --date 2026-09-01
```

Required options are the same as for an expense.

### Record a refund

Refunds must reference the original transaction:

```bash
python -m duevia transaction refund \
  --for 12 \
  --amount 200.00 \
  --account 1 \
  --category 1 \
  --title "Partial refund"
```

Options:

| Option | Required | Description |
|---|---:|---|
| `--for` | Yes | Original entry ID being refunded |
| `--amount` | Yes | Refund amount; cannot exceed the remaining refundable amount |
| `--account` | No | Account receiving the refund |
| `--category` | No | Refund category |
| `--title` | No | Refund description |
| `--date` | No | Local date/time |
| `--note` | No | Additional memo |

### Record an adjustment

Use an adjustment to correct an account balance when there is no ordinary
expense, income, or transfer to record:

```bash
python -m duevia transaction adjustment \
  --account 1 \
  --amount 25.00 \
  --side DEBIT \
  --title "Balance correction" \
  --note "Bank statement adjustment"
```

`--side` must be `DEBIT` or `CREDIT`.

### Edit a transaction

```bash
python -m duevia transaction edit 12 \
  --amount 550.00 \
  --title "Updated dinner"
```

Any of these optional fields can be changed:

- `--account`
- `--category`
- `--amount`
- `--title`
- `--date`
- `--note`

This command is intended for ordinary transactions such as expenses, income,
refunds, and adjustments supported by the transaction service. Its behavior
depends on the current ledger mode:

- `DIRECT`: changes the entry in place
- `STRICT`: reverses the old entry and creates a replacement

### Delete a transaction

```bash
python -m duevia transaction delete 12
```

In `STRICT` mode, deletion creates a reversal instead of erasing the posted
history.

### Show one transaction

```bash
python -m duevia transaction show 12
```

The output includes the entry type, status, description, category, memo,
refund/reversal relationships, and balanced postings.

### List transactions

List all active transactions:

```bash
python -m duevia transaction list
```

Filter by account or category:

```bash
python -m duevia transaction list --account 1
python -m duevia transaction list --category 1
```

Include reversed entries:

```bash
python -m duevia transaction list --include-reversed
```

Filter by date:

```bash
python -m duevia transaction list \
  --date-from 2026-09-01 \
  --date-to 2026-09-30
```

Filters can be combined:

```bash
python -m duevia transaction list \
  --account 1 \
  --category 1 \
  --date-from 2026-09-01 \
  --date-to 2026-09-30 \
  --include-reversed
```

## 7. Split commands

Splits record expenses shared with friends. The first value in `--shares` is
always the owner's own share. Every later value uses the format
`friend_id:amount`.

For example, `150,1:350` means:

- Owner's share: `150`
- Friend `1`'s share: `350`
- Total expense: `500`

The owner's share may be zero.

### Create a split expense

```bash
python -m duevia split create \
  --account 1 \
  --category 1 \
  --shares "150,1:350" \
  --title "Dinner"
```

Multiple friends:

```bash
python -m duevia split create \
  --account 1 \
  --category 1 \
  --shares "100,1:200,2:300" \
  --title "Group dinner" \
  --date 2026-09-26 \
  --note "Three-way split"
```

The first value must not contain a friend ID. This is correct:

```text
150,1:350
```

This is invalid:

```text
1:150,2:350
```

### Record a friend-fronted expense

Use this when a friend paid the entire expense:

```bash
python -m duevia split fronted \
  --category 1 \
  --friend 1 \
  --amount 50.00 \
  --title "Tea"
```

No owner account is touched because the friend paid the full amount.

### Edit a split or friend-fronted expense

The command automatically detects whether the entry is a `SPLIT` or `FRONTED`
entry.

Edit a split:

```bash
python -m duevia split edit 20 \
  --account 1 \
  --category 1 \
  --shares "200,1:300" \
  --title "Updated dinner"
```

Edit a friend-fronted expense:

```bash
python -m duevia split edit 21 \
  --category 1 \
  --friend 2 \
  --amount 75.00 \
  --title "Updated tea"
```

Common optional fields:

- `--category`
- `--title`
- `--date`
- `--note`

Split-only fields:

- `--account`
- `--shares`

Friend-fronted-only fields:

- `--friend`
- `--amount`

If a participant has settlement history, editing is blocked by default. To
proceed anyway:

```bash
python -m duevia split edit 20 --shares "200,1:300" --force
```

To remove the affected settlement history before editing:

```bash
python -m duevia split edit 20 \
  --shares "200,1:300" \
  --remove-settlements
```

Use `--force` and `--remove-settlements` only when you understand the impact
on friend balances and historical settlement records.

### Delete a split

```bash
python -m duevia split delete 20
```

If settlement history prevents deletion:

```bash
python -m duevia split delete 20 --force
```

Or remove related settlements first:

```bash
python -m duevia split delete 20 --remove-settlements
```

### Show split details

```bash
python -m duevia split show 20
```

The output shows the owner's share and each friend's share.

### List splits

List all split and friend-fronted entries:

```bash
python -m duevia split list
```

Filter by type:

```bash
python -m duevia split list --type SPLIT
python -m duevia split list --type FRONTED
```

## 8. Transfer commands

Transfers move money between the owner's own accounts. They do not represent
income or spending.

### Create a transfer

```bash
python -m duevia transfer create \
  --from 1 \
  --to 2 \
  --amount 1000.00 \
  --description "Move money to wallet"
```

Optional date:

```bash
python -m duevia transfer create \
  --from 1 \
  --to 2 \
  --amount 1000.00 \
  --date 2026-09-26
```

Transfers must use compatible accounts and currencies. A transfer into a
liability account cannot exceed the amount actually owed on that account, and
a transfer from a liability account to an asset account is blocked.

### List transfers

```bash
python -m duevia transfer list
```

### Edit a transfer

```bash
python -m duevia transfer edit 30 \
  --from 1 \
  --to 2 \
  --amount 1200.00 \
  --description "Updated transfer"
```

All edit fields are optional:

- `--from`
- `--to`
- `--amount`
- `--description`
- `--date`

The edit behavior follows the active `DIRECT` or `STRICT` ledger mode.

### Delete a transfer

```bash
python -m duevia transfer delete 30
```

## 9. Settlement commands

Settlements record money exchanged with a friend. The direction is inferred
from the current friend balance:

- If the friend owes you, the settlement records the friend paying you.
- If you owe the friend, the settlement records you paying the friend.

### Create a settlement

```bash
python -m duevia settlement create \
  --friend 1 \
  --account 1 \
  --amount 300.00
```

With a description:

```bash
python -m duevia settlement create \
  --friend 1 \
  --account 1 \
  --amount 300.00 \
  --description "Rahul paid back dinner" \
  --date 2026-09-26 \
  --note "UPI payment"
```

When `--description` is omitted, the application generates a best-effort
description based on the entries covered by the settlement.

### Edit a settlement

```bash
python -m duevia settlement edit 40 \
  --friend 1 \
  --account 1 \
  --amount 250.00 \
  --description "Partial repayment"
```

All edit fields are optional:

- `--friend`
- `--account`
- `--amount`
- `--description`
- `--date`
- `--note`

The settlement direction is recalculated from the current balance during an
edit.

### Delete a settlement

```bash
python -m duevia settlement delete 40
```

### List settlements

List settlements for all friends:

```bash
python -m duevia settlement list
```

Filter by friend:

```bash
python -m duevia settlement list --friend 1
```

## 10. Report commands

Reports are read-only and do not change the ledger.

### Account balances

```bash
python -m duevia report balance
python -m duevia report balance --all
```

### Budget status

Current month:

```bash
python -m duevia report budget
```

Specific month in `YYYY-MM` format:

```bash
python -m duevia report budget --month 2026-09
```

The report shows budget, spending, remaining amount, percentage used, and
whether a category is over budget.

### Friend balances

```bash
python -m duevia report friends
```

Balance meaning:

- Positive: the friend owes you
- Negative: you owe the friend

### Friend statement

```bash
python -m duevia report statement --friend 1
```

The statement shows each entry, its balance change, and the running balance.

### Net worth

```bash
python -m duevia report net-worth
```

Displays total assets, total liabilities, and net worth per currency.

### Spending by category

Current month:

```bash
python -m duevia report spending
```

Specific month:

```bash
python -m duevia report spending --month 2026-09
```

### Income by category

Current month:

```bash
python -m duevia report income
```

Specific month:

```bash
python -m duevia report income --month 2026-09
```

### Dashboard

Current month:

```bash
python -m duevia report dashboard
```

Specific month:

```bash
python -m duevia report dashboard --month 2026-09
```

The dashboard combines:

- Net worth
- Active account balances
- Budget status
- Top spending categories
- Income by category
- Friend balances

## 11. A complete example workflow

The following example creates the owner, creates basic accounts and
categories, records a shared expense, checks the balance, and records a
settlement:

```bash
# Initialize the owner
python -m duevia init \
  --name "You" \
  --email you@example.com \
  --timezone Asia/Kolkata \
  --currency INR \
  --password "at least 8 characters" \
  --security-question 1 \
  --security-answer "Whiskers"

# Add an account, category, and friend
python -m duevia account add \
  --name "Bank" \
  --type ASSET \
  --currency INR

python -m duevia category add \
  --name "Food" \
  --type EXPENSE \
  --budget 5000.00 \
  --currency INR

python -m duevia friend add \
  --name "Rahul" \
  --email rahul@example.com \
  --currency INR

# Owner pays 500; owner share is 150 and Rahul's share is 350
python -m duevia split create \
  --account 1 \
  --category 1 \
  --shares "150,1:350" \
  --title "Dinner"

# Rahul later pays 50 for tea on the owner's behalf
python -m duevia split fronted \
  --category 1 \
  --friend 1 \
  --amount 50.00 \
  --title "Tea"

# Rahul's net balance is 350 - 50 = 300
python -m duevia report friends

# Record Rahul paying back 300
python -m duevia settlement create \
  --friend 1 \
  --account 1 \
  --amount 300.00

# View the complete overview
python -m duevia report dashboard
```
