## Scenario
The engineer and agent build Kanon together in the terminal while its own
Chrome window shows the changing system. This flow uses the existing file
watcher; the agent updates the design as part of the conversation.

## Steps
1. skill -> runtime: open or reuse the project viewer
2. runtime -> viewer: serve the current system map
3. engineer -> skill: request a module or behavior change
4. skill -> design-folder: update the design, known answers, and verified build statuses
5. skill -> runtime: check the changed design
6. viewer -> design-folder: detect and read the file changes
7. viewer -> browser: send the update and redraw the map
8. browser -> engineer: show the revised system
9. repeat from 3 until this part of the system is settled

## Notes
The engineer works through the terminal conversation. Chrome presents the
same design throughout the session and needs no manual refresh. The Steps
list summarizes the loop; file watching runs concurrently with checking.

When implementation changes the system's structure or behavior, the agent
also updates its design. A code edit by itself does not change the map.
Automatically keeping those files current is a skill responsibility.

During these updates, the skill also records answers already supplied by
accepted instructions, specs, or decisions and closes their questions. It
explains the source of each answer; unresolved choices stay open.
It also records completed, authorized implementations as built after checking
the supporting evidence. This does not require a separate sync request.

Change highlighting is a proposed viewer improvement, not existing behavior.
