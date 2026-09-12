## Scenario
The operator submits work and the worker retries until it is acknowledged.

## Steps
1. operator -> worker: submit a parcel
2. worker -> queue x8: take "parcel" <once> | acknowledge
3. repeat from 1 until the parcel is acknowledged

## Notes
A bounded retry keeps ownership explicit.
