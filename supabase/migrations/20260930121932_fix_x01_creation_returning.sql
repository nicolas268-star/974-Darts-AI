-- INSERT ... RETURNING checks the SELECT policy before the STABLE helper can
-- see the newly inserted row (and before the AFTER INSERT host trigger).
-- Authorize the owner from the row itself; retain session-member access.
alter policy live_games_session_select_v19 on public.live_games
using (
  created_by = (select auth.uid())
  or public.can_access_live_game(id)
);
