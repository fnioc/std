# Design docs

Reference and design documents carried over from the pre-consolidation repos
(`fnioc/ioc` → the **di** family, `fnioc/config` → the **config** family).

## di
- [PRD.md](di/PRD.md) — product requirements (historical, pre-consolidation)
- [PLAN.md](di/PLAN.md) — implementation plan (historical, pre-consolidation)

## config
- [no-options-port.md](config/no-options-port.md) — the decision **not** to port Microsoft.Extensions.Options (MEO), and how config + the DI scope model already cover its use cases (live reload is the one remaining piece → #6)
- [TODO.md](config/TODO.md) — parked config follow-ups
