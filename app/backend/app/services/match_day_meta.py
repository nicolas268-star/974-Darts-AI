"""Single-photo Pages API adapter. No native Meta scheduling, no client secrets.
Contract verified 2026-10-13: Graph API v26.0 /page/photos and Pages posts docs.
"""
import os
import re
import httpx


class MetaRejected(ValueError):
    pass


class MetaUncertain(ValueError):
    def __init__(self,message,remote=None):
        super().__init__(message)
        self.remote=remote or {}


def pages():
    # Explicit allowlist, one token per Page; UI receives only safe fields.
    import json
    configured=json.loads(os.getenv('MATCH_DAY_META_PAGES','[]'))
    if not isinstance(configured,list) or any(not re.fullmatch(r'[0-9]+',str(p.get('id',''))) or not p.get('token_env') or not p.get('name') for p in configured):
        raise ValueError('Configuration des Pages invalide.')
    return configured


def enabled():
    return os.getenv('MATCH_DAY_FACEBOOK_ENABLED')=='true'


def page_config(pid):
    p=next((p for p in pages() if p['id']==pid),None)
    if not p:
        raise MetaRejected('Page cible non autorisée.')
    token=os.getenv(p['token_env'],'').strip()
    if not token:
        raise MetaRejected('Token de Page absent côté serveur.')
    return p,token


class MetaAdapter:
    version='v26.0'
    def __init__(self, transport=None):
        self.client=httpx.Client(timeout=30,follow_redirects=False,transport=transport)

    def check_page(self,pid):
        _,token=page_config(pid)
        try:
            r=self.client.get(f'https://graph.facebook.com/{self.version}/me',
                              params={'fields':'id,name'},headers={'Authorization':'Bearer '+token})
            d=r.json()
            if r.status_code!=200 or str(d.get('id'))!=pid:
                raise MetaRejected('Token invalide, droits insuffisants ou token correspondant à une autre Page.')
            # Actual POST remains the authority on CREATE_CONTENT/pages_manage_posts.
            return {'id':pid,'name':str(d.get('name') or pid),'identity_verified':True,
                    'permissions':'Droits de publication à confirmer par Meta lors de l’envoi.'}
        except MetaRejected:
            raise
        except Exception:
            raise MetaRejected('Connexion Meta indisponible.') from None

    def publish(self,pid,png,caption):
        if not enabled():
            raise MetaRejected('Diffusion Facebook désactivée.')
        _,token=page_config(pid)
        self.check_page(pid)
        try:
            r=self.client.post(f'https://graph.facebook.com/{self.version}/{pid}/photos',
                               headers={'Authorization':'Bearer '+token},
                               data={'caption':caption,'published':'true'},
                               files={'source':('match-day.png',png,'image/png')})
            d=r.json()
        except Exception:
            raise MetaUncertain('Réponse Meta incertaine : vérifiez la Page avant toute nouvelle tentative.') from None
        if r.status_code>=500:
            raise MetaUncertain('Erreur serveur Meta après un envoi possible : vérification requise.')
        if r.status_code!=200 or d.get('error'):
            code=(d.get('error') or {}).get('code')
            raise MetaRejected(f'Meta a refusé la publication (code {code if isinstance(code,int) else "inconnu"}). Vérifiez token et autorisations.')
        if not re.fullmatch(r'[0-9]+',str(d.get('id',''))) or not re.fullmatch(r'[0-9]+_[0-9]+',str(d.get('post_id',''))) or not str(d['post_id']).startswith(pid+'_'):
            raise MetaUncertain('Identifiants de publication manquants ou inattendus : contrôle Admin requis.',
                                {'id':str(d['id'])} if re.fullmatch(r'[0-9]+',str(d.get('id',''))) else {})
        return {**d,'url':'https://www.facebook.com/'+d['post_id']}

    def verify_post(self,pid,post_id):
        _,token=page_config(pid)
        if not re.fullmatch(re.escape(pid)+r'_[0-9]+',post_id):
            raise MetaRejected('Identifiant de post incompatible avec la Page.')
        try:
            r=self.client.get(f'https://graph.facebook.com/{self.version}/{post_id}',params={'fields':'id,created_time'},headers={'Authorization':'Bearer '+token})
            if r.status_code!=200 or r.json().get('id')!=post_id:
                raise MetaRejected('Post non vérifié par Meta.')
        except MetaRejected: raise
        except Exception: raise MetaRejected('Vérification Meta indisponible.') from None
