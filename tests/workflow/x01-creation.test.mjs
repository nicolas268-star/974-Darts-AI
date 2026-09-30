import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const db=new PGlite();
const owner='00000000-0000-0000-0000-000000000001';
const outsider='00000000-0000-0000-0000-000000000002';
const scorer='00000000-0000-0000-0000-000000000003';
const spectator='00000000-0000-0000-0000-000000000004';
const as=async user=>{
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
};
// Match the browser's insert/select and the Data API's INSERT RETURNING CTE.
const create=async(format='DUEL',mode='QUICK_SCORE')=>(await db.query(`
  with pgrst_source as (
    insert into public.live_games
      (starting_score,in_rule,out_rule,input_mode,play_format,best_of_legs,
       best_of_sets,status,current_leg_number,current_turn,started_at)
    values (501,'STRAIGHT_IN','DOUBLE_OUT',$1,$2,3,1,'IN_PROGRESS',1,1,now())
    returning id,session_code,starting_score,in_rule,out_rule,input_mode,
      play_format,best_of_legs,status,current_leg_number,current_turn
  ) select * from pgrst_source`,[mode,format])).rows[0];

try {
  await db.exec(read('tests/workflow/bootstrap.sql'));
  await db.exec('create table public.players(id uuid primary key)');
  for(const file of ['MIGRATION_SUPABASE_X01.sql','MIGRATION_SUPABASE_X01_MULTIPLAYER.sql','MIGRATION_SUPABASE_V19_GAME_SESSIONS.sql']) {
    await db.exec(read('supabase/release_migrations/'+file));
  }
  // Existing production policies omitted from the historical X01 schema file,
  // plus the later scorer/spectator split. Fictitious accounts only.
  await db.exec(`
    grant select,insert,update,delete on all tables in schema public to authenticated,anon;
    create policy "owners insert live games" on public.live_games
      for insert to authenticated with check (created_by=(select auth.uid()));
    create policy "owners delete live games" on public.live_games
      for delete to authenticated using (created_by=(select auth.uid()));
    alter table public.live_game_members drop constraint live_game_members_role_check;
    alter table public.live_game_members add constraint live_game_members_role_check
      check (role in ('HOST','SCORER','SPECTATOR'));
    create function public.can_score_live_game(p_game_id uuid)
    returns boolean language sql stable security definer set search_path=public as $$
      select exists(select 1 from public.live_games g where g.id=p_game_id and
        (g.created_by=auth.uid() or exists(select 1 from public.live_game_members m
          where m.game_id=g.id and m.user_id=auth.uid() and m.role in ('HOST','SCORER'))));
    $$;
    revoke all on function public.can_score_live_game(uuid) from public,anon;
    grant execute on function public.can_score_live_game(uuid) to authenticated;
    revoke all on function public.generate_live_game_session_code() from public,anon;
    grant execute on function public.generate_live_game_session_code() to authenticated;
    alter policy live_games_session_update_v19 on public.live_games
      using (public.can_score_live_game(id)) with check (public.can_score_live_game(id));
    alter policy live_game_players_session_insert_v19 on public.live_game_players
      with check (public.can_score_live_game(game_id));
    alter policy live_game_players_session_update_v19 on public.live_game_players
      using (public.can_score_live_game(game_id)) with check (public.can_score_live_game(game_id));
    alter policy live_legs_session_insert_v19 on public.live_legs
      with check (public.can_score_live_game(game_id));
    alter policy live_legs_session_update_v19 on public.live_legs
      using (public.can_score_live_game(game_id)) with check (public.can_score_live_game(game_id));
  `);
  await as(owner);
  await assert.rejects(()=>create(),e=>e.code==='42501' && /row-level security/.test(e.message));
  assert.equal((await db.query('select count(*)::int as n from public.live_games')).rows[0].n,0);
  console.log('PASS: reproduces the production INSERT RETURNING failure before the fix');

  await db.exec('reset role');
  await db.exec(read('supabase/migrations/20260930121932_fix_x01_creation_returning.sql'));
  await as(owner);
  let target;
  for(const [format,count] of [['SOLO',1],['DUEL',2],['THREE',3],['FOUR',4],['TEAMS_2V2',4]]) {
    for(const mode of ['QUICK_SCORE','DART_BY_DART']) {
      const game=await create(format,mode);
      target=game;
      assert.match(game.session_code,/^[A-Z0-9]{6}$/);
      assert.equal(game.starting_score,501);
      assert.equal(game.input_mode,mode);
      const members=(await db.query('select role from public.live_game_members where game_id=$1',[game.id])).rows;
      assert.deepEqual(members,[{role:'HOST'}],'The host trigger still runs');
      const ids=[];
      for(let seat=1;seat<=count;seat++) {
        const side=format==='TEAMS_2V2'?(seat-1)%2+1:seat;
        const p=(await db.query(`insert into public.live_game_players(game_id,display_name,seat,side)
          values($1,$2,$3,$4) returning id`,[game.id,'Joueur test '+seat,seat,side])).rows[0];
        ids.push(p.id);
      }
      assert.equal(ids.length,count);
      const leg=(await db.query(`insert into public.live_legs(game_id,leg_number,starting_game_player_id)
        values($1,1,$2) returning id`,[game.id,ids[0]])).rows[0];
      assert.ok(leg.id,'The first leg is created');
      assert.equal((await db.query('update public.live_games set current_turn=2 where id=$1 returning current_turn',[game.id])).rows[0].current_turn,2);
    }
  }
  await as(outsider);
  assert.equal((await db.query('delete from public.live_games where id=$1 returning id',[target.id])).rows.length,0,'An outsider cannot delete a game');
  assert.equal((await db.query('select id from public.live_games')).rows.length,0,'Other accounts see no games');
  assert.equal((await db.query('update public.live_games set current_turn=3 where id=$1 returning id',[target.id])).rows.length,0);
  await assert.rejects(()=>db.query('insert into public.live_games(created_by) values($1) returning id',[owner]),e=>e.code==='42501');
  await assert.rejects(()=>db.query("insert into public.live_game_players(game_id,display_name,seat,side) values($1,'Intrus',5,1)",[target.id]),e=>e.code==='42501');

  await db.exec('reset role');
  await db.query("insert into public.live_game_members(game_id,user_id,role) values($1,$2,'SCORER'),($1,$3,'SPECTATOR')",[target.id,scorer,spectator]);
  await as(spectator);
  assert.equal((await db.query('delete from public.live_games where id=$1 returning id',[target.id])).rows.length,0,'A spectator cannot delete a game');
  assert.equal((await db.query('select id from public.live_games')).rows.length,1,'Spectator sees the shared session');
  assert.equal((await db.query('update public.live_games set current_turn=3 where id=$1 returning id',[target.id])).rows.length,0,'Spectator cannot score');
  await as(scorer);
  assert.equal((await db.query('delete from public.live_games where id=$1 returning id',[target.id])).rows.length,0,'A scorer cannot delete another account’s game');
  assert.equal((await db.query('update public.live_games set current_turn=3 where id=$1 returning current_turn',[target.id])).rows[0].current_turn,3,'Scorer keeps write access');
  await as(owner);
  const legId=(await db.query('select id from public.live_legs where game_id=$1',[target.id])).rows[0].id;
  const playerId=(await db.query('select id from public.live_game_players where game_id=$1 order by seat limit 1',[target.id])).rows[0].id;
  const visitId=(await db.query(`insert into public.live_visits(leg_id,game_player_id,turn_number,score_before,score_scored,score_after,input_mode)
    values($1,$2,1,501,60,441,'DART_BY_DART') returning id`,[legId,playerId])).rows[0].id;
  await db.query('insert into public.live_throws(visit_id,dart_number,segment,multiplier,score) values($1,1,20,3,60)',[visitId]);
  assert.equal((await db.query('delete from public.live_games where id=$1 and created_by=$2 returning id',[target.id,owner])).rows.length,1);
  await db.exec('reset role');
  for(const [table,column,id] of [['live_game_players','game_id',target.id],['live_game_members','game_id',target.id],['live_legs','game_id',target.id],['live_visits','leg_id',legId],['live_throws','visit_id',visitId]]) {
    assert.equal((await db.query(`select count(*)::int as n from public.${table} where ${column}=$1`,[id])).rows[0].n,0,table+' is removed by cascade');
  }
  assert.equal((await db.query('select count(*)::int as n from public.live_games')).rows[0].n,9,'Other games remain');
  await db.exec('reset role; set role anon');
  await assert.rejects(()=>create(),e=>e.code==='42501');
  console.log('PASS: X01 creation in five formats and both input modes; owner-only deletion and full cascade, account isolation and scorer/spectator rights');
} finally {await db.close();}
