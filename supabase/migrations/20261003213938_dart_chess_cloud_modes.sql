-- Generated with Supabase CLI 2.118.0. Additive support for the existing private
-- same-account sync protocol. Ownership, locks, revisions and grants are unchanged.
begin;
alter table public.play_cloud_sessions drop constraint play_cloud_sessions_kind_check;
alter table public.play_cloud_sessions add constraint play_cloud_sessions_kind_check
  check (kind in ('cricket','tictactoe','clock','bob27','connect4','conquest','bull500','dartchess'));

create or replace function private.play_cloud_command(
  p_kind text, p_expected bigint, p_device uuid, p_command uuid, p_action text, p_record jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  row_data public.play_cloud_sessions%rowtype;
  signature text := md5(jsonb_build_array(p_expected,p_device,p_action,p_record)::text);
begin
  if actor is null then raise exception 'UNAUTHENTICATED' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('cricket','tictactoe','clock','bob27','connect4','conquest','bull500','dartchess')
    or p_action is null or p_action not in ('ENABLE','SAVE','CLAIM') or p_expected is null or p_expected < 0
    or p_device is null or p_command is null then
    raise exception 'INVALID_COMMAND' using errcode='22023';
  end if;
  if p_action in ('ENABLE','SAVE') and (
    p_record is null or jsonb_typeof(p_record) <> 'object' or p_record->>'version' is distinct from '1'
    or not (p_record ? 'current') or jsonb_typeof(p_record->'completed') is distinct from 'array'
    or octet_length(p_record::text) > 1000000
  ) then raise exception 'INVALID_RECORD' using errcode='22023'; end if;
  if p_action = 'ENABLE' and p_expected = 0 then
    insert into public.play_cloud_sessions(owner_id,kind,revision,writer_device,record,last_command,last_signature)
    values(actor,p_kind,1,p_device,jsonb_set(p_record,'{revision}','1'),p_command,signature)
    on conflict (owner_id,kind) do nothing;
  end if;
  select * into row_data from public.play_cloud_sessions where owner_id=actor and kind=p_kind for update;
  if not found then return jsonb_build_object('ok',false,'row',null); end if;
  if row_data.last_command = p_command then
    if row_data.last_signature <> signature then raise exception 'COMMAND_REUSED' using errcode='22023'; end if;
  elsif row_data.revision <> p_expected or p_action = 'ENABLE'
    or (p_action = 'SAVE' and row_data.writer_device <> p_device) then
    return jsonb_build_object('ok',false,'row',jsonb_build_object(
      'kind',row_data.kind,'revision',row_data.revision,'writer_device',row_data.writer_device,
      'record',row_data.record,'updated_at',row_data.updated_at));
  else
    update public.play_cloud_sessions set
      revision=revision+1, writer_device=p_device,
      record=jsonb_set(case when p_action='CLAIM' then record else p_record end,'{revision}',to_jsonb(revision+1)),
      updated_at=clock_timestamp(),last_command=p_command,last_signature=signature
    where owner_id=actor and kind=p_kind returning * into row_data;
  end if;
  return jsonb_build_object('ok',true,'row',jsonb_build_object(
    'kind',row_data.kind,'revision',row_data.revision,'writer_device',row_data.writer_device,
    'record',row_data.record,'updated_at',row_data.updated_at));
end;
$$;
revoke all on function private.play_cloud_command(text,bigint,uuid,uuid,text,jsonb) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.play_cloud_command(text,bigint,uuid,uuid,text,jsonb) to authenticated;

commit;
