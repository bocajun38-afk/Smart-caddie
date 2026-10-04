<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Player data (clubs, configured courses, scorecard) lives in browser localStorage via src/lib/local-store.ts — no account needed on the course.
- Course search goes through server functions in src/lib/courses.functions.ts so the GolfCourseAPI key stays server-side.
- Real hole layouts (tees, greens, lengths, bunkers/water) come from OpenStreetMap via Overpass in src/lib/osm-layout.functions.ts — GolfCourseAPI has no geometry and barely covers France.
- The hole screen uses a client-only Leaflet interactive map with a readable plan default and optional satellite layer; saved OpenStreetMap hole lines are used, while approximate tee-to-green lines are labeled because SSR cannot initialize maps and fabricated geometry would mislead golfers.
- Live plays-like slope uses elevation sampled at both GPS position and green when available; unknown live slope is shown as unknown rather than interpolating tee-to-green elevation, because intermediate terrain may differ.
- Tee-box distances are derived in useRound via applyTee (course data = white tees); all screens read the adjusted hole so distances stay consistent.
- Green edge distances derive from mapped green outlines along the current shot direction; a center-only green never receives invented front/back distances, because club selection needs honest geometry.
