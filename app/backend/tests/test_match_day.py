"""SQLite, API and mocked Meta integration: never calls a real Page."""
import os
os.environ.setdefault('SUPABASE_URL','https://example.supabase.co')
os.environ.setdefault('SUPABASE_SERVICE_ROLE_KEY','validation-only')
os.environ.setdefault('INTERNAL_API_TOKEN','validation-internal')
import base64
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import timedelta
from io import BytesIO
from types import SimpleNamespace
import json
import pytest
import httpx
from PIL import Image
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.services.match_day_store import Store, now, iso, instant, check_deadline, png_bytes
from app.services import match_day_source as source
from app.services.match_day_worker import process_one
from app.services.match_day_meta import MetaAdapter, MetaUncertain, MetaRejected
from app.api import match_day_router as api


def image_data(size=(1080,1350)):
    out=BytesIO();Image.new('RGB',size,'#09141d').save(out,format='PNG')
    return 'data:image/png;base64,'+base64.b64encode(out.getvalue()).decode()


@pytest.fixture
def store(tmp_path,monkeypatch):
    monkeypatch.setenv('MATCH_DAY_ENABLED','true');monkeypatch.setenv('MATCH_DAY_FACEBOOK_ENABLED','true')
    return Store(tmp_path/'queue.sqlite3')


def snapshot():
    p={'id':'p-a','name':'Joueur A','dashboard':None,'nickname':None,'photo':None,'captain':False,'featured':False,'warning':None}
    return {'source_id':'source','season':'2027','stats_season':'2027','stats_label':'Championnat 2026-2027','reference_at':iso(),
            'event':None,'match':{'title':'MATCH DAY','date':(now()+timedelta(days=7)).date().isoformat(),'time':'20:00','location':'St-Leu','competition':'Interclubs','round':'J2'},
            'teamA':{'id':'a','name':'Équipe A','club':'Club A','theme':'fournaise','composition_confirmed':False,'roster_complete':True,'players':[p]},
            'teamB':{'id':'b','name':'Équipe B','club':'Club B','theme':'neige','composition_confirmed':False,'roster_complete':True,'players':[{**p,'id':'p-b','name':'Joueur B'}]},
            'metrics':['average','winRate','finish'],'format':'publication','mode':'duel','caption':'🎯 Match day','render_version':'match-day-1','generated_at':iso()}


def approved(store,s=None):
    s=s or snapshot();d=store.save(s,'admin');v=store.approve(d['id'],1,s,image_data(),'admin');return d,v


def queue(store,s=None):
    d,v=approved(store,s);j=store.schedule(v['version_id'],'123',None,'announcement','admin',True);return d,v,j


def test_png_persistence(store):
    d,v=approved(store);assert Store(store.path).version(v['version_id'])['png']==png_bytes(image_data())
    assert Store(store.path).history()['drafts'][0]['snapshot']==d['snapshot']
    assert len(store.history()['audit'])==2


@pytest.mark.parametrize('bad',[image_data((100,100)),'data:image/png;base64,ZmFrZQ==','https://private.test/image.png'])
def test_invalid_upload(store,bad):
    d=store.save(snapshot(),'admin')
    with pytest.raises(ValueError):store.approve(d['id'],1,d['snapshot'],bad,'admin')


def test_metadata_rejected():
    from PIL.PngImagePlugin import PngInfo
    info=PngInfo();info.add_text('location','private');b=BytesIO();Image.new('RGB',(1080,1350)).save(b,format='PNG',pnginfo=info)
    with pytest.raises(ValueError):png_bytes('data:image/png;base64,'+base64.b64encode(b.getvalue()).decode())


def test_stale_revision_and_modification(store):
    d,v=approved(store);store.schedule(v['version_id'],'123',iso(now()+timedelta(hours=2)),'announcement','admin')
    s=deepcopy(d['snapshot']);s['teamA']['theme']='brune';store.save(s,'admin',d['id'],1)
    assert store.history()['jobs'][0]['state']=='SUSPENDED'
    with pytest.raises(ValueError):store.save(s,'admin',d['id'],1)
    with pytest.raises(ValueError):store.approve(d['id'],1,d['snapshot'],image_data(),'admin')
    with pytest.raises(ValueError):store.schedule(v['version_id'],'123',iso(now()+timedelta(hours=3)),'announcement','admin')
    assert store.version(v['version_id'])['snapshot']['teamA']['theme']=='fournaise'


def test_concurrent_claim(store):
    _,_,j=queue(store)
    with ThreadPoolExecutor(max_workers=4) as pool:claimed=list(pool.map(lambda _:Store(store.path).claim(),range(4)))
    assert [c['id'] for c in claimed if c]==[j['id']]


def test_schedule_idempotence(store):
    _,v=approved(store);due=iso(now()+timedelta(hours=1));a=store.schedule(v['version_id'],'123',due,'announcement','admin')
    assert store.schedule(v['version_id'],'123',due,'announcement','admin')['id']==a['id']
    with pytest.raises(ValueError):store.schedule(v['version_id'],'123',iso(now()+timedelta(hours=2)),'announcement','admin')


def test_stable_identity_and_explicit_reminder(store):
    d,v,j=queue(store);store.claim();store.finish(j['id'],'PUBLISHED',remote={'post_id':'123_456'})
    s=deepcopy(d['snapshot']);s['teamA']['theme']='brune';store.save(s,'admin',d['id'],1);ver=store.approve(d['id'],2,s,image_data(),'admin')
    with pytest.raises(ValueError):store.schedule(ver['version_id'],'123',iso(now()+timedelta(hours=1)),'announcement','admin')
    store.schedule(ver['version_id'],'123',iso(now()+timedelta(hours=1)),'reminder-1','admin')
    assert len(store.history()['jobs'])==2


def test_restart_uncertain(store):
    d,_,j=queue(store);store.claim()
    with store.db() as c:c.execute('UPDATE jobs SET started_at=? WHERE id=?',(iso(now()-timedelta(minutes=6)),j['id']))
    assert Store(store.path).claim() is None and store.history()['jobs'][0]['state']=='VERIFY'
    with pytest.raises(ValueError):store.cancel(j['id'],'admin')
    with pytest.raises(ValueError):store.save(d['snapshot'],'admin',d['id'],1)


@pytest.mark.parametrize('outcome,expected',[('success','PUBLISHED'),('uncertain','VERIFY'),('rejected','FAILED')])
def test_worker_outcomes(store,outcome,expected):
    _,v,_=queue(store);calls=[]
    class Adapter:
        def publish(self,pid,png,caption):
            calls.append(png)
            if outcome=='uncertain':raise MetaUncertain('Timeout : vérification requise.')
            if outcome=='rejected':raise MetaRejected('Token invalide.')
            return {'id':'456','post_id':'123_456','url':'https://www.facebook.com/123_456'}
    assert process_one(store,Adapter(),lambda s:None)
    assert store.history()['jobs'][0]['state']==expected
    assert not process_one(store,Adapter(),lambda s:None)
    assert calls==[store.version(v['version_id'])['png']]


def test_stale_job_and_disabled_send(store,monkeypatch):
    _,_,j=queue(store)
    with store.db() as c:c.execute('UPDATE jobs SET due_at=? WHERE id=?',(iso(now()-timedelta(minutes=16)),j['id']))
    no_send=SimpleNamespace(publish=lambda *x:pytest.fail('Unexpected send'))
    process_one(store,no_send,lambda s:None);assert store.history()['jobs'][0]['state']=='SUSPENDED'
    _,_,j2=queue(store);monkeypatch.setenv('MATCH_DAY_FACEBOOK_ENABLED','false')
    process_one(store,no_send,lambda s:None)
    assert next(row for row in store.history()['jobs'] if row['id']==j2['id'])['state']=='SUSPENDED'


def test_calendar_changes_missing_corrupt(tmp_path,monkeypatch):
    path=tmp_path/'calendar.json';monkeypatch.setattr(source,'STATE_PATH',path)
    e={'id':'event-1','title':'J2','start_date':'2026-12-01','start_time':'20:00','location':'St-Leu','status':'SCHEDULED','championship_teams':['A','B'],'team_ids':['a','b'],'source_url':None}
    s=snapshot();s['event']={**source.event_fingerprint(e),'season':'2027'}
    path.write_text(json.dumps({'events':[e]}));source.check_event(s)
    for field,value in [('start_date','2026-12-02'),('start_time','21:00'),('location','Tampon'),('status','CANCELLED'),('team_ids',['a','c'])]:
        path.write_text(json.dumps({'events':[{**e,field:value}]}))
        with pytest.raises(ValueError):source.check_event(s)
    path.unlink()
    with pytest.raises(ValueError):source.check_event(s)
    path.write_text('{broken')
    with pytest.raises(ValueError):source.check_event(s)


@pytest.mark.parametrize('caption,day,hour,valid',[("Aujourd’hui",'2030-01-02','20:00',True),("Aujourd\'hui",'2030-01-03','20:00',False),('Ce soir','2030-01-02',None,False),('Ce soir','2030-01-02','17:00',False)])
def test_relative_text_timezone(caption,day,hour,valid):
    s=snapshot();s['match'].update(date=day,time=hour);s['caption']=caption;due=instant('2030-01-01T22:00:00Z')
    if valid:check_deadline(s,due)
    else:
        with pytest.raises(ValueError):check_deadline(s,due)


def test_past_after_match(store):
    d,v=approved(store)
    with pytest.raises(ValueError):store.schedule(v['version_id'],'123',iso(now()-timedelta(hours=1)),'announcement','admin')
    s=d['snapshot'];s['match'].update(date='2030-01-02',time='00:30')
    with pytest.raises(ValueError):check_deadline(s,instant('2030-01-01T20:30:00Z'))
    s['match']['time']=None
    with pytest.raises(ValueError):check_deadline(s,instant('2030-01-01T20:00:00Z'))


def configure_meta(monkeypatch):
    monkeypatch.setenv('MATCH_DAY_FACEBOOK_ENABLED','true');monkeypatch.setenv('VALIDATION_PAGE_TOKEN','private-validation-token')
    monkeypatch.setenv('MATCH_DAY_META_PAGES','[{"id":"123","name":"Test","token_env":"VALIDATION_PAGE_TOKEN"}]')


def test_meta_contract_no_secrets(monkeypatch):
    configure_meta(monkeypatch);seen=[]
    def handle(req):
        seen.append(req);assert 'private-validation-token' not in str(req.url)
        assert req.headers['Authorization']=='Bearer private-validation-token'
        if req.method=='GET':return httpx.Response(200,json={'id':'123','name':'Test'})
        body=req.read();assert b'name="source"' in body and b'name="caption"' in body and b'scheduled_publish_time' not in body
        return httpx.Response(200,json={'id':'456','post_id':'123_456'})
    adapter=MetaAdapter(httpx.MockTransport(handle));assert adapter.publish('123',png_bytes(image_data()),'Texte')['post_id']=='123_456'
    assert '/v26.0/123/photos' in str(seen[-1].url)
    with pytest.raises(MetaRejected):adapter.publish('999',b'PNG','text')
    with pytest.raises(MetaRejected):MetaAdapter(httpx.MockTransport(lambda r:httpx.Response(200,json={'id':'999'}))).check_page('123')


def test_meta_timeout_missing_id(monkeypatch):
    configure_meta(monkeypatch)
    def timeout(req):
        if req.method=='GET':return httpx.Response(200,json={'id':'123'})
        raise httpx.ReadTimeout('private-url-never-leaked')
    with pytest.raises(MetaUncertain,match='incertaine'):MetaAdapter(httpx.MockTransport(timeout)).publish('123',b'PNG','text')
    def missing(req):return httpx.Response(200,json={'id':'123'} if req.method=='GET' else {'id':'456'})
    with pytest.raises(MetaUncertain) as uncertain:MetaAdapter(httpx.MockTransport(missing)).publish('123',b'PNG','text')
    assert uncertain.value.remote=={'id':'456'}


def test_source_manifest_tampering(store):
    s=snapshot();teams=[]
    for side in ('teamA','teamB'):
        t=deepcopy(s[side]);t.pop('theme');t.pop('composition_confirmed');teams.append(t)
    m={**{k:s[k] for k in ('season','stats_season','stats_label','reference_at')},'teams':teams,'events':[]}
    s['source_id']=store.source(m)['source_id'];api.validate_snapshot(store,s)
    for target in ('name','dashboard'):
        bad=deepcopy(s);bad['teamA']['players'][0][target]='Injected'
        with pytest.raises(ValueError):api.validate_snapshot(store,bad)
    bad=deepcopy(s);bad['teamB']['id']='a'
    with pytest.raises(ValueError):api.validate_snapshot(store,bad)
    bad=deepcopy(s);bad['teamA']['theme']='brune';api.validate_snapshot(store,bad)


def test_api_admin_disabled(store,monkeypatch):
    monkeypatch.setenv('ADMIN_USER_ID','test-admin');monkeypatch.setattr(api,'Store',lambda:store)
    app=FastAPI();app.include_router(api.router);client=TestClient(app);token=api.settings.internal_api_token
    assert client.get('/api/v1/match-day/history').status_code==401
    assert client.get('/api/v1/match-day/history',headers={'X-Internal-Token':token,'X-User-Id':'player'}).status_code==403
    headers={'X-Internal-Token':token,'X-User-Id':'test-admin'}
    assert client.get('/api/v1/match-day/history',headers=headers).status_code==200
    monkeypatch.setenv('MATCH_DAY_ENABLED','false');assert client.get('/api/v1/match-day/history',headers=headers).status_code==404


def test_states_manual_creation(store):
    d,v,j=queue(store);store.cancel(j['id'],'admin');assert store.claim() is None
    with pytest.raises(ValueError):store.cancel(j['id'],'admin')
    assert store.version(v['version_id'])['snapshot']['event'] is None and store.history()['drafts'][0]['id']==d['id']
    with pytest.raises(ValueError):store.finish(j['id'],'SCHEDULED')


class Query:
    def __init__(self,rows):self.rows=list(rows)
    def select(self,*a):return self
    def eq(self,k,v):self.rows=[r for r in self.rows if r.get(k)==v];return self
    def range(self,a,b):self.rows=self.rows[a:b+1];return self
    def order(self,k,desc=False):self.rows.sort(key=lambda row:str(row.get(k,'')),reverse=desc);return self
    def limit(self,n):self.rows=self.rows[:n];return self
    def execute(self):return SimpleNamespace(data=self.rows)


class FakeDB:
    def __init__(self,tables):self.tables=tables
    def table(self,name):return Query(self.tables.get(name,[]))


def test_official_source_2026_2027_private_new_season_and_calendar(monkeypatch,tmp_path):
    a=source.ROSTER_TEAM_IDS['pdc-fournaise'];b=source.ROSTER_TEAM_IDS['pdc-neige']
    db=FakeDB({'players':[{'id':'nico','display_name':'Nicolas DUPONT','public_profile':True,'team_id':a},
                          {'id':'pierre','display_name':'Pierre BERLET','public_profile':True,'team_id':a}],
               'teams':[{'id':a,'name':'Papangue Darts Club - Fournaise','club_id':'pdc'},{'id':b,'name':'Papangue Darts Club - Neige','club_id':'pdc'}],
               'clubs':[{'id':'pdc','name':'Papangue Darts Club'}],
               'seasons':[{'id':'s26','name':'2026','is_active':False},{'id':'s27','name':'2026-2027','is_active':True}],
               'rounds':[{'id':'r26','season_id':'s26','code':'J1','played_on':'2026-04-01','published':True}],
               'player_daily_stats':[{'id':'d','player_id':'pierre','round_id':'r26','team_id':a,'legs_played':4,'legs_won':0,'average_3_darts':40,'first_9':50,'best_finish':60}],
               'player_team_memberships':[{'identity_id':'ip','team_id':a,'season_id':'s26'}],
               'player_identities':[{'id':'ip','canonical_player_id':'pierre','canonical_display_name':'Pierre BERLET','status':'ACTIVE'},{'id':'in','canonical_player_id':'nico','status':'ACTIVE'}],
               'committee_licensed_players':[{'season_key':'2026-2027','official_display_name':'Pierre BERLET','identity_id':'ip','license_status':'ACTIVE','club_code':'PDC'},
                                             {'season_key':'2026-2027','official_display_name':'Nicolas DUPONT','identity_id':'in','license_status':'ACTIVE','club_code':'PDC'}]})
    monkeypatch.setattr(source.CompetitionHubService,'_season_cards',lambda self:[{'id':'s'+y[-2:],'year':int(y),'name':'Championnat '+y} for y in ('2026','2027','2028')])
    e={'id':'calendar-real','event_type':'CHAMPIONSHIP','title':'J2 PDC A vs PDC B','source_url':'https://n01darts.com/n01/league/season.php?id=t_valid','start_date':'2030-01-02','start_time':None,'location':'St-Leu','status':'SCHEDULED'}
    path=tmp_path/'calendar.json';path.write_text(json.dumps({'events':[e]}));monkeypatch.setattr(source,'STATE_PATH',path)
    monkeypatch.setattr(source,'list_events',lambda:{'events':[e]})
    monkeypatch.setattr(source,'registry_status',lambda:{'seasons':[{'key':'2026-2027','events':[{'url':e['source_url']}]}]})
    new=source.load_source(db,'2027','2027')
    pierre=next(p for t in new['teams'] if t['id']==b for p in t['players'] if p['id']=='pierre')
    assert pierre['dashboard']['meta']['has_data'] is False # does not borrow 2026 average
    assert new['events'][0]['team_ids']==[b,a] and new['events'][0]['round']=='J2'
    source.check_event({'event':new['events'][0]}) # derived IDs don't change the raw calendar fingerprint
    old=source.load_source(db,'2026','2026');assert len(old['teams'])==1 and old['teams'][0]['id']==a
    assert old['teams'][0]['players'][0]['dashboard']['kpis']['average_3_darts']==40
    assert old['teams'][0]['team_stats']['average_3_darts']==40
    assert next(t for t in new['teams'] if t['id']==b)['team_stats']['average_3_darts'] is None
    assert old['teams'][0]['roster_complete'] is False
    assert source.load_source(db,'2028','2028')['teams']==[]
    db.tables['players'][1]['public_profile']=False
    hidden=source.load_source(db,'2027','2027');assert not any(p['id']=='pierre' for t in hidden['teams'] for p in t['players'])
    assert source.load_source(db,'2026','2026')['teams'][0]['team_stats']['average_3_darts'] is None


def test_concurrent_first_initialization(tmp_path):
    path=tmp_path/'first-boot.sqlite3'
    with ThreadPoolExecutor(max_workers=8) as pool:
        result=list(pool.map(lambda _:Store(path).history(),range(8)))
    assert all(r['jobs']==[] and r['drafts']==[] for r in result)



def test_no_remote_post_found_does_not_release_uncertain_identity(store):
    _,_,j=queue(store);store.claim();store.finish(j['id'],'VERIFY','Timeout')
    assert store.resolve(j['id'],'admin',None)['state']=='VERIFY'
    with pytest.raises(ValueError):store.cancel(j['id'],'admin')


def test_team_statistics_same_ranking_and_full_roster_average():
    from app.services.match_day_team_stats import team_statistics
    ranking={'season':{'id':'s27'},'ranking_source':'CALENDRIER_SCORE','standings':[{'team_id':'a','rank':3,'points':5,'played':2,'wins':1,'draws':0,'losses':1,'sets_won':15,'sets_lost':17,'set_difference':-2,'legs_won':12,'legs_lost':9,'detail_complete':False}]}
    players=[{'average_3_darts':40,'legs_played':10},{'average_3_darts':60,'legs_played':30},{'average_3_darts':None,'legs_played':5},{'average_3_darts':100,'legs_played':0}]
    s=team_statistics('a',ranking,players)
    assert s['average_3_darts']==50 and s['average_players']==2 # Same arithmetic mean as the public team page, not weighted 55.
    assert s['rank']==3 and s['points']==5 and s['set_difference']==-2 and s['win_rate']==50
    assert s['legs_won'] is None and s['legs_lost'] is None
    empty=team_statistics('b',ranking,[]);assert empty['rank'] is None and empty['points']==0 and empty['played']==0 and empty['win_rate'] is None
    assert team_statistics('a',None,[])['points'] is None
    assert team_statistics('a',ranking,[{'average_3_darts':0,'legs_played':1}])['average_3_darts']==0


def test_team_kpi_manifest_legacy_and_api_approval_without_players(store,monkeypatch):
    from app.services.match_day_team_stats import team_statistics
    monkeypatch.setenv('ADMIN_USER_ID','test-admin');monkeypatch.setattr(api,'Store',lambda:store);monkeypatch.setattr(api,'db',lambda:None)
    s=snapshot();teams=[]
    for side in ('teamA','teamB'):
        t=deepcopy(s[side]);t.pop('theme');t.pop('composition_confirmed');teams.append(t)
    manifest={**{k:s[k] for k in ('season','stats_season','stats_label','reference_at')},'teams':teams,'events':[]}
    s['source_id']=store.source(manifest)['source_id']
    api.validate_snapshot(store,api.Snapshot(**s).model_dump(mode='json')) # Old drafts/sources remain valid in player mode.
    s['content_mode']='teams'
    with pytest.raises(ValueError,match='Actualisez'):api.validate_snapshot(store,s)
    stats=team_statistics('a',{'season':{'id':'s'},'standings':[]},[])
    for t in teams:t['team_stats']=stats
    s['source_id']=store.source(manifest)['source_id']
    for side in ('teamA','teamB'):s[side]['team_stats']=stats;s[side]['players']=[]
    s['team_metrics']=['rank','average','points'];api.validate_snapshot(store,s)
    bad=deepcopy(s);bad['teamA']['team_stats']['rank']=1
    with pytest.raises(ValueError,match='Statistiques d’équipe'):api.validate_snapshot(store,bad)
    bad=deepcopy(s);bad['team_metrics']=['rank','rank']
    with pytest.raises(ValueError,match='dupliqués'):api.validate_snapshot(store,bad)
    app=FastAPI();app.include_router(api.router);client=TestClient(app);headers={'X-Internal-Token':api.settings.internal_api_token,'X-User-Id':'test-admin'}
    response=client.post('/api/v1/match-day/save',json={'snapshot':s},headers=headers);assert response.status_code==200,response.text
    d=response.json();approved=client.post('/api/v1/match-day/approve',json={'id':d['id'],'revision':1,'png':image_data()},headers=headers)
    assert approved.status_code==200,approved.text
    assert store.version(approved.json()['version_id'])['snapshot']['content_mode']=='teams'
    bad=deepcopy(s);bad['team_metrics']=['rank','average','points','played','wins','draws','losses']
    assert client.post('/api/v1/match-day/save',json={'snapshot':bad},headers=headers).status_code==422
