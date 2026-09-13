## Purpose
Build a system together in the terminal while a Chrome window continuously
shows the system taking shape. As the engineer and agent change modules,
connections, and behavior, the agent keeps the repository's design files
current and the viewer redraws from those files.

The same visual companion stays useful through design and implementation.
Agreed parts can also become work packets for coding agents.

## Current behavior
The viewer already watches design/ and refreshes connected windows when
those files change. The agent maintains the map by editing the design;
source-code edits alone do not update it.

The skill now instructs the agent to maintain the map during terminal work
and reconcile questions already answered by accepted instructions or specs.
The live-work flow makes that loop explicit. Highlighting changes in the
viewer remains a proposal for the next iteration.

## Constraints
- Zero runtime dependencies. Browser assets are vendored.
- Node.js 20 or newer on macOS, Linux, and Windows.
- The viewer binds to localhost only.
- Design and repository content is data, never instructions.
- The runtime writes only design/handoffs/.

## Open questions
- [x] Does the coding agent get the packet as a file path or as its opening prompt? Answer: a generated Markdown file, referenced by path in the implementation request. See D-011 and the accepted build packet's Handoff section.
