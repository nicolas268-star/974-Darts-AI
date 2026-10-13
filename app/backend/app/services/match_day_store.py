"""Private transactional SQLite queue on the existing persistent backend volume."""
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from io import BytesIO
from pathlib import Path
from uuid import uuid4
import base64
import hashlib
import json
import os
import sqlite3
import fcntl
from PIL import Image


def now():
    return datetime.now(timezone.utc)


def iso(value=None):
    return (value or now()).isoformat()


def instant(value):
    d = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if d.tzinfo is None:
        raise ValueError('Un instant UTC ou avec fuseau est requis.')
    return d.astimezone(timezone.utc)


def png_bytes(value, size=None, maximum=10_000_000):
    if not isinstance(value, str) or not value.startswith('data:image/png;base64,') or len(value) > maximum * 4 // 3 + 100:
        raise ValueError('PNG invalide ou trop volumineux.')
    try:
        raw = base64.b64decode(value.split(',',1)[1], validate=True)
        if len(raw) > maximum:
            raise ValueError()
        with Image.open(BytesIO(raw)) as image:
            if image.format != 'PNG' or (size and image.size != size) or max(image.size) > 1920:
                raise ValueError()
            # Canvas outputs have no private text/EXIF metadata; reject rather than alter approved bytes.
            image.verify()
        with Image.open(BytesIO(raw)) as image:
            image.load()
            if any(k in image.info for k in ('exif','XML:com.adobe.xmp')) or getattr(image, 'text', {}):
                raise ValueError()
    except Exception:
        raise ValueError('PNG illisible, dimensions incompatibles ou métadonnées privées.') from None
    return raw


class Store:
    def __init__(self, path=None):
        self.path = Path(path or os.getenv('MATCH_DAY_DB_PATH', '/app/data/match_day.sqlite3'))
        self.path.parent.mkdir(parents=True, exist_ok=True)
        # Serialize schema/WAL initialization across API threads and worker processes.
        lock_path=self.path.with_suffix('.schema.lock')
        with lock_path.open('a') as lock:
            os.chmod(lock_path,0o600)
            fcntl.flock(lock,fcntl.LOCK_EX)
            with self.db() as c:
                c.executescript('''
              PRAGMA journal_mode=WAL;
              CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS drafts(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, snapshot TEXT NOT NULL, updated_at TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS versions(id TEXT PRIMARY KEY, draft_id TEXT NOT NULL, revision INTEGER NOT NULL,
                snapshot TEXT NOT NULL, png BLOB NOT NULL, sha256 TEXT NOT NULL, created_at TEXT NOT NULL,
                UNIQUE(draft_id,revision));
              CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id),
                draft_id TEXT NOT NULL, page_id TEXT NOT NULL, slot TEXT NOT NULL, identity TEXT NOT NULL,
                due_at TEXT NOT NULL, approved_at TEXT NOT NULL, state TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                started_at TEXT, error TEXT, remote_id TEXT, remote_photo_id TEXT, remote_url TEXT, sent_at TEXT);
              CREATE UNIQUE INDEX IF NOT EXISTS match_day_active_slot ON jobs(identity,page_id,slot)
                WHERE state NOT IN ('CANCELLED');
              CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, subject TEXT NOT NULL, action TEXT NOT NULL,
                actor TEXT NOT NULL, at TEXT NOT NULL, details TEXT NOT NULL);
              PRAGMA user_version=1;
            ''')
        os.chmod(self.path, 0o600)
        for suffix in ('-wal','-shm'):
            companion=Path(str(self.path)+suffix)
            if companion.exists():os.chmod(companion,0o600)

    @contextmanager
    def db(self):
        c = sqlite3.connect(self.path, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute('PRAGMA foreign_keys=ON')
        try:
            c.execute('BEGIN IMMEDIATE')
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()

    def audit(self, c, subject, action, actor, details=None):
        c.execute('INSERT INTO audit(subject,action,actor,at,details) VALUES(?,?,?,?,?)',
                  (subject, action, actor, iso(), json.dumps(details or {}, ensure_ascii=False)))

    def source(self, payload):
        sid = str(uuid4())
        with self.db() as c:
            c.execute('INSERT INTO sources VALUES(?,?)', (sid, json.dumps(payload, ensure_ascii=False)))
        return {**payload, 'source_id': sid}

    def get_source(self, sid):
        with self.db() as c:
            row = c.execute('SELECT payload FROM sources WHERE id=?', (sid,)).fetchone()
        if not row:
            raise ValueError('Source absente. Rechargez les effectifs.')
        return json.loads(row[0])

    def save(self, snapshot, actor, draft_id=None, revision=0):
        did = draft_id or str(uuid4())
        with self.db() as c:
            old = c.execute('SELECT * FROM drafts WHERE id=?', (did,)).fetchone()
            if (old and old['revision'] != revision) or (not old and revision):
                raise ValueError('Brouillon modifié ailleurs. Rechargez-le.')
            sending = c.execute("SELECT 1 FROM jobs WHERE draft_id=? AND state IN ('SENDING','VERIFY')", (did,)).fetchone()
            if sending:
                raise ValueError('Envoi en cours ou résultat incertain : vérifiez la publication avant de modifier.')
            rev = (old['revision'] if old else 0) + 1
            c.execute('INSERT OR REPLACE INTO drafts VALUES(?,?,?,?)', (did,rev,json.dumps(snapshot,ensure_ascii=False),iso()))
            c.execute("UPDATE jobs SET state='SUSPENDED',error='Contenu modifié : nouvelle validation requise.' WHERE draft_id=? AND state IN ('SCHEDULED','REVIEW')", (did,))
            self.audit(c,did,'EDIT' if old else 'CREATE',actor,{'revision':rev})
        return {'id':did,'revision':rev,'snapshot':snapshot}

    def approve(self, did, revision, snapshot, png, actor):
        raw = png_bytes(png,(1080,1920 if snapshot['format']=='story' else 1350))
        digest = hashlib.sha256(raw).hexdigest()
        with self.db() as c:
            draft = c.execute('SELECT * FROM drafts WHERE id=?',(did,)).fetchone()
            if not draft or draft['revision'] != revision or json.loads(draft['snapshot']) != snapshot:
                raise ValueError('Le brouillon a changé. Enregistrez puis validez la version courante.')
            existing = c.execute('SELECT id,sha256 FROM versions WHERE draft_id=? AND revision=?',(did,revision)).fetchone()
            if existing:
                if existing['sha256'] != digest:
                    raise ValueError('Cette version possède déjà un autre PNG. Créez une nouvelle révision.')
                return {'version_id':existing['id'],'sha256':digest}
            vid = str(uuid4())
            c.execute('INSERT INTO versions VALUES(?,?,?,?,?,?,?)',(vid,did,revision,json.dumps(snapshot,ensure_ascii=False),raw,digest,iso()))
            self.audit(c,vid,'APPROVE',actor,{'sha256':digest,'revision':revision})
        return {'version_id':vid,'sha256':digest}

    def version(self, vid):
        with self.db() as c:
            row = c.execute('SELECT * FROM versions WHERE id=?',(vid,)).fetchone()
        if not row:
            raise ValueError('Version introuvable.')
        return {**dict(row),'snapshot':json.loads(row['snapshot'])}

    def schedule(self, vid, page_id, due_at, slot, actor, immediate=False):
        v = self.version(vid)
        due = now() if immediate else instant(due_at)
        check_deadline(v['snapshot'], due)
        if not immediate and due <= now():
            raise ValueError('La publication ne peut pas être programmée dans le passé.')
        if slot not in ('announcement','reminder-1','reminder-2'):
            raise ValueError('Créneau éditorial invalide.')
        identity = (v['snapshot'].get('event') or {}).get('id') or v['draft_id']
        jid = str(uuid4())
        with self.db() as c:
            d = c.execute('SELECT revision FROM drafts WHERE id=?',(v['draft_id'],)).fetchone()
            if not d or d[0] != v['revision']:
                raise ValueError('Version devenue obsolète.')
            prior = c.execute("SELECT * FROM jobs WHERE identity=? AND page_id=? AND slot=? AND state!='CANCELLED'",(identity,page_id,slot)).fetchone()
            if prior:
                # Idempotent exact retry only. Revisions cannot bypass the editorial identity.
                if prior['version_id']==vid and prior['state']=='SCHEDULED' and prior['due_at']==iso(due):
                    return dict(prior)
                raise ValueError('Ce créneau possède déjà une publication. Annulez ou vérifiez la tâche existante.')
            c.execute('INSERT INTO jobs(id,version_id,draft_id,page_id,slot,identity,due_at,approved_at,state) VALUES(?,?,?,?,?,?,?,?,?)',
                      (jid,vid,v['draft_id'],page_id,slot,identity,iso(due),iso(),'SCHEDULED'))
            self.audit(c,jid,'SCHEDULE',actor,{'version_id':vid,'page_id':page_id,'due_at':iso(due),'slot':slot})
        return {'id':jid,'state':'SCHEDULED'}

    def cancel(self,jid,actor):
        with self.db() as c:
            row = c.execute('SELECT * FROM jobs WHERE id=?',(jid,)).fetchone()
            if not row or row['state'] not in ('SCHEDULED','SUSPENDED','FAILED','REVIEW'):
                raise ValueError('Cette tâche ne peut pas être annulée. Un post publié ou incertain nécessite une vérification distincte.')
            c.execute("UPDATE jobs SET state='CANCELLED' WHERE id=?",(jid,))
            self.audit(c,jid,'CANCEL',actor)
        return {'id':jid,'state':'CANCELLED'}

    def resolve(self,jid,actor,remote_id=None):
        with self.db() as c:
            row=c.execute('SELECT * FROM jobs WHERE id=?',(jid,)).fetchone()
            if not row or row['state']!='VERIFY':
                raise ValueError('Cette publication ne nécessite pas de réconciliation.')
            # Absence of a remote post is not proof it was never sent: retain the identity lock.
            state='PUBLISHED' if remote_id else 'VERIFY'
            c.execute('UPDATE jobs SET state=?,remote_id=?,remote_url=?,error=? WHERE id=?',
                      (state,remote_id,'https://www.facebook.com/'+remote_id if remote_id else None,
                       None if remote_id else 'Contrôle Admin : aucun post retrouvé. Anti-doublon conservé.',jid))
            self.audit(c,jid,'RECONCILE',actor,{'remote_id':remote_id})
        return {'state':state}

    def claim(self):
        with self.db() as c:
            stale=iso(now()-timedelta(minutes=5))
            rows=c.execute("SELECT id FROM jobs WHERE state='SENDING' AND started_at<?",(stale,)).fetchall()
            for row in rows:
                c.execute("UPDATE jobs SET state='VERIFY',error='Worker interrompu après un envoi possible : contrôle requis.' WHERE id=?",(row[0],))
                self.audit(c,row[0],'VERIFY','worker')
            row=c.execute("SELECT * FROM jobs WHERE state='SCHEDULED' AND due_at<=? ORDER BY due_at LIMIT 1",(iso(),)).fetchone()
            if not row:
                return None
            c.execute("UPDATE jobs SET state='SENDING',attempts=attempts+1,started_at=? WHERE id=?",(iso(),row['id']))
            self.audit(c,row['id'],'CLAIM','worker')
            return dict(row)

    def finish(self,jid,state,error=None,remote=None):
        if state not in ('PUBLISHED','FAILED','SUSPENDED','VERIFY'):
            raise ValueError('État terminal invalide.')
        remote=remote or {}
        with self.db() as c:
            c.execute("UPDATE jobs SET state=?,error=?,remote_id=?,remote_photo_id=?,remote_url=?,sent_at=? WHERE id=? AND state='SENDING'",
                      (state,error,remote.get('post_id'),remote.get('id'),remote.get('url'),iso() if state=='PUBLISHED' else None,jid))
            self.audit(c,jid,state,'worker',{'error':error,'remote_id':remote.get('post_id')})

    def history(self):
        with self.db() as c:
            drafts=[{**dict(r),'snapshot':json.loads(r['snapshot'])} for r in c.execute('SELECT * FROM drafts ORDER BY updated_at DESC LIMIT 100')]
            jobs=[dict(r) for r in c.execute('SELECT * FROM jobs ORDER BY approved_at DESC LIMIT 200')]
            versions=[dict(r) for r in c.execute('SELECT id,draft_id,revision,sha256,created_at FROM versions ORDER BY created_at DESC LIMIT 200')]
            audit=[dict(r) for r in c.execute('SELECT * FROM audit ORDER BY id DESC LIMIT 200')]
        return {'drafts':drafts,'jobs':jobs,'versions':versions,'audit':audit}


def check_deadline(snapshot,due):
    match=snapshot['match']
    if not match.get('date'):
        raise ValueError('Date de rencontre requise pour la diffusion.')
    # Unknown hour: conservative midnight cutoff; no announcement after match day starts.
    deadline=instant(match['date']+'T'+(match.get('time') or '00:00')+':00+04:00')
    if due >= deadline:
        raise ValueError('Annonce trop tardive. Avec une heure inconnue, programmez avant le jour du match.')
    caption=snapshot['caption'].casefold()
    local_due=due.astimezone(timezone(timedelta(hours=4)))
    if ('aujourd’hui' in caption or "aujourd'hui" in caption or 'ce soir' in caption) and local_due.date().isoformat()!=match['date']:
        raise ValueError('La formulation Aujourd’hui/Ce soir ne correspond pas à la date de publication.')
    if 'ce soir' in caption and (not match.get('time') or match['time']<'18:00'):
        raise ValueError('Ce soir nécessite une rencontre avec une heure du soir confirmée.')
