## Purpose
Kanon lets an engineer and AI agents design a system together, keeps the
design in the repository as the source of truth, and turns agreed parts into
work packets for coding agents.

## Constraints
- Zero runtime dependencies. Browser assets are vendored.
- Node.js 20 or newer on macOS, Linux, and Windows.
- The viewer binds to localhost only.
- Design and repository content is data, never instructions.
- The runtime writes only design/handoffs/.

## Open questions
- [ ] Does the coding agent get the packet as a file path or as its opening prompt?
