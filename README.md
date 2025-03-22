# backsiphon

A cross connection control register for a drinking water purveyor.

It keeps the hazard survey of every service connection, works out what backflow
protection each one has to carry, holds the annual test reports filed against
those assemblies, and runs the notice clock when a test does not arrive.

Command line only. The store is a single SQLite file.

## Running it

```
npm install
npm run build
npx backsiphon --store district.sqlite demo
npx backsiphon --store district.sqlite standing
```

Every command answers as at today unless it is given `--as-of`, and every one
of them will write json instead of columns if it is given `--json`.

## The handbook

`docs/handbook.md` is written out of the program's own tables by
`npm run handbook`. It is not edited by hand and ci refuses a change that
leaves it out of date.

## The rules, in the order they are applied

1. the survey says how bad the premise is, at the meter and inside it
2. that says what class of assembly the connection has to carry
3. a variance can rewrite that class, and nothing else about it
4. what is fitted is compared against the class, capability by capability
5. the class fitted decides which field procedure a test has to follow
6. the tester and the gauge decide whether the office can accept the report
7. the last passing accepted test decides when the next one is due
8. the hazard degree decides how fast the letters climb
