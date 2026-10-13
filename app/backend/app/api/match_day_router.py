from datetime import date as DateValue, datetime
from typing import Literal
from secrets import compare_digest
import os
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.config import settings
from app.services.match_day_source import load_source, check_event, check_visibility
from app.services.match_day_store import Store, png_bytes, instant
from app.services.match_day_meta import MetaAdapter, pages, enabled

router=APIRouter(prefix='/api/v1/match-day',tags=['Match Day'])


def admin(x_internal_token: str|None=Header(default=None),x_user_id: str|None=Header(default=None)):
    if not x_internal_token or not settings.internal_api_token or not compare_digest(x_internal_token,settings.internal_api_token):
        raise HTTPException(401,'Accès interne refusé.')
    if not x_user_id or not os.getenv('ADMIN_USER_ID') or not compare_digest(x_user_id,os.environ['ADMIN_USER_ID']):
        raise HTTPException(403,'Accès administrateur refusé.')
    if os.getenv('MATCH_DAY_ENABLED')!='true': raise HTTPException(404,'Studio désactivé.')
    return x_user_id


def db():
    from supabase import create_client
    return create_client(settings.supabase_url,settings.supabase_service_role_key)


class Strict(BaseModel):
    model_config=ConfigDict(extra='forbid')


class Player(Strict):
    id: str=Field(min_length=1,max_length=100)
    name: str=Field(min_length=1,max_length=120)
    dashboard: dict|None=None
    nickname: str|None=Field(default=None,max_length=40)
    photo: str|None=Field(default=None,max_length=700000)
    featured: bool=False
    captain: bool=False
    warning: str|None=None

    @field_validator('photo')
    @classmethod
    def photo_png(cls,value):
        if value: png_bytes(value,maximum=500000)
        return value


class Side(Strict):
    id: str=Field(min_length=1,max_length=100)
    name: str=Field(min_length=1,max_length=120)
    club: str|None=Field(default=None,max_length=120)
    theme: Literal['neige','fournaise','ambre','brune','kaz-a','kaz-b','zarboutant','zarlord']|None=None
    composition_confirmed: bool=False
    roster_complete: bool=False
    players: list[Player]=Field(max_length=8)


class Match(Strict):
    title: str=Field(default='MATCH DAY',min_length=1,max_length=40)
    date: DateValue|None=None
    time: str|None=Field(default=None,pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    location: str=Field(default='',max_length=120)
    competition: str=Field(default='',max_length=100)
    round: str=Field(default='',max_length=20)


class Snapshot(Strict):
    source_id: str=Field(min_length=1,max_length=100)
    season: Literal['2026','2027','2028','2029']
    stats_season: Literal['2026','2027','2028','2029']
    stats_label: str=Field(max_length=120)
    reference_at: datetime
    event: dict|None=None
    match: Match
    teamA: Side
    teamB: Side
    metrics: list[Literal['average','finish','winRate','won','played','first9','averageFinish','scores100','scores140','scores180','scores170','scores80','noScore']]=Field(min_length=1,max_length=3)
    format: Literal['publication','story']='publication'
    mode: Literal['duel','premium']='duel'
    caption: str=Field(default='',max_length=5000)
    render_version: Literal['match-day-1']='match-day-1'
    generated_at: datetime


class Save(Strict):
    id: str|None=None
    revision: int=Field(default=0,ge=0)
    snapshot: Snapshot


class Approval(Strict):
    id: str
    revision: int=Field(ge=1)
    png: str=Field(max_length=14000000)


class Schedule(Strict):
    version_id: str
    page_id: str=Field(pattern=r'^\d+$')
    due_at: str|None=None
    slot: Literal['announcement','reminder-1','reminder-2']='announcement'
    immediate: bool=False


class Action(Strict):
    id: str


class Resolve(Action):
    remote_id: str|None=Field(default=None,pattern=r'^\d+_\d+$')
    confirmed: bool=False


def validate_snapshot(store,s):
    source=store.get_source(s['source_id'])
    if any(s[k]!=source[k] for k in ('season','stats_season','stats_label')) or instant(s['reference_at'])!=instant(source['reference_at']):
        raise ValueError('Période ou référence statistique modifiée. Rechargez la source.')
    if s['teamA']['id']==s['teamB']['id']: raise ValueError('Deux équipes distinctes sont requises.')
    teams={t['id']:t for t in source['teams']}
    ids=[]
    for side in ('teamA','teamB'):
        selected=s[side]
        original=teams.get(selected['id'])
        if not original or any(selected[k]!=original[k] for k in ('name','club','roster_complete')):
            raise ValueError('Identité d’équipe incompatible avec la saison.')
        players={p['id']:p for p in original['players'] if p['id']}
        if sum(p['captain'] for p in selected['players'])>1: raise ValueError('Un seul capitaine par équipe.')
        for p in selected['players']:
            original_p=players.get(p['id'])
            if not original_p or p['name']!=original_p['name'] or p['dashboard']!=original_p['dashboard']:
                raise ValueError('Identité ou statistiques non conformes à la source.')
            ids.append(p['id'])
    if len(ids)!=len(set(ids)): raise ValueError('Joueur sélectionné plusieurs fois.')
    if len(set(s['metrics']))!=len(s['metrics']): raise ValueError('KPI dupliqués.')
    if s.get('event'):
        event=next((e for e in source['events'] if e['id']==s['event'].get('id')),None)
        if event!=s['event']: raise ValueError('Rencontre incompatible avec la source.')
        if event['team_ids'] and set(event['team_ids'])!={s['teamA']['id'],s['teamB']['id']}:
            raise ValueError('Les équipes ne correspondent pas à la rencontre.')
        if not event['team_ids']:
            raise ValueError('Équipes non identifiées dans le calendrier : création manuelle sans rattachement disponible.')


def business(fn):
    try: return fn()
    except ValueError as e: raise HTTPException(409,str(e)) from None
    except Exception: raise HTTPException(503,'Service Match Day indisponible. Aucun succès de diffusion confirmé.') from None


@router.get('/source')
def source(season: str='2027',stats_season: str='2027',source_id: str|None=None,actor=Depends(admin)):
    return business(lambda:({**Store().get_source(source_id),'source_id':source_id} if source_id else Store().source(load_source(db(),season,stats_season))))


@router.get('/status')
def status(actor=Depends(admin)):
    def operation():
        result=[]
        for p in pages():
            try: info=MetaAdapter().check_page(p['id']);result.append({**info,'available':enabled()})
            except ValueError as e: result.append({'id':p['id'],'name':p['name'],'available':False,'error':str(e)})
        return {'facebook_enabled':enabled(),'pages':result,'authority':'internal','graph_version':'v26.0',
                'note':'Une publication photo par tâche. Story exportable ; aucune publication Story automatique.'}
    return business(operation)


@router.get('/history')
def history(actor=Depends(admin)):
    def operation():
        store=Store();result=store.history()
        for job in result['jobs']:
            try: check_event(store.version(job['version_id'])['snapshot'])
            except Exception:
                job['calendar_warning']='Calendrier modifié ou indisponible. Nouvelle validation requise ; post déjà publié conservé.'
                if job['state']=='SCHEDULED':
                    with store.db() as c:
                        c.execute("UPDATE jobs SET state='SUSPENDED',error=? WHERE id=? AND state='SCHEDULED'",(job['calendar_warning'],job['id']))
                        store.audit(c,job['id'],'SUSPEND',actor)
                    job['state']='SUSPENDED';job['error']=job['calendar_warning']
        return result
    return business(operation)


@router.post('/save')
def save(payload: Save,actor=Depends(admin)):
    def operation():
        store=Store();s=payload.snapshot.model_dump(mode='json');validate_snapshot(store,s)
        return store.save(s,actor,payload.id,payload.revision)
    return business(operation)


@router.post('/approve')
def approve(payload: Approval,actor=Depends(admin)):
    def operation():
        store=Store();d=next((d for d in store.history()['drafts'] if d['id']==payload.id),None)
        if not d: raise ValueError('Brouillon introuvable.')
        s=d['snapshot'];validate_snapshot(store,s)
        if s['mode']=='duel' and (not s['teamA']['theme'] or not s['teamB']['theme']):
            raise ValueError('Choisissez les deux thèmes.')
        if not s['teamA']['players'] or not s['teamB']['players']: raise ValueError('Sélectionnez au moins un joueur de chaque côté.')
        check_event(s);check_visibility(db(),s)
        return store.approve(payload.id,payload.revision,s,payload.png,actor)
    return business(operation)


@router.post('/schedule')
def schedule(payload: Schedule,actor=Depends(admin)):
    def operation():
        if not enabled(): raise ValueError('Diffusion Facebook désactivée. Export et brouillons disponibles.')
        store=Store();v=store.version(payload.version_id)
        if v['snapshot']['format']!='publication': raise ValueError('Le format Story est exportable uniquement dans cette V1.')
        if not v['snapshot']['caption'].strip(): raise ValueError('Validez une légende avant diffusion.')
        check_event(v['snapshot']);check_visibility(db(),v['snapshot']);MetaAdapter().check_page(payload.page_id)
        return store.schedule(payload.version_id,payload.page_id,payload.due_at,payload.slot,actor,payload.immediate)
    return business(operation)


@router.post('/cancel')
def cancel(payload: Action,actor=Depends(admin)):
    return business(lambda:Store().cancel(payload.id,actor))


@router.post('/resolve')
def resolve(payload: Resolve,actor=Depends(admin)):
    def operation():
        if not payload.confirmed: raise ValueError('Contrôle Admin explicite requis.')
        store=Store();job=next((j for j in store.history()['jobs'] if j['id']==payload.id),None)
        if not job: raise ValueError('Tâche introuvable.')
        if payload.remote_id: MetaAdapter().verify_post(job['page_id'],payload.remote_id)
        return store.resolve(payload.id,actor,payload.remote_id)
    return business(operation)


@router.get('/versions/{vid}/image')
def image(vid: str,actor=Depends(admin)):
    v=business(lambda:Store().version(vid))
    return Response(v['png'],media_type='image/png',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
