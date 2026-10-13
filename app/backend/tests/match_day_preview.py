"""Local-only synthetic source + real Match Day API/store. No Supabase/Meta calls."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from fastapi import FastAPI
from app.api import match_day_router as api
from app.services import match_day_source as source
fixture=json.loads(Path(os.environ['MATCH_DAY_FIXTURE']).read_text())
calendar=Path(os.environ['MATCH_DAY_CALENDAR'])
calendar.write_text(json.dumps({'events':fixture['events']}))
source.STATE_PATH=calendar

def load(db,season,stats_season):
    s=deepcopy(fixture);s['season']=season;s['stats_season']=stats_season;s['stats_label']='Championnat · Saison '+stats_season
    s['reference_at']=datetime.now(timezone.utc).isoformat()
    for t in s['teams']:
        for p in t['players']:
            p['dashboard']['season']['name']=stats_season
            if stats_season=='2028':p['dashboard']['meta']['has_data']=False
    return s
api.load_source=load
api.db=lambda:None
api.check_visibility=lambda db,s:None
app=FastAPI();app.include_router(api.router)
