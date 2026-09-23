# Data Model

Phase 1 defines the backend persistence shape only. Screens, authorization flows, stock mutations, and request workflows are intentionally out of scope.

## Relationships

- `Store` is the tenant boundary for operational data.
- `UserAccount` is a login identity. It is global so the same person can belong to more than one store later.
- `StoreEmployee` links a `UserAccount` to a `Store` and stores the store-scoped role. Managers are `StoreEmployee` records with `role = "manager"`.
- `Station` belongs to one `Store`.
- `InventoryItem` is the shared item catalog. It is not owned by a store.
- `StoreStock` links a `Store` to an `InventoryItem` and stores per-store quantity, par, reorder, and stock status.
- `InventoryRequest` belongs to one `Store`, is created by a store employee, and can optionally target a station.
- `InventoryRequestLineItem` belongs to an inventory request, repeats `storeId` for store-scoped querying, and references the requested inventory item.
- `Recipe` is a shared catalog record. Each ingredient references an `InventoryItem`.
- `Product` is a shared catalog record and can optionally reference a `Recipe`.

## Assumptions

- Stores share the same inventory item catalog, but each store has its own `StoreStock` row for the items it carries.
- Products and recipes are global in Phase 1. Future store-specific pricing, availability, or recipe overrides can be modeled as separate store mapping documents without changing the core catalog.
- Inventory request line items include `storeId` as a denormalized field for indexes and authorization checks. Application services should keep it equal to the parent request store.
- Mongoose `unique` constraints are backed by MongoDB indexes. They are not in-memory validators until indexes are created in the database.
