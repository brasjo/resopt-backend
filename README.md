# Django Backend
This is the backend of the project, built using Django. It serves as the API for the frontend and handles all the business logic and database interactions.

## Run

Install the required packages:
```bash
pip install -r requirements.txt
```

Migrate the database:
```bash
python manage.py migrate
```

Create adminuser and guest users
```bash
python manage.py create_admin
```

Run the Django server:
```bash
python manage.py runserver
```

# System Overview

```mermaid
flowchart TB
    A["User input: files
      -------------------
      Flights (CSV, JSON)
      Aircrafts (CSV, JSON)
      Maintenances (CSV, JSON)
      Optional:
      Metadata (JSON)
      Parameters (JSON)
      Rules (via the Rules interface,
      or a combined Input file (JSON))"] -->
    AB["Parsing
      ------------------
      The system guesses the data format (CSV or JSON) per file and parses it
      into internal data structures. Structural checks happen immediately as
      each item is parsed: activity start must be before end; if a scheduling
      period is given, its start must be before its end."]
    AB --> B["Individual validation"]
    B --- BA["Presence
             ------------------------
             At least one flight and one aircraft must be provided."]
    B --- BC["IDs
             ------------------------
             No duplicate IDs among flights, aircraft, or maintenances.
             Every rule has an ID, and no two rules share one."]
    B --- BD["Rule conditions
             ------------------------
             Each rule's conditions must reference properties whose type
             matches the comparison value given."]

    BA --> E["Relational validation"]
    BC --> E
    BD --> E

    E --- EA["Cross-check
             ----------------
             All maintenances must reference an existing aircraft ID.
             Flights can be pre-assigned to aircraft by referencing an existing aircraft ID."]
    E --- EB["Custom field consistency
             ----------------
             Custom field values used in a rule's numeric/date comparisons
             must be the same type across every item that has them."]

    EA --> F["User input - Parameters
             ---------------------------------
             The user can either choose a set of predefined parameters, or customize them here."]
    EB --> F
    F --> G["Optimization pre-process"]
    G --- GA["Set period_start and period_end
             ----------------------
             Priority order:
             1. Explicit override, if one was given for this run
             2. period_start/period_end already set in the input (e.g. metadata)
             3. Otherwise: derived from the earliest flight start and
             latest flight end"]
    G --- GB["Set min turn time for aircraft
             -------------------------
             Priority order:
             1. min_turn_time field is set on the aircraft from any of the input files
             2. custom min turn time from parameters (matched against aircraft type field)
             3. default min turn time from parameters"]
    G --- GC["Set last_known_station and available_from
             -------------------------
             Set together, as a pair - not independently:
             1. Both fields already set on the aircraft from the input files
             2. Otherwise: both derived together from the aircraft's last
             flight before period_start (requires flights to be pre-assigned
             to aircraft)"]
    GA --> H["Input file for optimization validation
             ---------------------------
             One last validation of the final input to be sent to the optimizer"]
    GB --> H
    GC --> H
    H --> I["Send to optimizer"]
    I --> J["Receive results from optimizer"]

```

## Create opt run
1. Copy opt run - create a new opt run with the current input file. Possible to update it, or params

## Schemas

File tree:
```
opt/
├── schemas/
│   ├── loader.py                  # Loader logic for version dispatching
│   │
│   ├── components/
│   │   ├── activities/
│   │   │   ├── __init__.py
│   │   │   ├── v1.py              # Activities V1 schemas
│   │   │   ├── v2.py              # Activities V2 schemas
│   │   │   └── tests/
│   │   │       ├── __init__.py
│   │   │       ├── test_v1.py
│   │   │       └── test_v2.py
│   │   │
│   │   ├── resources/
│   │   │   ├── __init__.py
│   │   │   ├── v1.py              # Resources V1 schemas
│   │   │   └── tests/
│   │   │       ├── __init__.py
│   │   │       └── test_v1.py
│   │
│   └── optinput/
│       ├── __init__.py
│       ├── v1.py                  # OptInputV1 + InputBuilderV1 (includes constraints)
│       ├── v2.py                  # OptInputV2 + InputBuilderV2 (includes constraints)
│       ├── v3.py                  # OptInputV3 + InputBuilderV3 (includes constraints)
│       └── tests/
│           ├── __init__.py
│           ├── test_v1.py
│           ├── test_v2.py
│           └── test_v3.py
```