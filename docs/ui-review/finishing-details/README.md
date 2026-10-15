# Image sharing review

The plan keeps its existing composition and adds native image sharing beside saving.
These captures use isolated local sample restaurants. The phone view is scrolled to
the actions; each action remains readable and reachable without horizontal overflow.

- [Desktop actions](sharing-desktop.png)
- [Phone actions](sharing-mobile.png)

The browser journey verifies a prepared PNG reaches the share API during the click,
with its filename and image bytes intact. Cancellation neither downloads nor claims
success. Physical share targets and receiving apps still need a device check.
