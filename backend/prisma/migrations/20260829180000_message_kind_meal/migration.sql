-- A client's own "Breakfast logged" line is its own kind, beside RATING and DOC.
-- Additive: no existing row changes, and nothing is dropped.
ALTER TYPE "MessageKind" ADD VALUE 'MEAL';
