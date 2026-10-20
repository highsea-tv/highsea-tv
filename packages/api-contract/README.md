# @highsea/api-contract

The public API's contract ([ADR 0006](../../docs/adr/0006-public-api-openapi-sdk.md)): every route's method, path, inputs and responses as zod schemas with OpenAPI metadata, grouped in `routes`. The server implements them, the SDK calls them, and the OpenAPI document is generated from them. The prototype's draft types (`design/prototypes/src/mock/types.ts`) move here a route group at a time.
