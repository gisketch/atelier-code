# Architecture

## Current Shape

- Kind: existing project
- Stack: unknown

## Default Layer Direction

Use this direction until the project chooses stronger boundaries:

```text
types -> config -> data -> service -> runtime -> interface
```

Cross-cutting concerns should enter through explicit provider interfaces.

## Application Skeleton

- [src](../../src): application or mod source placeholder.
- [tests](../../tests): tests and fixtures placeholder.
- [config](../../config): local config examples placeholder.

## Boundary Rule

If a dependency direction matters, document it here, then enforce it with checks when possible.