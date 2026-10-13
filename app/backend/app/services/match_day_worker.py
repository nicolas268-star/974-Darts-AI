"""Persistent internal scheduling authority; bounded one-attempt sends, fail closed."""
import hashlib
import os
import time
from datetime import timedelta
from .match_day_store import Store, now, instant, check_deadline
from .match_day_source import check_event, check_visibility
from .match_day_meta import MetaAdapter, MetaRejected, MetaUncertain, enabled


def process_one(store,adapter,verify_visibility):
    job=store.claim()
    if not job: return False
    try:
        v=store.version(job['version_id'])
        if instant(job['due_at']) < now()-timedelta(minutes=15):
            raise ValueError('Échéance périmée après interruption : annonce suspendue.')
        check_deadline(v['snapshot'],now())
        check_event(v['snapshot'])
        verify_visibility(v['snapshot'])
        if hashlib.sha256(v['png']).hexdigest()!=v['sha256']:
            raise ValueError('Intégrité du PNG invalide.')
        if not enabled() or os.getenv('MATCH_DAY_ENABLED')!='true':
            raise ValueError('Studio ou diffusion désactivé : nouvelle validation requise.')
        result=adapter.publish(job['page_id'],v['png'],v['snapshot']['caption'])
        store.finish(job['id'],'PUBLISHED',remote=result)
    except MetaUncertain as e: store.finish(job['id'],'VERIFY',str(e),remote=e.remote)
    except MetaRejected as e: store.finish(job['id'],'FAILED',str(e))
    except ValueError as e: store.finish(job['id'],'SUSPENDED',str(e))
    except Exception: store.finish(job['id'],'VERIFY','Incident inattendu : envoi possible, contrôle requis.')
    return True


def run():
    from supabase import create_client
    from app.config import settings
    store=Store()
    adapter=MetaAdapter()
    while True:
        if os.getenv('MATCH_DAY_ENABLED')=='true':
            db=create_client(settings.supabase_url,settings.supabase_service_role_key)
            # Inspect changes even before the due time, retaining published posts for editorial follow-up.
            for job in store.history()['jobs']:
                if job['state']=='SCHEDULED':
                    try: check_event(store.version(job['version_id'])['snapshot'])
                    except Exception:
                        with store.db() as c:
                            c.execute("UPDATE jobs SET state='SUSPENDED',error='Calendrier modifié ou indisponible : nouvelle validation requise.' WHERE id=? AND state='SCHEDULED'",(job['id'],))
                            store.audit(c,job['id'],'SUSPEND','worker')
            try: process_one(store,adapter,lambda s:check_visibility(db,s))
            except Exception: print('Match Day : incident de file, reprise au prochain cycle.',flush=True)
        time.sleep(15)


if __name__=='__main__': run()
